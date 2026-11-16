// Dubletten im Vertrieb erkennen (ohne Datenbank, testbar).
// Erst starke Merkmale (Telefon, E-Mail, Webseite, Firma, eigene E-Mail-Domain),
// Namen nur mit Vor- UND Nachname. Ein reiner Vornamen-Treffer („Christian“)
// zählt nur zusätzlich zu einem starken Merkmal.

import { normalizePhone } from "@/lib/whatsapp/phone";

/** Freemail- und Provider-Domains: die Domain sagt nichts über die Agentur. */
export const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "web.de", "gmx.de", "gmx.net", "gmx.at", "gmx.ch", "gmx.com", "gmx.org", "t-online.de", "magenta.de",
  "outlook.com", "outlook.de", "outlook.at", "hotmail.com", "hotmail.de", "hotmail.at", "live.com", "live.de", "live.at", "msn.com",
  "icloud.com", "me.com", "mac.com", "yahoo.com", "yahoo.de", "ymail.com", "aol.com", "aol.de", "freenet.de", "posteo.de", "posteo.net",
  "mailbox.org", "protonmail.com", "proton.me", "arcor.de", "online.de", "1und1.de", "ionos.de", "email.de", "mail.de", "mail.com",
  "vodafone.de", "kabelmail.de", "ok.de", "unitybox.de", "web.com",
]);

/**
 * Konzern-Domains von Versicherern: Mail-Adressen dort gehören zum Konzern,
 * nicht zur Agentur (viele Vertreter teilen sich allianz.de).
 */
export const INSURER = [
  "allianz.de", "allianz.com", "ergo.de", "axa.de", "generali.de", "ruv.de", "signal-iduna.de", "signal-iduna.net", "devk.de",
  "huk.de", "huk-coburg.de", "zurich.de", "gothaer.de", "lvm.de", "provinzial.de", "provinzial.com", "wwk.de", "debeka.de",
  "hdi.de", "continentale.de", "barmenia.de", "nuernberger.de", "alte-leipziger.de", "vgh.de", "sv-versicherung.de",
  "swisslife.de", "dvag.de", "dvag.com", "ottonova.de", "volkswohl-bund.de", "die-bayerische.de", "basler.de", "helvetia.com",
];

/** Weitere Domains, die sich viele Vertreter teilen (nur für den Dubletten-Abgleich). */
const SHARED_AGENT_DOMAINS = [
  "axa-betreuer.de", "signal-iduna-agentur.de", "r-v.de", "hallesche.de", "dkv.de", "arag.de", "vhv.de", "wuerttembergische.de",
];

export const insurerRoot = (host: string) => INSURER.find((d) => host === d || host.endsWith(`.${d}`)) ?? null;
const sharedRoot = (host: string) => insurerRoot(host) ?? SHARED_AGENT_DOMAINS.find((d) => host === d || host.endsWith(`.${d}`)) ?? null;

/** Telefonnummer vergleichbar machen: 0171 …, +49 171 …, 0049 171 … → 171… */
export function phoneKey(raw: string | null | undefined): string | null {
  const p = raw ? normalizePhone(raw) : null;
  if (!p) return null;
  const k = p.startsWith("49") ? p.slice(2) : p;
  return k.length >= 7 ? k : null;
}

/** Eigene E-Mail-Domain (nicht Freemail, nicht Versicherer-Konzern, keine Platzhalter). */
export function ownEmailDomain(email: string | null | undefined): string | null {
  const d = String(email ?? "").trim().toLowerCase().split("@")[1];
  if (!d || !d.includes(".") || d.endsWith(".invalid") || d.endsWith(".local")) return null;
  if (FREEMAIL.has(d) || sharedRoot(d)) return null;
  return d;
}

const SOCIAL = /(^|\.)(linkedin|facebook|instagram|xing|google|goo\.gl|maps\.app|calendly|youtube|tiktok)\./i;

/**
 * Webseite vergleichbar machen: eigene Domain → Host; Agentur-Unterseite eines
 * Versicherers (vertretung.allianz.de/vorname.nachname) → Host + Pfad;
 * Konzern-Startseite, soziale Netzwerke → null.
 */
export function siteKey(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".") || SOCIAL.test(`.${host}`)) return null;
  if (!sharedRoot(host)) return host;
  const path = u.pathname.toLowerCase().replace(/\/+$/, "").split("/").filter(Boolean)[0];
  return path ? `${host}/${path}` : null;
}

/** Wörter eines Namens, klein, ohne Umlaute/Akzente. */
export function nameWords(s: string | null | undefined): string[] {
  return (s ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)
    .filter(Boolean);
}

const FIRMA_FUELL = new Set(["allianz", "versicherung", "versicherungen", "generalvertretung", "hauptvertretung", "agentur", "gmbh", "ohg", "kg", "ug", "co", "und", "e", "k", "ek"]);

const EMAIL_IN_TEXT = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE_QUESTION = /telefon|handy|mobil|whatsapp|phone|rufnummer|nummer/i;

/** E-Mails und Telefonnummern aus den Antworten im Buchungsformular („Frage: Antwort“ je Zeile). */
export function answersContacts(answers: string | null | undefined): { emails: string[]; phones: string[] } {
  const emails: string[] = [];
  const phones: string[] = [];
  for (const line of (answers ?? "").split("\n")) {
    for (const e of line.match(EMAIL_IN_TEXT) ?? []) emails.push(e.toLowerCase());
    const i = line.indexOf(":");
    if (i > 0 && PHONE_QUESTION.test(line.slice(0, i))) {
      const a = line.slice(i + 1);
      if (/\d{5,}/.test(a.replace(/\D/g, ""))) phones.push(a.trim());
    }
  }
  return { emails, phones };
}

export type DupInput = {
  name: string;
  email: string;
  altEmails?: string[];
  phone?: string | null;
  url?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  leaderNames?: string | null;
  /** zusätzliche E-Mails/Telefonnummern, z. B. aus Calendly-Buchungen */
  extraEmails?: string[];
  extraPhones?: string[];
};

export type DupSignals = {
  phones: Set<string>;
  emails: Set<string>;
  domains: Set<string>;
  sites: Set<string>;
  /** Firmenname ohne Füllwörter (mind. 2 Wörter), sonst null */
  company: string | null;
  /** „vorname nachname“ (beide vorhanden), auch aus Inhabernamen */
  persons: Set<string>;
  /** alle Namenswörter (Name, Vor-, Nachname) mit Leerzeichen umrahmt */
  nameText: string;
  firstName: string | null;
};

export function contactSignals(c: DupInput): DupSignals {
  const emails = new Set(
    [c.email, ...(c.altEmails ?? []), ...(c.extraEmails ?? [])]
      .map((e) => String(e ?? "").trim().toLowerCase())
      .filter((e) => e.includes("@") && !e.endsWith(".invalid")),
  );
  const phones = new Set([c.phone, ...(c.extraPhones ?? [])].map(phoneKey).filter((p): p is string => !!p));
  const domains = new Set([...emails].map(ownEmailDomain).filter((d): d is string => !!d));
  const sites = new Set([siteKey(c.url)].filter((s): s is string => !!s));
  const persons = new Set<string>();
  const first = nameWords(c.firstName);
  const last = nameWords(c.lastName);
  if (first.length && last.length) persons.add([...first, ...last].join(" "));
  for (const n of (c.leaderNames ?? "").split(",")) {
    const w = nameWords(n);
    if (w.length >= 2) persons.add(w.join(" "));
  }
  const words = nameWords(c.name);
  const core = words.filter((w) => !FIRMA_FUELL.has(w));
  return {
    phones,
    emails,
    domains,
    sites,
    company: core.length >= 2 ? core.join(" ") : null,
    persons,
    nameText: ` ${[...words, ...first, ...last].join(" ")} `,
    firstName: first[0] ?? (words.length === 1 ? words[0] : null),
  };
}

export type DupReason = "gleiche E-Mail" | "gleiche Telefonnummer" | "gleiche Webseite" | "gleiche Firma" | "gleicher Name" | "gleiche Domain";

const WEIGHT: Record<DupReason, number> = {
  "gleiche E-Mail": 100,
  "gleiche Telefonnummer": 90,
  "gleiche Webseite": 70,
  "gleiche Firma": 60,
  "gleicher Name": 60,
  "gleiche Domain": 40,
};

const meets = (a: Set<string>, b: Set<string>) => [...a].some((x) => b.has(x));

/**
 * Wie wahrscheinlich ist `b` eine Dublette von `a`? null = kein Vorschlag.
 * `ignoreDomains`: Domains, die viele Kontakte teilen (zählen nicht).
 */
export function duplicateMatch(a: DupSignals, b: DupSignals, ignoreDomains?: Set<string>): { score: number; reasons: DupReason[] } | null {
  const reasons: DupReason[] = [];
  if (meets(a.emails, b.emails)) reasons.push("gleiche E-Mail");
  if (meets(a.phones, b.phones)) reasons.push("gleiche Telefonnummer");
  if (meets(a.sites, b.sites)) reasons.push("gleiche Webseite");
  // Name nur mit Vor- und Nachname: gleiche Person oder „Vorname Nachname“ im Namen des anderen
  if (meets(a.persons, b.persons) || [...a.persons].some((p) => b.nameText.includes(` ${p} `)) || [...b.persons].some((p) => a.nameText.includes(` ${p} `))) {
    reasons.push("gleicher Name");
  }
  // Gleicher Firmenname (ist er nur der Personenname, zählt er als „gleicher Name“)
  if (a.company && a.company === b.company && !a.persons.has(a.company) && !b.persons.has(b.company)) reasons.push("gleiche Firma");
  const domains = [...a.domains].filter((d) => b.domains.has(d) && !ignoreDomains?.has(d));
  if (domains.length && !reasons.includes("gleiche E-Mail")) reasons.push("gleiche Domain");
  if (!reasons.length) return null; // reiner Vornamen-Treffer reicht nicht
  let score = reasons.reduce((s, r) => s + WEIGHT[r], 0);
  if (a.firstName && b.nameText.includes(` ${a.firstName} `)) score += 5;
  reasons.sort((x, y) => WEIGHT[y] - WEIGHT[x]);
  return { score, reasons };
}

/** Beste Vorschläge zuerst, höchstens `limit`. */
export function rankDuplicates<T extends { signals: DupSignals; createdAt: Date }>(
  target: DupSignals,
  candidates: T[],
  limit = 3,
  ignoreDomains?: Set<string>,
): (T & { score: number; reason: string })[] {
  return candidates
    .map((c) => ({ c, m: duplicateMatch(target, c.signals, ignoreDomains) }))
    .filter((x): x is { c: T; m: { score: number; reasons: DupReason[] } } => !!x.m)
    .sort((x, y) => y.m.score - x.m.score || x.c.createdAt.getTime() - y.c.createdAt.getTime())
    .slice(0, limit)
    .map(({ c, m }) => ({ ...c, score: m.score, reason: m.reasons.join(", ") }));
}
