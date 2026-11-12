// Adresse von Vertriebskontakten automatisch ergänzen: Fehlt Straße, PLZ oder
// Ort, lesen wir das öffentliche Impressum der Agentur-Website (Feld „url“
// oder aus der E-Mail-Domain abgeleitet) und füllen nur leere Felder.
// Bewusst ohne KI (Regeln statt Modell): günstig, nachvollziehbar, testbar.
// Jeder Kontakt wird höchstens einmal automatisch versucht
// (addressEnrichTriedAt); „Adresse ergänzen“ am Kontakt löst es erneut aus.

import { prisma } from "@/lib/prisma";
import { fetchImpressumText, normalizeUrl } from "@/lib/impressum";

/** Freemail- und Provider-Domains: die Domain sagt nichts über die Agentur. */
const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "web.de", "gmx.de", "gmx.net", "gmx.at", "gmx.ch", "t-online.de", "outlook.com", "outlook.de",
  "hotmail.com", "hotmail.de", "live.com", "live.de", "msn.com", "icloud.com", "me.com", "mac.com", "yahoo.com", "yahoo.de",
  "aol.com", "aol.de", "freenet.de", "posteo.de", "mailbox.org", "protonmail.com", "proton.me", "arcor.de", "online.de",
  "1und1.de", "ionos.de", "email.de", "mail.de", "vodafone.de", "kabelmail.de", "ok.de", "unitybox.de",
]);

/**
 * Konzern-Domains von Versicherern: Mail-Adressen dort gehören zum Konzern,
 * nicht zur Agentur. Eine Agentur-Seite unter einer Subdomain mit eigenem Pfad
 * (z. B. vertretung.allianz.de/<name>) ist erlaubt.
 */
const INSURER = [
  "allianz.de", "allianz.com", "ergo.de", "axa.de", "generali.de", "ruv.de", "signal-iduna.de", "signal-iduna.net", "devk.de",
  "huk.de", "huk-coburg.de", "zurich.de", "gothaer.de", "lvm.de", "provinzial.de", "provinzial.com", "wwk.de", "debeka.de",
  "hdi.de", "continentale.de", "barmenia.de", "nuernberger.de", "alte-leipziger.de", "vgh.de", "sv-versicherung.de",
  "swisslife.de", "dvag.de", "dvag.com", "ottonova.de", "volkswohl-bund.de", "die-bayerische.de", "basler.de", "helvetia.com",
];

const insurerRoot = (host: string) => INSURER.find((d) => host === d || host.endsWith(`.${d}`)) ?? null;

/**
 * Welche Website lesen wir für diesen Kontakt? Erst das Feld „url“, sonst die
 * E-Mail-Domain. null = keine geeignete Quelle.
 */
/**
 * Agentur-Seite eines Ausschließlichkeitsvertreters aus seiner Konzern-E-Mail
 * (vorname.nachname@…) – dort stehen Adresse und Telefon:
 *   Allianz        vertretung.allianz.de/vorname.nachname/
 *   SIGNAL IDUNA   signal-iduna-agentur.de/vorname.nachname/ (signal-iduna.de/… zeigt das Konzern-Impressum)
 *   AXA            axa-betreuer.de/vorname_nachname
 */
export function agentPageFromEmail(local: string | undefined, domain: string | undefined): string | null {
  if (!local || !domain || !/^[a-z0-9äöüß][a-z0-9äöüß_-]*\.[a-z0-9äöüß._-]+$/.test(local)) return null;
  if (domain === "allianz.de") return `https://vertretung.allianz.de/${local}/`;
  if (domain === "signal-iduna.net" || domain === "signal-iduna.de") return `https://signal-iduna-agentur.de/${local}/`;
  if (domain === "axa.de" || domain === "axa-betreuer.de") return `https://www.axa-betreuer.de/${local.replace(/\./g, "_")}`;
  return null;
}

export function enrichmentSourceUrl(c: { url?: string | null; email?: string | null }): string | null {
  if (c.url?.trim()) {
    const u = normalizeUrl(c.url);
    if (u && !/(^|\.)(linkedin|facebook|instagram|xing|google|goo\.gl|maps\.app)\./i.test(`.${u.hostname}`)) {
      const host = u.hostname.replace(/^www\./, "");
      const root = insurerRoot(host);
      const path = u.pathname.replace(/\/+$/, "");
      // Konzernseite (allianz.de, www.allianz.de/…) → nein; Agentur-Unterseite (vertretung.allianz.de/name) → ja
      if (!root || (host !== root && path.length > 1)) return u.toString();
    }
  }
  const [local, domain] = (c.email?.trim().toLowerCase() ?? "").split("@");
  const agent = agentPageFromEmail(local, domain);
  if (agent) return agent;
  if (!domain || domain.endsWith(".invalid") || !domain.includes(".")) return null;
  if (FREEMAIL.has(domain) || insurerRoot(domain)) return null;
  return `https://${domain}`;
}

export type ExtractedAddress = { street: string | null; zip: string | null; city: string | null; phone: string | null };

/** Zeilen, die zu Register, Aufsicht, Schlichtung oder Versicherer gehören – deren Adressen sind nicht die der Agentur. */
const FOREIGN_CONTEXT =
  /register|dihk|ihk|kammer|ombudsmann|schlichtung|aufsicht|bafin|versicherungs-?ag|lebensversicherung|allianz se|allianz deutschland|postfach|hosting|hoster|webdesign|umsetzung|gestaltung|datenschutzbeauftragt|streitbeilegung|zentrale|hauptsitz/i;

const STREET =
  /^([A-ZÄÖÜa-zäöüß][A-Za-zÄÖÜäöüß.\- ]{1,60}?\s\d{1,4}\s?[a-zA-Z]?(?:\s?[-/]\s?\d{1,4}\s?[a-zA-Z]?)?)$/;
const ZIP_CITY = /(?:^|\s|,)(?:D-)?(\d{5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\- ]{1,40}(?:\s?\([^)]{1,30}\))?)/;
const PHONE = /(?:Tel(?:efon)?|Fon|Phone|Festnetz|Büro)\.?\s*[:.]?\s*(\+?\d[\d\s/()\-–.]{5,24}\d)/i;

const clean = (v: string) => v.replace(/\s+/g, " ").replace(/^(Anschrift|Adresse|Sitz|Büro|Agentur)\s*:\s*/i, "").trim();

/** Erste Agentur-Anschrift (und Telefon) aus dem Impressum-Text lesen. */
export function extractAddress(text: string): ExtractedAddress {
  const lines = text
    .split(/\n/)
    .flatMap((l) => l.split(/\s[|·•]\s/))
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const out: ExtractedAddress = { street: null, zip: null, city: null, phone: null };

  for (let i = 0; i < lines.length && !out.zip; i++) {
    const m = lines[i].match(ZIP_CITY);
    if (!m) continue;
    const context = lines.slice(Math.max(0, i - 3), i + 1).join(" ");
    if (FOREIGN_CONTEXT.test(context)) continue;
    const city = m[2]
      .replace(/\s+(Tel|Telefon|Fax|E-Mail|Mail|Deutschland|Germany)\b.*$/i, "")
      .replace(/[.,;:\s]+$/, "")
      .trim();
    if (!city || city.length < 2) continue;
    // Straße: auf derselben Zeile davor („Hauptstr. 1, 12345 Ort“) oder in der Zeile davor
    const before = clean(lines[i].slice(0, m.index ?? 0).replace(/[,;]\s*$/, ""));
    const lastPart = before.split(/,\s*/).pop() ?? "";
    let street = STREET.test(lastPart) ? lastPart : null;
    if (!street && i > 0) {
      const prev = clean(lines[i - 1]).split(/,\s*/).pop() ?? "";
      if (STREET.test(prev) && !FOREIGN_CONTEXT.test(prev)) street = prev;
    }
    out.zip = m[1];
    out.city = city;
    out.street = street;
  }

  for (const l of lines) {
    const p = l.match(PHONE);
    if (p && !FOREIGN_CONTEXT.test(l)) {
      const digits = p[1].replace(/\D/g, "");
      if (digits.length >= 6 && !/^0?180/.test(digits)) {
        out.phone = p[1].replace(/\s+/g, " ").trim();
        break;
      }
    }
  }
  return out;
}

type ContactFields = { street: string | null; zip: string | null; city: string | null; phone: string | null };

/** Nur leere Felder füllen, nie vorhandene überschreiben. */
export function fillEmpty(current: ContactFields, found: ExtractedAddress): Partial<ContactFields> {
  const data: Partial<ContactFields> = {};
  for (const k of ["street", "zip", "city", "phone"] as const) {
    if (!current[k]?.trim() && found[k]) data[k] = found[k]!.slice(0, 200);
  }
  return data;
}

export const needsAddress = (c: { street: string | null; zip: string | null; city: string | null }) =>
  !c.street?.trim() || !c.zip?.trim() || !c.city?.trim();

export type EnrichResult =
  | { status: "updated"; fields: string[]; sourceUrl: string }
  | { status: "complete" | "no-source" | "not-found" | "nothing-new"; sourceUrl?: string | null; error?: string };

const FIELD_LABEL: Record<string, string> = { street: "Straße", zip: "PLZ", city: "Ort", phone: "Telefon" };

/** Adresse eines Kontakts ergänzen (einmal versuchen, Zeitstempel setzen). */
export async function enrichContactAddress(contactId: string, opts: { force?: boolean; timeoutMs?: number } = {}): Promise<EnrichResult> {
  const c = await prisma.salesContact.findUnique({
    where: { id: contactId },
    select: { id: true, url: true, email: true, street: true, zip: true, city: true, phone: true, addressEnrichTriedAt: true },
  });
  if (!c) return { status: "no-source", error: "Kontakt nicht gefunden." };
  if (!needsAddress(c)) return { status: "complete" };
  if (c.addressEnrichTriedAt && !opts.force) return { status: "nothing-new", error: "Schon versucht." };

  const sourceUrl = enrichmentSourceUrl(c);
  await prisma.salesContact.update({ where: { id: c.id }, data: { addressEnrichTriedAt: new Date() } });
  if (!sourceUrl) return { status: "no-source", sourceUrl: null };

  const page = await fetchImpressumText(sourceUrl, { timeoutMs: opts.timeoutMs ?? 8000 });
  // Impressum gesperrt/leer (z. B. Allianz-Agenturseiten): Adresse steht oft auf der Startseite
  let found = "error" in page ? null : extractAddress(page.text);
  let usedUrl = "error" in page ? sourceUrl : page.impressumUrl;
  if ((!found || (!found.street && !found.zip)) && page.homeText) {
    const home = extractAddress(page.homeText);
    if (home.street || home.zip || home.phone) {
      found = { street: found?.street ?? home.street, zip: found?.zip ?? home.zip, city: found?.city ?? home.city, phone: found?.phone ?? home.phone };
      usedUrl = sourceUrl;
    }
  }
  if (!found) return { status: "not-found", sourceUrl, error: "error" in page ? page.error : undefined };
  const data = fillEmpty(c, found);
  const fields = Object.keys(data);
  if (fields.length === 0) return { status: "nothing-new", sourceUrl };

  await prisma.$transaction([
    prisma.salesContact.update({ where: { id: c.id }, data: { ...data, addressEnrichedAt: new Date() } }),
    prisma.salesActivity.create({
      data: {
        contactId: c.id,
        type: "NOTIZ",
        note: `Adresse von der Website ergänzt (${fields.map((f) => FIELD_LABEL[f]).join(", ")}). Quelle: ${usedUrl}`,
      },
    }),
  ]);
  return { status: "updated", fields, sourceUrl: usedUrl };
}

/** Nachhol-Lauf (WhatsApp-Cron): Kontakte ohne vollständige Adresse, noch nie versucht. */
export async function enrichPendingAddresses(limit = 10, budgetMs = 120_000): Promise<{ tried: number; updated: number }> {
  const deadline = Date.now() + budgetMs;
  const pending = await prisma.salesContact.findMany({
    where: {
      // nie versucht, oder erfolglos versucht vor mehr als 30 Tagen (Website kann sich ändern)
      OR: [{ addressEnrichTriedAt: null }, { addressEnrichTriedAt: { lt: new Date(Date.now() - 30 * 86400000) }, addressEnrichedAt: null }],
      AND: [{ OR: [{ street: null }, { zip: null }, { city: null }, { street: "" }, { zip: "" }, { city: "" }] }],
    },
    orderBy: [{ addressEnrichTriedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    take: limit,
    select: { id: true },
  });
  let updated = 0;
  let tried = 0;
  for (const p of pending) {
    if (Date.now() > deadline) break;
    tried++;
    const r = await enrichContactAddress(p.id).catch(() => null);
    if (r?.status === "updated") updated++;
  }
  return { tried, updated };
}

/** Nach dem Anlegen eines Kontakts im Hintergrund anreichern: Adresse, Öffnungszeiten, Google-Bewertung … (blockiert nichts). */
export async function scheduleAddressEnrichment(contactId: string) {
  if (process.env.NODE_ENV === "test" || process.env.ADDRESS_ENRICH === "off") return;
  // Seit 12.11.: maximal anreichern (Website + Google), siehe contact-enrich.ts
  const run = () =>
    import("@/lib/vertrieb/contact-enrich")
      .then((m) => m.enrichContact(contactId))
      .catch((err) => console.warn("[anreichern] fehlgeschlagen", contactId, err instanceof Error ? err.message : err));
  try {
    const { after } = await import("next/server");
    after(run);
  } catch {
    void run(); // außerhalb einer Anfrage (z. B. Skript) direkt im Hintergrund
  }
}
