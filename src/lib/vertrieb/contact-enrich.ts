// Vertriebskontakte maximal anreichern (Ole, 12.11.2026):
//  1. Website/Agenturseite (ohne KI): Adresse, Telefon, Fax, Öffnungszeiten, Social-Links,
//     Inhaber laut Impressum, Versicherer bzw. Makler, Teamgröße (nur wenn eindeutig).
//  2. Google Places API (New): Bewertung, Anzahl, Öffnungszeiten, Maps-Link, Betriebsstatus;
//     Adresse/Telefon/Website nur wenn leer. Nur mit GOOGLE_PLACES_API_KEY, gedeckelt je Tag.
// Regel: nur leere Felder füllen. Ausnahme Bewertung und Öffnungszeiten aus Google (frischer),
// Öffnungszeiten aber nur, wenn sie leer sind oder selbst aus einer automatischen Quelle stammen.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchHtml, fetchImpressumText, htmlToText, normalizeUrl } from "@/lib/impressum";
import { enrichmentSourceUrl, extractAddress, needsAddress } from "@/lib/vertrieb/address-enrich";
import { backfillPhonesFromMail } from "@/lib/vertrieb/signature-phone";

const DAY = 86400000;
// 30 Tage: Google Maps Platform erlaubt nur kurzfristiges Zwischenspeichern von Places-Inhalten
export const GOOGLE_REFRESH_DAYS = 30;
const WEB_RETRY_DAYS = 30;

// ─── Website auswerten (reine Funktionen, testbar) ─────────────────────────

const WEEKDAY = /\b(Mo|Di|Mi|Do|Fr|Sa|So)(?:ntag|nstag|ttwoch|nnerstag|eitag|mstag|nnabend|nntag)?\b\.?/i;
const TIME = /\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s?Uhr\b|geschlossen|nach Vereinbarung/i;
const HOURS_HEAD = /(Öffnungszeiten|Oeffnungszeiten|Bürozeiten|Sprechzeiten|Geschäftszeiten|Servicezeiten)/i;

/** Öffnungszeiten-Block: Überschrift + folgende Zeilen mit Wochentag und Uhrzeit (eine Zeile je Eintrag). */
export function extractOpeningHours(text: string): string | null {
  const lines = text.split(/\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (!HOURS_HEAD.test(lines[i])) continue;
    const out: string[] = [];
    // Überschrift kann selbst schon Zeiten enthalten („Öffnungszeiten: Mo–Fr 9–17 Uhr“)
    const rest = lines[i].replace(/^.*?(Öffnungszeiten|Oeffnungszeiten|Bürozeiten|Sprechzeiten|Geschäftszeiten|Servicezeiten)\s*:?\s*/i, "");
    if (rest && WEEKDAY.test(rest) && TIME.test(rest)) out.push(rest);
    for (let j = i + 1; j < Math.min(lines.length, i + 12) && out.length < 8; j++) {
      const l = lines[j];
      if (l.length > 80) break;
      if (WEEKDAY.test(l) && TIME.test(l)) out.push(l);
      else if (WEEKDAY.test(l) && j + 1 < lines.length && TIME.test(lines[j + 1]) && !WEEKDAY.test(lines[j + 1])) {
        out.push(`${l} ${lines[j + 1]}`);
        j++;
      } else if (/^(und|sowie|termine?|gerne|außerhalb|nach vereinbarung)/i.test(l)) {
        out.push(l);
      } else if (out.length) break;
    }
    if (out.length) return out.join("\n").slice(0, 500);
  }
  return null;
}

/** Konzern-Seiten der Versicherer sind keine Agentur-Profile. */
const CORPORATE_SOCIAL = /allianz|axa|signal|iduna|ergo|generali|ruv|r\+v|devk|huk|zurich|gothaer|lvm|provinzial|wwk|debeka|hdi|continentale|barmenia|nuernberger|nürnberger|alteleipziger|alte-leipziger|swisslife|dvag|sharer|share|intent|plugins|dialog|hashtag|\/tr\b/i;

export type Socials = { facebookUrl: string | null; instagramUrl: string | null; xingUrl: string | null; linkedinUrl: string | null };

/** Social-Links der Agentur aus dem HTML (ohne Teilen-Knöpfe und Konzern-Profile). */
export function extractSocials(html: string): Socials {
  const out: Socials = { facebookUrl: null, instagramUrl: null, xingUrl: null, linkedinUrl: null };
  for (const m of html.matchAll(/href\s*=\s*["'](https?:\/\/[^"'\s]+)["']/gi)) {
    let u: URL;
    try {
      u = new URL(m[1]);
    } catch {
      continue;
    }
    const host = u.hostname.replace(/^(www|de|m)\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    if (!path || path === "/" || CORPORATE_SOCIAL.test(path) || CORPORATE_SOCIAL.test(u.search)) continue;
    const clean = `${u.protocol}//${u.hostname}${path}`;
    if (!out.facebookUrl && host === "facebook.com") out.facebookUrl = clean;
    else if (!out.instagramUrl && host === "instagram.com") out.instagramUrl = clean;
    else if (!out.xingUrl && host === "xing.com" && /^\/(profile|pages|companies)\//.test(path)) out.xingUrl = clean;
    else if (!out.linkedinUrl && host === "linkedin.com" && /^\/(in|company)\//.test(path)) out.linkedinUrl = clean;
  }
  return out;
}

const FAX = /(?:Telefax|Fax)\.?\s*[:.]?\s*(\+?\d[\d\s/()\-–.]{5,24}\d)/i;

export function extractFax(text: string): string | null {
  for (const l of text.split(/\n/)) {
    const m = l.match(FAX);
    if (m && m[1].replace(/\D/g, "").length >= 6) return m[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

const NAME_WORD = /^(?:Dr\.|Prof\.|Dipl\.-\w+\.?|[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?|von|van|de|zu)$/;
const isPersonName = (s: string) => {
  const w = s.trim().split(/\s+/);
  return w.length >= 2 && w.length <= 5 && w.every((x) => NAME_WORD.test(x)) && /[A-ZÄÖÜ][a-zäöüß]+$/.test(s.trim());
};

/** Inhaber bzw. Geschäftsführer laut Impressum (nur echte Personennamen). */
/** Impressum eines Versicherungskonzerns (nicht der Agentur): Vorstand oder Aufsichtsrat genannt. */
export function isCorporateImprint(text: string): boolean {
  return /aufsichtsrat|vorsitzende[rn]? des vorstand|^\s*vorstand\s*:?/im.test(text);
}

export function extractLeaders(text: string): string | null {
  const lines = text.split(/\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const found: string[] = [];
  const LABEL = /^(?:Inhaber(?:in)?|Geschäftsführer(?:in)?|Geschäftsführung|Vertreten durch|Vertretungsberechtigt(?:e[rn]?)?|Agenturinhaber(?:in)?)\s*:?\s*(.*)$/i;
  for (let i = 0; i < lines.length && found.length < 3; i++) {
    const m = lines[i].match(LABEL);
    if (!m) continue;
    const raw = (m[1] || lines[i + 1] || "").replace(/\(.*?\)/g, "");
    for (const part of raw.split(/,|\bund\b|&|;/)) {
      const name = part.replace(/^(Herr|Frau)\s+/i, "").replace(/[.:]+$/, "").trim();
      if (isPersonName(name) && !found.includes(name)) found.push(name);
    }
  }
  return found.length ? found.join(", ").slice(0, 200) : null;
}

const INSURERS: [RegExp, string][] = [
  [/\ballianz\b/i, "Allianz"],
  [/\baxa\b/i, "AXA"],
  [/signal[\s-]?iduna/i, "Signal Iduna"],
  [/\bergo\b/i, "ERGO"],
  [/\bgenerali\b/i, "Generali"],
  [/\bR\+V\b|\bruv\b/i, "R+V"],
  [/\bdevk\b/i, "DEVK"],
  [/\bhuk[\s-]?coburg\b|\bhuk\b/i, "HUK-COBURG"],
  [/\bzurich\b/i, "Zurich"],
  [/\bgothaer\b/i, "Gothaer"],
  [/\blvm\b/i, "LVM"],
  [/\bprovinzial\b/i, "Provinzial"],
  [/\bwwk\b/i, "WWK"],
  [/\bdebeka\b/i, "Debeka"],
  [/\bhdi\b/i, "HDI"],
  [/\bcontinentale\b/i, "Continentale"],
  [/\bbarmenia\b/i, "Barmenia"],
  [/n[üu]rnberger/i, "Nürnberger"],
  [/alte[\s-]?leipziger/i, "Alte Leipziger"],
  [/\bswiss\s?life\b/i, "Swiss Life"],
  [/\bdvag\b|deutsche verm[öo]gensberatung/i, "DVAG"],
];

const DOMAIN_INSURER: Record<string, string> = {
  "allianz.de": "Allianz", "axa.de": "AXA", "axa-betreuer.de": "AXA", "signal-iduna.de": "Signal Iduna", "signal-iduna.net": "Signal Iduna",
  "ergo.de": "ERGO", "generali.de": "Generali", "ruv.de": "R+V", "devk.de": "DEVK", "huk.de": "HUK-COBURG", "zurich.de": "Zurich",
  "gothaer.de": "Gothaer", "lvm.de": "LVM", "provinzial.de": "Provinzial", "wwk.de": "WWK", "debeka.de": "Debeka", "hdi.de": "HDI",
  "dvag.de": "DVAG", "dvag.com": "DVAG",
};

/** Versicherer bzw. „Makler“: E-Mail-Domain zuerst, sonst Impressum (Status nach § 34d). */
export function detectInsurer(text: string, email?: string | null): string | null {
  const domain = email?.split("@")[1]?.toLowerCase().trim();
  if (domain && DOMAIN_INSURER[domain]) return DOMAIN_INSURER[domain];
  const bound = /gebundene[rn]?\s+Versicherungsvertreter|Ausschlie(ß|ss)lichkeitsvertret|Versicherungsvertreter(in)?\s+nach\s+§\s*34d\s*Abs\.?\s*7/i.test(text);
  if (!bound && /Versicherungsmakler|§\s*34d\s*Abs\.?\s*1\b|als\s+Makler/i.test(text)) return "Makler";
  // Gebundener Vertreter: erster genannter Versicherer im Impressum
  let best: { at: number; name: string } | null = null;
  for (const [re, name] of INSURERS) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.at)) best = { at: m.index, name };
  }
  return bound || best ? best?.name ?? null : null;
}

/** Teamgröße nur aus eindeutigen Formulierungen („Team aus 6 Mitarbeitern“, „12 Mitarbeiter“). */
export function extractTeamSize(text: string): number | null {
  const m = text.match(/(?:Team\s+(?:aus|von)\s+)?(\d{1,3})\s+(?:Mitarbeiter(?:innen|n)?|Kolleg(?:innen|en)|Beschäftigte[n]?)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 300 ? n : null;
}

export type WebDetails = {
  openingHours: string | null;
  fax: string | null;
  leaderNames: string | null;
  insurer: string | null;
  teamSize: number | null;
} & Socials;

export function extractWebDetails(input: { homeHtml: string; homeText: string; impressumText: string; email?: string | null }): WebDetails {
  const all = `${input.homeText}\n${input.impressumText}`;
  return {
    openingHours: extractOpeningHours(input.homeText) ?? extractOpeningHours(input.impressumText),
    fax: extractFax(input.impressumText) ?? extractFax(input.homeText),
    leaderNames: extractLeaders(input.impressumText),
    insurer: detectInsurer(input.impressumText || all, input.email),
    teamSize: extractTeamSize(input.homeText),
    ...extractSocials(input.homeHtml),
  };
}

// ─── Google Places (New) ──────────────────────────────────────────────────

export type Place = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  businessStatus?: string;
};

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.rating",
  "places.userRatingCount",
  "places.regularOpeningHours.weekdayDescriptions",
  "places.businessStatus",
].join(",");

export const placesKey = () => process.env.GOOGLE_PLACES_API_KEY?.trim() || null;
export const placesDailyLimit = () => {
  const n = Number(process.env.GOOGLE_PLACES_MAX_PER_DAY ?? 200);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 200;
};
const today = () => new Date().toISOString().slice(0, 10);

/** Eine Anfrage aus dem Tageskontingent nehmen (atomar). false = Limit erreicht. */
export async function reservePlacesCall(): Promise<boolean> {
  const limit = placesDailyLimit();
  if (limit <= 0) return false;
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "PlacesUsage" ("day", "count") VALUES (${today()}, 1)
    ON CONFLICT ("day") DO UPDATE SET "count" = "PlacesUsage"."count" + 1
    WHERE "PlacesUsage"."count" < ${limit}
    RETURNING "count"`;
  return rows.length > 0;
}

/** Fehlgeschlagene Abfrage (z. B. 403 ohne Abrechnung) nicht aufs Tageskontingent anrechnen. */
export async function releasePlacesCall(): Promise<void> {
  await prisma.$executeRaw`UPDATE "PlacesUsage" SET "count" = GREATEST("count" - 1, 0) WHERE "day" = ${today()}`;
}

export async function placesUsedToday(): Promise<number> {
  return (await prisma.placesUsage.findUnique({ where: { day: today() } }))?.count ?? 0;
}

export async function searchPlace(query: string, timeoutMs = 8000): Promise<Place[]> {
  const key = placesKey();
  if (!key) return [];
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({ textQuery: query, languageCode: "de", regionCode: "DE", pageSize: 3 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Google Places ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = (await res.json()) as { places?: Place[] };
  return data.places ?? [];
}

type ContactForMatch = {
  name: string;
  email: string;
  url: string | null;
  phone: string | null;
  zip: string | null;
  city: string | null;
  firstName: string | null;
  lastName: string | null;
  insurer: string | null;
};

const norm = (s: string) =>
  s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, " ").trim();
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^49/, "0");

/** Suchtext: Agentur/Firma + Ort, sonst Name + Versicherer + PLZ. */
export function placeQuery(c: ContactForMatch): string | null {
  const name = c.name.trim();
  const person = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  if (name && c.city) return `${name} ${c.city}`;
  if (person && c.zip) return [person, c.insurer, c.zip].filter(Boolean).join(" ");
  if (name && c.zip) return `${name} ${c.zip}`;
  // Ausschließlichkeitsvertreter ohne Ort: Versicherer + Vor- und Nachname (Zuordnung nur bei vollem Namen + Versicherer im Eintrag)
  const full = personName(c);
  if (c.insurer && full) return `${c.insurer} ${full}`;
  return null; // ohne Ort/PLZ zu unsicher
}

const component = (p: Place, type: string) => p.addressComponents?.find((a) => a.types?.includes(type))?.longText ?? null;

function hostOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const u = normalizeUrl(raw);
  return u ? `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "").toLowerCase()}` : null;
}

const NAME_NOISE = new Set(
  "allianz axa ergo generali signal iduna devk ruv r v dvag zurich gothaer huk lvm provinzial versicherung versicherungen versicherungsbuero buero agentur generalvertretung hauptvertretung vertretung geschaeftsstelle gmbh ohg kg co und die der das fuer finanz finanzen service team makler".split(" "),
);

/** Vor- und Nachname: Felder, sonst E-Mail vorname.nachname@…, sonst zweiteiliger Kontaktname. */
export function personName(c: Pick<ContactForMatch, "firstName" | "lastName" | "name" | "email">): string | null {
  if (c.firstName?.trim() && c.lastName?.trim()) return `${c.firstName.trim()} ${c.lastName.trim()}`;
  const parts = (c.email.split("@")[0] ?? "").toLowerCase().split(/[._-]/).filter(Boolean);
  if (parts.length === 2 && parts.every((p) => /^[a-zäöüß]{2,}$/.test(p))) return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
  const words = c.name.trim().split(/\s+/).filter((w) => !NAME_NOISE.has(norm(w)));
  return words.length === 2 ? words.join(" ") : null;
}

/** Nachname: Feld lastName, sonst aus dem Kontaktnamen oder der E-Mail (vorname.nachname@…). */
export function lastNameCandidates(c: Pick<ContactForMatch, "lastName" | "name" | "email">): string[] {
  const out = new Set<string>();
  const add = (v: string | null | undefined) => {
    const n = norm(v ?? "");
    if (n.length >= 3 && !NAME_NOISE.has(n)) out.add(n);
  };
  add(c.lastName?.trim().split(/\s+/).pop());
  const words = norm(c.name).split(" ").filter((w) => w && !NAME_NOISE.has(w));
  if (words.length >= 2) add(words[words.length - 1]);
  const local = (c.email.split("@")[0] ?? "").toLowerCase();
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length === 2 && /^[a-zäöüß]+$/.test(parts[1])) add(parts[1]);
  return [...out];
}

/** Passt der Google-Treffer sicher zum Kontakt? Bei Zweifel nein. */
export function isPlausible(p: Place, c: ContactForMatch): boolean {
  // 1. Website gleich (Domain bzw. Agentur-Unterseite)
  const site = hostOf(p.websiteUri);
  const own = hostOf(c.url) ?? hostOf(enrichmentSourceUrl({ url: c.url, email: c.email }));
  if (site && own) {
    const [sHost, ...sPath] = site.split("/");
    const [oHost, ...oPath] = own.split("/");
    const generic = /(^|\.)(allianz|axa|axa-betreuer|signal-iduna|ergo|generali|ruv|devk|dvag)\.(de|com|net)$/.test(sHost);
    if (sHost === oHost && (!generic || (sPath.join("/") && sPath.join("/") === oPath.join("/")))) return true;
  }
  // 2. Telefonnummer gleich (letzte 7 Ziffern)
  const a = digits(p.nationalPhoneNumber);
  const b = digits(c.phone);
  if (a.length >= 7 && b.length >= 7 && a.slice(-7) === b.slice(-7)) return true;
  // 3. Nachname im Namen des Eintrags und Ort/PLZ passt
  const title = norm(p.displayName?.text ?? "").split(" ");
  if (lastNameCandidates(c).some((l) => title.includes(l))) {
    const zip = component(p, "postal_code");
    const city = component(p, "locality");
    const addr = norm(p.formattedAddress ?? "");
    const cityOk = (a: string | null | undefined, b: string | null | undefined) => {
      const x = norm(a ?? "");
      const y = norm(b ?? "");
      return !!x && !!y && (x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `));
    };
    if (c.zip && (zip === c.zip.trim() || addr.split(" ").includes(c.zip.trim()))) return true;
    if (c.city && (cityOk(c.city, city) || (norm(c.city).length >= 4 && ` ${addr} `.includes(` ${norm(c.city)} `)))) return true;
  }
  // 4. Vor- und Nachname plus Versicherer im Namen des Eintrags (z. B. „SIGNAL IDUNA Versicherung Jens Sajdev“)
  const full = personName(c);
  // Nur ohne bekannten Ort – ist ein Ort hinterlegt, muss Regel 3 (Ort/PLZ) passen.
  if (full && c.insurer && !c.city?.trim() && !c.zip?.trim()) {
    const words = norm(full).split(" ");
    const ins = norm(c.insurer).split(" ").filter((w) => w.length >= 3);
    if (words.length >= 2 && words.every((w) => title.includes(w)) && ins.length && ins.every((w) => title.includes(w))) return true;
  }
  return false;
}

// ─── Anreichern ──────────────────────────────────────────────────────────

type EnrichmentLog = {
  website?: { at: string; url: string | null; fields: string[] };
  google?: { at: string; placeId: string | null; fields: string[]; status: string };
  openingHoursSource?: "website" | "google";
};

const LABEL: Record<string, string> = {
  street: "Straße", zip: "PLZ", city: "Ort", phone: "Telefon", fax: "Fax", url: "Website", openingHours: "Öffnungszeiten",
  leaderNames: "Inhaber", insurer: "Versicherer", teamSize: "Teamgröße", facebookUrl: "Facebook", instagramUrl: "Instagram",
  xingUrl: "XING", linkedinUrl: "LinkedIn", ratingValue: "Google-Bewertung", googleMapsUrl: "Google Maps", businessStatus: "Betriebsstatus",
};

const empty = (v: unknown) => v == null || (typeof v === "string" && !v.trim());

export type ContactEnrichResult = { web: string; google: string; fields: string[] };

const SELECT = {
  id: true, name: true, email: true, url: true, phone: true, fax: true, street: true, zip: true, city: true, firstName: true, lastName: true,
  leaderNames: true, insurer: true, teamSize: true, openingHours: true, facebookUrl: true, instagramUrl: true, xingUrl: true, linkedinUrl: true,
  ratingValue: true, ratingCount: true, googlePlaceId: true, googleMapsUrl: true, businessStatus: true, webEnrichAt: true, googleCheckedAt: true,
  addressEnrichTriedAt: true, enrichment: true,
} as const;

type Row = Prisma.SalesContactGetPayload<{ select: typeof SELECT }>;

/** Website-Stufe: einmal je Kontakt (erneut nach 30 Tagen, wenn die Adresse noch fehlt). */
async function webStep(c: Row, log: EnrichmentLog, force: boolean): Promise<{ status: string; data: Prisma.SalesContactUpdateInput; fields: string[] }> {
  const due = force || !c.webEnrichAt || ((needsAddress(c) || empty(c.phone)) && c.webEnrichAt.getTime() < Date.now() - WEB_RETRY_DAYS * DAY);
  if (!due) return { status: "skipped", data: {}, fields: [] };
  const sourceUrl = enrichmentSourceUrl(c);
  const data: Prisma.SalesContactUpdateInput = { webEnrichAt: new Date(), addressEnrichTriedAt: c.addressEnrichTriedAt ?? new Date() };
  if (!sourceUrl) return { status: "no-source", data, fields: [] };
  const page = await fetchImpressumText(sourceUrl, { timeoutMs: 8000 });
  const impressumText = "error" in page ? "" : page.text;
  const homeText = page.homeText ?? "";
  let homeHtml = page.homeHtml ?? "";
  if (!homeText && !impressumText) return { status: "not-found", data, fields: [] };

  let details = extractWebDetails({ homeHtml, homeText, impressumText, email: c.email });
  // Öffnungszeiten fehlen: höchstens eine weitere Seite (Kontakt/Öffnungszeiten) lesen
  if (!details.openingHours && page.links?.length) {
    const base = normalizeUrl(sourceUrl);
    const extra = page.links.find((l) => {
      try {
        return new URL(l.href).hostname === base?.hostname && /kontakt|oeffnungszeiten|öffnungszeiten|anfahrt/i.test(`${l.href} ${l.text}`);
      } catch {
        return false;
      }
    });
    const html = extra ? await fetchHtml(extra.href, 6000) : null;
    if (html) {
      homeHtml = `${homeHtml}\n${html.slice(0, 200_000)}`;
      const more = extractWebDetails({ homeHtml, homeText: htmlToText(html), impressumText: "", email: c.email });
      details = { ...more, ...Object.fromEntries(Object.entries(details).filter(([, v]) => v != null)) } as WebDetails;
    }
  }
  const address = extractAddress(impressumText || homeText);
  const homeAddr = !address.zip && homeText ? extractAddress(homeText) : null;
  const found: Record<string, string | number | null> = {
    street: address.street ?? homeAddr?.street ?? null,
    zip: address.zip ?? homeAddr?.zip ?? null,
    city: address.city ?? homeAddr?.city ?? null,
    phone: address.phone ?? homeAddr?.phone ?? null,
    ...details,
  };
  // Konzern-Impressum (Vorstand/Aufsichtsrat) statt Agentur: keine Adresse, kein Fax, keine „Inhaber“
  if (isCorporateImprint(impressumText)) {
    for (const k of ["street", "zip", "city", "phone", "fax", "leaderNames"]) found[k] = null;
  }
  const fields: string[] = [];
  const cur = c as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(found)) {
    if (v == null || v === "") continue;
    if (!empty(cur[k])) continue;
    (data as Record<string, unknown>)[k] = typeof v === "string" ? v.slice(0, k === "openingHours" ? 500 : 300) : v;
    fields.push(k);
  }
  if (fields.includes("openingHours")) log.openingHoursSource = "website";
  if (fields.some((f) => ["street", "zip", "city", "phone"].includes(f))) data.addressEnrichedAt = new Date();
  log.website = { at: new Date().toISOString(), url: "error" in page ? sourceUrl : page.impressumUrl, fields };
  return { status: fields.length ? "updated" : "nothing-new", data, fields };
}

/** Google-Stufe: alle 30 Tage, nur mit Schlüssel und Tageskontingent. */
async function googleStep(c: Row, log: EnrichmentLog, force: boolean): Promise<{ status: string; data: Prisma.SalesContactUpdateInput; fields: string[]; closed: boolean }> {
  const none = { data: {}, fields: [] as string[], closed: false };
  if (!placesKey()) return { status: "no-key", ...none };
  const due = force || !c.googleCheckedAt || c.googleCheckedAt.getTime() < Date.now() - GOOGLE_REFRESH_DAYS * DAY;
  if (!due) return { status: "skipped", ...none };
  const query = placeQuery(c);
  if (!query) return { status: "no-query", data: { googleCheckedAt: new Date() }, fields: [], closed: false };
  if (!(await reservePlacesCall())) return { status: "limit", ...none };
  let places: Place[];
  try {
    places = await searchPlace(query);
  } catch (e) {
    await releasePlacesCall().catch(() => undefined);
    throw e;
  }
  const p = places.find((x) => isPlausible(x, c));
  const data: Prisma.SalesContactUpdateInput = { googleCheckedAt: new Date() };
  if (!p) {
    const top = places[0];
    const cand = top ? `${top.displayName?.text ?? "?"}${top.formattedAddress ? `, ${top.formattedAddress}` : ""}`.slice(0, 160) : "";
    log.google = { at: new Date().toISOString(), placeId: null, fields: [], status: places.length ? `unsicher: ${cand}` : "nicht gefunden" };
    return { status: places.length ? `unsure: ${cand}` : "not-found", data, fields: [], closed: false };
  }
  const fields: string[] = [];
  const set = (k: string, v: unknown, onlyIfEmpty: boolean) => {
    if (v == null || v === "") return;
    const cur = (c as unknown as Record<string, unknown>)[k];
    if (onlyIfEmpty && !empty(cur)) return;
    if (cur === v) return;
    (data as Record<string, unknown>)[k] = v;
    if (empty(cur)) fields.push(k); // nur neu gefüllte Felder melden (Auffrischen still)
  };
  if (p.rating != null) {
    set("ratingValue", Math.round(p.rating * 10) / 10, false);
    set("ratingCount", p.userRatingCount ?? 0, false);
  }
  const hours = p.regularOpeningHours?.weekdayDescriptions?.join("\n");
  // Öffnungszeiten aus Google nur, wenn leer oder selbst automatisch ergänzt (nie Handeingabe überschreiben)
  if (hours && (empty(c.openingHours) || log.openingHoursSource)) {
    set("openingHours", hours.slice(0, 500), false);
    log.openingHoursSource = "google";
  }
  const route = component(p, "route");
  const no = component(p, "street_number");
  set("street", route ? [route, no].filter(Boolean).join(" ") : null, true);
  set("zip", component(p, "postal_code"), true);
  set("city", component(p, "locality"), true);
  set("phone", p.nationalPhoneNumber ?? null, true);
  set("url", p.websiteUri ?? null, true);
  set("googlePlaceId", p.id, false);
  set("googleMapsUrl", p.googleMapsUri ?? null, false);
  const closed = p.businessStatus === "CLOSED_PERMANENTLY" && c.businessStatus !== "CLOSED_PERMANENTLY";
  set("businessStatus", p.businessStatus ?? null, false);
  log.google = { at: new Date().toISOString(), placeId: p.id, fields, status: "gefunden" };
  return { status: "updated", data, fields: fields.filter((f) => f !== "googlePlaceId" && f !== "ratingCount"), closed };
}

/**
 * Kontakt maximal anreichern: erst Website, dann Google. Nur leere Felder werden gefüllt
 * (Ausnahme Bewertung/Öffnungszeiten aus Google). Schreibt „Automatisch ergänzt: …“ in den Verlauf.
 */
export async function enrichContact(contactId: string, opts: { force?: boolean; google?: boolean } = {}): Promise<ContactEnrichResult> {
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: SELECT });
  if (!c) return { web: "missing", google: "missing", fields: [] };
  const log: EnrichmentLog = { ...((c.enrichment as EnrichmentLog | null) ?? {}) };
  const force = !!opts.force;

  const web = await webStep(c, log, force).catch((e: unknown) => ({ status: `error: ${e instanceof Error ? e.message : e}`, data: { webEnrichAt: new Date() } as Prisma.SalesContactUpdateInput, fields: [] as string[] }));
  // Website-Ergebnisse vor der Google-Suche übernehmen (bessere Suche, Plausibilität)
  const merged = { ...c, ...(web.data as Partial<Row>) } as Row;
  const g =
    opts.google === false
      ? { status: "skipped", data: {}, fields: [] as string[], closed: false }
      : await googleStep(merged, log, force).catch((e: unknown) => (console.error(`[anreichern] Google-Fehler: ${e instanceof Error ? e.message : e}`.slice(0, 400)), { status: `error: ${e instanceof Error ? e.message : e}`, data: {} as Prisma.SalesContactUpdateInput, fields: [] as string[], closed: false }));

  const fields = [...web.fields, ...g.fields];
  const data: Prisma.SalesContactUpdateInput = { ...web.data, ...g.data };
  if (Object.keys(data).length) data.enrichment = log as Prisma.InputJsonValue;
  if (Object.keys(data).length) await prisma.salesContact.update({ where: { id: c.id }, data });
  const notes: string[] = [];
  if (web.fields.length) notes.push(`${web.fields.map((f) => LABEL[f] ?? f).join(", ")} (Website${log.website?.url ? `: ${log.website.url}` : ""})`);
  if (g.fields.length) notes.push(`${g.fields.map((f) => LABEL[f] ?? f).join(", ")} (Google)`);
  if (notes.length) await prisma.salesActivity.create({ data: { contactId: c.id, type: "NOTIZ", note: `Automatisch ergänzt: ${notes.join("; ")}.` } });
  if (g.closed) await prisma.salesActivity.create({ data: { contactId: c.id, type: "NOTIZ", note: "Google: Betrieb laut Google-Eintrag dauerhaft geschlossen – bitte prüfen." } });
  return { web: web.status, google: g.status, fields };
}

/** Cron: neue/unvollständige Kontakte zuerst, Google nach Tageskontingent (gedrosselt). */
export async function enrichPendingContacts(limit = 20, budgetMs = 120_000): Promise<{ tried: number; updated: number }> {
  const deadline = Date.now() + budgetMs;
  const or: Prisma.SalesContactWhereInput[] = [
    { webEnrichAt: null },
    {
      webEnrichAt: { lt: new Date(Date.now() - WEB_RETRY_DAYS * DAY) },
      OR: [{ street: null }, { zip: null }, { city: null }, { phone: null }, { street: "" }, { zip: "" }, { city: "" }, { phone: "" }],
    },
  ];
  if (placesKey() && (await placesUsedToday()) < placesDailyLimit()) {
    or.push({ googleCheckedAt: null }, { googleCheckedAt: { lt: new Date(Date.now() - GOOGLE_REFRESH_DAYS * DAY) } });
  }
  const pending = await prisma.salesContact.findMany({
    where: { OR: or },
    orderBy: [{ webEnrichAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    take: limit,
    select: { id: true },
  });
  // Telefon aus bisherigen E-Mail-Antworten (Signatur) nachholen – nur Datenbank, kostet nichts
  const mail = await backfillPhonesFromMail(50).catch(() => ({ tried: 0, updated: 0 }));
  let tried = mail.tried;
  let updated = mail.updated;
  for (const p of pending) {
    if (Date.now() > deadline) break;
    tried++;
    const r = await enrichContact(p.id).catch(() => null);
    if (r?.fields.length) updated++;
  }
  return { tried, updated };
}
