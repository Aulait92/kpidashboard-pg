// Kontaktdaten aus E-Mails und Buchungen erkennen (Ole, 16.11.2026), ohne Datenbank und testbar.
// Ausgewertet werden nur der Kopf (Absender) und die Signatur des eigenen Teils einer Mail:
// zitierter oder weitergeleiteter Verlauf anderer Personen und Fußzeilen von Tools (Calendly,
// Instantly …) werden vorher abgeschnitten. Zuerst Regex; nur wenn danach noch eine Nummer
// übrig bleibt, die keiner Regel eindeutig zuzuordnen ist, meldet `unclear` das (dann KI, siehe
// kontaktdaten-server.ts). Speichern und Ausschlüsse mit Datenbank: kontaktdaten-server.ts.

import { FREEMAIL, insurerRoot, phoneE164, phoneKey, phoneKind, type PhoneKind } from "@/lib/vertrieb/dubletten";

// ─── Quellen ────────────────────────────────────────────────────────────

export type ContactDataSource = "BUCHUNG" | "CALENDLY" | "MAIL" | "FORMULAR" | "INSTANTLY" | "VERLAUF" | "ZUSAMMENGEFUEHRT" | "HAUPT" | "MANUELL";

const SOURCE_TEXT: Record<ContactDataSource, { phone: string; email: string }> = {
  BUCHUNG: { phone: "aus Buchung", email: "aus Buchung" },
  CALENDLY: { phone: "aus Calendly-Buchung", email: "aus Calendly-Buchung" },
  MAIL: { phone: "aus E-Mail-Signatur", email: "aus E-Mail" },
  FORMULAR: { phone: "aus Formular", email: "aus Formular" },
  INSTANTLY: { phone: "aus Instantly", email: "aus Instantly" },
  VERLAUF: { phone: "aus Verlauf", email: "aus Verlauf" },
  ZUSAMMENGEFUEHRT: { phone: "aus Zusammenführen", email: "aus Zusammenführen" },
  HAUPT: { phone: "frühere Hauptnummer", email: "frühere Hauptadresse" },
  MANUELL: { phone: "von Hand", email: "von Hand" },
};

const dayMonth = (d: Date | string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(new Date(d));

/** „aus Buchung 14.11.“, „aus E-Mail-Signatur 12.11.“ */
export function sourceLabel(kind: "phone" | "email", source: string | null | undefined, at?: Date | string | null): string {
  const s = SOURCE_TEXT[source as ContactDataSource]?.[kind];
  if (!s) return at ? `erkannt ${dayMonth(at)}` : "";
  return at ? `${s} ${dayMonth(at)}` : s;
}

export const KIND_LABEL: Record<PhoneKind, string> = { MOBIL: "Mobil", FESTNETZ: "Festnetz" };

// ─── Ausschlüsse für E-Mail-Adressen ────────────────────────────────────

/** Eigene Adressen und Nummern (Ole, Mirko, performancegrowth), aus DB und Konfiguration (kontaktdaten-server.ts). */
export type OwnContext = { domains: Set<string>; addresses: Set<string>; phoneKeys: Set<string> };
export const EMPTY_OWN: OwnContext = { domains: new Set(), addresses: new Set(), phoneKeys: new Set() };

/** Unsere Domains: alles mit „performancegrowth“ im Namen. */
const OWN_DOMAIN = /(^|[.-])performance-?growth[.-]/i;

const SYSTEM_LOCAL =
  /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|mailer[-_.]?daemon|postmaster|bounces?|notifications?|notify|benachrichtigungen?|automated|automatisch|system|calendar|kalender|newsletter|abuse|daemon|unsubscribe|reply)([+._-].*)?$/i;
const SYSTEM_DOMAIN =
  /(^|\.)(calendly\.com|instantly\.ai|zapier\.com|hubspot\.com|hubspotemail\.net|mailchimp\.com|mcsv\.net|sendgrid\.net|amazonses\.com|resend\.dev|facebookmail\.com|linkedin\.com|zoom\.us|teams\.microsoft\.com|google\.com|apple\.com|stripe\.com|typeform\.com)$/i;
/** Sammeladressen bei Freemailern und Versicherer-Konzernen: gehören nicht zur Person. */
const GENERIC_LOCAL = /^(info|service|kontakt|contact|kundenservice|support|office|mail|post|hallo|hello|team|zentrale|vertrieb|schaden|presse)$/i;

export const emailDomain = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

/** Darf diese Adresse als Kontaktadresse übernommen werden? */
export function usableEmail(email: string, own: OwnContext = EMPTY_OWN): boolean {
  const e = email.trim().toLowerCase();
  const [local, domain] = e.split("@");
  if (!local || !domain || !domain.includes(".")) return false;
  if (domain.endsWith(".invalid") || domain.endsWith(".local")) return false;
  if (own.addresses.has(e) || own.domains.has(domain) || OWN_DOMAIN.test(`.${domain}.`)) return false;
  if (SYSTEM_LOCAL.test(local) || SYSTEM_DOMAIN.test(domain)) return false;
  if ((FREEMAIL.has(domain) || insurerRoot(domain)) && GENERIC_LOCAL.test(local)) return false;
  return true;
}

// ─── Mailtext: eigenen Teil und Signatur finden ─────────────────────────

/** Beginn von zitiertem oder weitergeleitetem Verlauf (anderer Personen). */
const QUOTE_START =
  /^\s*(>|Am .{3,120}(schrieb|wrote)|On .{3,120}wrote|-{2,}\s*(Original|Ursprüngliche|Weitergeleitete|Forwarded)|-{5,}\s*$|_{5,}\s*$|(Von|From|Gesendet|Sent|Betreff|Subject|Datum|Date):\s|Gesendet von meinem|Sent from my|Begin forwarded message|Anfang der weitergeleiteten)/im;

/** Fußzeile eines Tools: ab hier gehört nichts mehr zum Absender. */
const TOOL_FOOTER = /(calendly|instantly|powered by|sent (with|via|using)|gesendet (mit|über)|unsubscribe|to stop receiving|you are receiving|you received this|diese (e-?mail|nachricht) wurde (automatisch|über|mit))/i;
/** Einzelne Zeile eines Tools (z. B. Abmeldelink): nur diese Zeile weglassen. */
const TOOL_LINE = /(abmelden|abbestellen|opt-?out|https?:\/\/\S*(calendly|instantly|unsubscribe))/i;

/** Grußformel, ab der die Signatur beginnt. */
const GREETING =
  /^\s*(?:--\s*$|(?:mit\s+)?(?:[a-zäöüß]+\s+)?gr(?:ü|ue|u)(?:ß|ss)(?:e|en)?(?=[\s,.!]|$)|mfg\b|vg\b|lg\b|bg\b|(?:best|kind|warm)\s+regards\b|regards\b|cheers\b|best\b,?\s*$)/im;

/** Eigener Teil einer Mail: ohne zitierten/weitergeleiteten Verlauf und ohne Tool-Fußzeilen. */
export function ownPart(text: string | null | undefined): string {
  if (!text) return "";
  const t = text.replace(/\r\n?/g, "\n");
  const cut = t.search(QUOTE_START);
  const own = cut >= 0 ? t.slice(0, cut) : t;
  const lines: string[] = [];
  for (const line of own.split("\n")) {
    if (TOOL_FOOTER.test(line)) break;
    if (TOOL_LINE.test(line)) continue;
    lines.push(line);
  }
  return lines.join("\n").trim();
}

/** Signatur: ab der letzten Grußformel, sonst die letzten 12 Zeilen des eigenen Teils. Ohne Pflichtangaben des Versicherers. */
export function signatureBlock(text: string | null | undefined): string {
  const own = ownPart(text);
  if (!own) return "";
  const lines = own.split("\n");
  let start = -1;
  lines.forEach((l, i) => {
    if (GREETING.test(l)) start = i;
  });
  return withoutCompanyFooter((start >= 0 ? lines.slice(start) : lines.slice(-12)).join("\n"));
}

// ─── Zentrale Nummern von Versicherern (Ole, 24.11.2026) ────────────────
// Unter Signaturen von Vertretern stehen oft die Pflichtangaben der Gesellschaft (Sitz, Vorstand, Aufsichtsrat,
// Registergericht) mit der Zentrale (z. B. SIGNAL IDUNA Dortmund 0231 135-0, Hamburg 040 4124-0). Diese Nummern
// gehören nicht zum Kontakt und landeten bei vielen Kontakten als weitere Nummer („gleiche Telefonnummer“).
// Regeln: Pflichtangaben-Block der Signatur wird abgeschnitten, Zeilen mit „Zentrale“, „Hauptverwaltung“ oder
// Rechtsform des Versicherers zählen nicht, bekannte Zentralen und Festnetznummern, die bei mindestens 3 Kontakten
// stehen, werden nie automatisch übernommen (kontaktdaten-server.ts, Aufräumen: Ops-Aktion vertrieb_zentrale_nummern).

/** Pflichtangaben der Gesellschaft: ab dieser Zeile gehört nichts mehr zur Person. */
const COMPANY_FOOTER = /sitz\s+(der\s+gesellschaft|des\s+unternehmens)|\bvorstand\b|vorstandsvorsitz|\baufsichtsrat|registergericht|\bvvag\b|versicherungsverein/i;
/** Einzelne Zeile mit Nummer der Gesellschaft, nicht der Person (die Nummer der Agentur steht in eigenen Zeilen). */
const COMPANY_LINE =
  /zentrale|hauptverwaltung|hauptsitz|hauptgesch(ä|ae)ftsstelle|generaldirektion|\ba\.\s?g\.(?=[\s,;]|$)|\b(lebens|kranken|unfall|sach|allgemeine)[\s-]?versicherung(s-?gesellschaft)?\s+(ag|a\.\s?g\.)|versicherungs-?ag\b/i;

/**
 * Signaturtext ohne Pflichtangaben des Versicherers: ab der ersten Zeile mit Sitz der Gesellschaft, Vorstand,
 * Aufsichtsrat oder Registergericht. Zeilen davor bleiben (dort steht die Nummer der Person); Zentralen davor
 * fallen über companyLine, centralPhone und die Häufigkeitsregel weg.
 */
export function withoutCompanyFooter(signature: string): string {
  const lines = signature.split("\n");
  const i = lines.findIndex((l) => COMPANY_FOOTER.test(l));
  return i < 0 ? signature : lines.slice(0, i).join("\n").trimEnd();
}

/** Zeile mit Zentrale, Hauptverwaltung oder Rechtsform des Versicherers (keine Nummer der Person). */
export const companyLine = (line: string) => COMPANY_LINE.test(line) || COMPANY_FOOTER.test(line);

/**
 * Bekannte Zentralen (Vergleichsschlüssel ohne +49/0, siehe phoneKey). Nur sicher bekannte Nummern; alles andere
 * erkennt die Häufigkeitsregel (sharedPhoneKeys).
 */
export const CENTRAL_PHONES: Record<string, string> = {
  "2311350": "SIGNAL IDUNA Dortmund", // 0231 135-0
  "4041240": "SIGNAL IDUNA Hamburg", // 040 4124-0
  "8938000": "Allianz München", // 089 3800-0
  "2114770": "ERGO Düsseldorf", // 0211 477-0
  "2211480": "AXA Köln", // 0221 148-0
  "6115330": "R+V Wiesbaden", // 0611 533-0
  "9561960": "HUK-COBURG", // 09561 96-0
  "6923840": "DVAG Frankfurt", // 069 2384-0
  "8951210": "Generali München", // 089 5121-0
};
/** Durchwahlblöcke der Hauptverwaltung (alle Nummern mit diesem Anfang gehören dem Versicherer). */
const CENTRAL_BLOCKS: [prefix: string, name: string][] = [
  ["231135", "SIGNAL IDUNA Dortmund"], // 0231 135-…
  ["404124", "SIGNAL IDUNA Hamburg"], // 040 4124-…
];

/** Name der Zentrale, wenn die Nummer eine bekannte Versicherer-Zentrale (oder deren Durchwahl) ist, sonst null. */
export function centralPhone(raw: string | null | undefined): string | null {
  const k = phoneKey(raw);
  if (!k) return null;
  return CENTRAL_PHONES[k] ?? CENTRAL_BLOCKS.find(([p]) => k.startsWith(p))?.[1] ?? null;
}

/** Ab so vielen Kontakten (als weitere Nummer) gilt eine Festnetznummer als Sammel-/Zentralnummer. */
export const SHARED_MIN_CONTACTS = 3;

/**
 * Festnetznummern, die bei mindestens `min` verschiedenen Kontakten stehen (Vergleichsschlüssel). Mobilnummern
 * zählen nicht: die gehören einer Person (mehrfach = Dublette, kein Zentralanschluss).
 */
export function sharedPhoneKeys(rows: { contactId: string; phone: string }[], min = SHARED_MIN_CONTACTS): Set<string> {
  const by = new Map<string, Set<string>>();
  for (const r of rows) {
    const e = phoneE164(r.phone);
    const k = phoneKey(e);
    if (!e || !k || phoneKind(e) === "MOBIL") continue;
    const set = by.get(k) ?? new Set<string>();
    set.add(r.contactId);
    by.set(k, set);
  }
  return new Set([...by].filter(([, s]) => s.size >= min).map(([k]) => k));
}

/** Zentrale oder Sammelnummer? `shared`: Ergebnis von sharedPhoneKeys. Grund für den Verlaufseintrag, sonst null. */
export function sharedPhoneReason(raw: string | null | undefined, shared?: Set<string>): string | null {
  const central = centralPhone(raw);
  if (central) return `Zentrale ${central}`;
  const k = phoneKey(raw);
  return k && shared?.has(k) ? `steht bei mindestens ${SHARED_MIN_CONTACTS} Kontakten` : null;
}

// ─── Telefonnummern ─────────────────────────────────────────────────────

const NUMBER = String.raw`(\+?\(?\d[\d\s/()\-–.]{5,22}\d)`;
const LABEL = String.raw`(Tel(?:efon)?|Fon|Phone|Festnetz|Büro|Mobil(?:funk|telefon)?|Mobile|Handy|Mob|Cell|WhatsApp|T|M)`;
const LABELLED = new RegExp(String.raw`(?:^|[\s|·•,;(])${LABEL}\.?\s*[:.]?\s*${NUMBER}`, "gi");
const FAX_LABEL = /(?:Tele)?fax|\bF\s*[:.]/i;
const BARE_LINE = /^\s*(\+\d{1,3}|00\d{2}|0)[\d\s/()\-–.]{6,20}\d\s*$/;
const ANY_NUMBER = /(?<![\w+])(\+\d|00\d|0\d)[\d\s/()\-–.]{5,20}\d/g;
/** Zeilen ohne Absender-Telefonnummern: Bank, Register, Steuer. */
const SKIP_LINE = /\biban\b|\bbic\b|swift|\bust\b|ust-?id|umsatzsteuer|steuer-?nr|steuernummer|\bhrb\b|\bhra\b|amtsgericht|register|\bd-[a-z0-9]{4}-|\bkonto\b|kontonummer|\bblz\b/i;
/** Service-/Hotline-Nummern (z. B. vom Versicherer): nicht die Nummer des Kontakts. */
const SERVICE_LINE = /hotline|service|schaden|notruf|kundenbetreuung|kundendienst|gebührenfrei|kostenlos|kostenfrei|zentrale\s+der/i;

/** Gültige Rufnummer? 7 bis 15 Ziffern, keine Service- oder Sondernummer, kein Datum. */
export function plausiblePhone(raw: string): boolean {
  const t = raw.trim().replace(/^\(/, "");
  const digits = t.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return false;
  if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(t)) return false; // Datum
  if (!/^(\+|00|0)/.test(t)) return false;
  const e = phoneE164(raw);
  if (!e) return false;
  // 0800 (kostenlos), 0180x (Service), 0900 (Mehrwert), 0137/0138 (Gewinnspiel), 0700 (persönliche Rufnummer)
  if (/^49(800|180|900|137|138|700)/.test(e.slice(1))) return false;
  return true;
}

const tidy = (raw: string) => raw.replace(/–/g, "-").replace(/\s+/g, " ").trim();

export type FoundPhone = { raw: string; e164: string; kind: PhoneKind; label: string | null };

/**
 * Telefonnummern aus der Signatur einer Mail (Mobil und Festnetz, deutsch und international).
 * `exclude`: eigene Nummern (beliebige Schreibweise). `unclear`: in der Signatur steht noch
 * eine Nummer, die keine Regel eindeutig zuordnen konnte (dann darf die KI nachsehen).
 */
export function extractMailPhones(text: string | null | undefined, exclude: string[] = []): { phones: FoundPhone[]; unclear: boolean; signature: string } {
  const signature = signatureBlock(text);
  const skip = new Set(exclude.map((e) => phoneKey(e)).filter((k): k is string => !!k));
  const found = new Map<string, FoundPhone>();
  const seen = new Set<string>(); // auch ausgeschlossene, damit sie nicht als unklar gelten
  const take = (raw: string, label: string | null, into: FoundPhone[]) => {
    if (!plausiblePhone(raw)) return;
    const e164 = phoneE164(raw)!;
    const key = phoneKey(e164)!;
    seen.add(key);
    if (skip.has(key) || found.has(key) || centralPhone(e164)) return;
    const p = { raw: tidy(raw), e164, kind: phoneKind(e164, label), label };
    found.set(key, p);
    into.push(p);
  };
  const segments = signature.split("\n").flatMap((l) => l.split(/\s[|·•]\s/));
  const labelled: FoundPhone[] = [];
  const bare: FoundPhone[] = [];
  const usable = (seg: string) => !SKIP_LINE.test(seg) && !SERVICE_LINE.test(seg) && !companyLine(seg);
  for (const seg of segments) {
    if (!usable(seg)) continue;
    // Fax-Teil abschneiden (Telefon vor dem Fax bleibt)
    const beforeFax = FAX_LABEL.test(seg) ? seg.slice(0, seg.search(FAX_LABEL)) : seg;
    for (const m of beforeFax.matchAll(LABELLED)) take(m[2], m[1], labelled);
  }
  for (const seg of segments) {
    if (!usable(seg) || FAX_LABEL.test(seg)) continue;
    if (BARE_LINE.test(seg)) take(seg, null, bare);
  }
  // Noch eine plausible Nummer übrig, die keiner Regel entspricht? (z. B. „Max Muster 0171 1234567“)
  let unclear = false;
  for (const seg of segments) {
    if (!usable(seg) || FAX_LABEL.test(seg)) continue;
    for (const m of seg.matchAll(ANY_NUMBER)) {
      const k = plausiblePhone(m[0]) ? phoneKey(m[0]) : null;
      if (k && !seen.has(k)) unclear = true;
    }
  }
  return { phones: [...labelled, ...bare], unclear, signature };
}

/** Eigene Nummern (aus der Absender-Signatur), die nie als Kontakt-Nummer übernommen werden. */
export function ownPhones(): string[] {
  // Unsere Nummer (steht auch in der App unter Einrichtung) + optional weitere per Umgebungsvariable
  return ["+49 151 52418846", ...(process.env.OWN_PHONE_NUMBERS ?? "").split(",")].map((s) => s.trim()).filter(Boolean);
}

/** Nummern, die tatsächlich in der Signatur stehen (Prüfung einer KI-Antwort). */
export function phoneKeysIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(ANY_NUMBER)) {
    const k = plausiblePhone(m[0]) ? phoneKey(m[0]) : null;
    if (k) out.add(k);
  }
  return out;
}

// ─── Telefonnummern aus dem Verlauf (Ole, 24.11.2026) ───────────────────
// „hier müssen aus dem Verlauf Nummern erkannt werden, als weitere Telefonnummer hinzugefügt werden“: Nummern in
// Einträgen des Verlaufs (Buchungsnotizen, Anrufnotizen, importierte Texte, Antworten auf Kalt-Mails). Strenger als in
// der Signatur, weil im Verlauf auch Daten, Uhrzeiten, Kunden- und Vertragsnummern stehen:
// - beschriftet („Telefon:“, „Mobil:“, „Telefonnummer (für SMS): …“) oder
// - unbeschriftet nur mit Vorwahl (+49, 0049, 0…), mindestens 9 Ziffern, ohne Punkte (kein Datum) und nicht in Zeilen
//   mit Kunden-, Vertrags- oder Bankangaben.
// Zitierter Verlauf anderer Personen, Links und E-Mail-Adressen werden vorher entfernt.

/** Beginn von zitiertem oder weitergeleitetem Text (nur eindeutige Marken; „Datum:“ o. Ä. kommt in Buchungsnotizen vor). */
const HISTORY_QUOTE = /^\s*(>|Am .{3,120}(schrieb|wrote)|On .{3,120}wrote|-{2,}\s*(Original|Ursprüngliche|Weitergeleitete|Forwarded)|Begin forwarded message|Anfang der weitergeleiteten)/im;
const LINK_OR_MAIL = /\b(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi;
const HISTORY_LABEL = String.raw`(Telefon(?:nummer)?|Tel(?:\.?\s?-?\s?Nr)?|Rufnummer|Handy(?:nummer)?|Mobil(?:nummer|funk|telefon)?|Mobile|Phone|Fon|Festnetz|Büro|WhatsApp|Nummer|Durchwahl|Cell|Mob)`;
const HISTORY_LABELLED = new RegExp(String.raw`(?:^|[\s|·•,;(])${HISTORY_LABEL}\.?(?:\s*\([^)]{0,40}\))?\s*[:.]?\s*(?:ist\s+|lautet\s+)?${NUMBER}`, "gi");
/** Frage-Antwort-Zeile einer Buchung („Unter welcher Nummer erreichen wir Sie?: 0176 …“). */
const PHONE_QUESTION = /telefon|handy|mobil|whatsapp|phone|rufnummer|nummer/i;
/** Nummern, die keine Rufnummern sind. */
const ID_WORDS = /kunden|vertrag|versicherungs|police|auftrag|vorgang|rechnung|bestell|referenz|ticket|vermittler|steuer|register|konto|mitglied|\bid\b|aktenzeichen|schein/i;
const BARE_HISTORY = /(?<![\w+/.=#:-])(?:\+|00|0)[1-9][\d \t/()\-–]{5,19}\d(?!\d)/g;
const DATE_IN = /\d{1,2}\.\d{1,2}\.(\d{2,4})?/;

/** Pflichtangaben einer Gesellschaft in einem Verlaufseintrag (ohne „Vorstand“: kommt in Anrufnotizen vor). */
const LEGAL_FOOTER = /sitz\s+der\s+gesellschaft|\baufsichtsrat|registergericht|\bvvag\b|versicherungsverein/i;

/** Text eines Verlaufseintrags ohne zitierten Verlauf, Links und E-Mail-Adressen. */
export function historyText(text: string | null | undefined): string {
  if (!text) return "";
  const t = text.replace(/\r\n?/g, "\n");
  const cut = t.search(HISTORY_QUOTE);
  return (cut >= 0 ? t.slice(0, cut) : t).replace(LINK_OR_MAIL, " ");
}

/** Telefonnummern in einem Verlaufseintrag. `exclude`: eigene Nummern (beliebige Schreibweise). */
export function extractHistoryPhones(text: string | null | undefined, exclude: string[] = []): FoundPhone[] {
  const skip = new Set(exclude.map((e) => phoneKey(e)).filter((k): k is string => !!k));
  const found = new Map<string, FoundPhone>();
  const take = (raw: string, label: string | null, minDigits = 7) => {
    const r = raw.trim();
    if (DATE_IN.test(r) || r.replace(/\D/g, "").length < minDigits || !plausiblePhone(r)) return;
    const e164 = phoneE164(r)!;
    const key = phoneKey(e164);
    if (!key || skip.has(key) || found.has(key) || centralPhone(e164)) return;
    found.set(key, { raw: tidy(r), e164, kind: phoneKind(e164, label), label });
  };
  for (const full of historyText(text).split("\n")) {
    if (SKIP_LINE.test(full) || SERVICE_LINE.test(full) || COMPANY_LINE.test(full) || LEGAL_FOOTER.test(full)) continue;
    const line = FAX_LABEL.test(full) ? full.slice(0, full.search(FAX_LABEL)) : full;
    // Frage und Antwort („Telefonnummer: …“, „Ihre Handynummer für Rückfragen: …“)
    const i = line.indexOf(":");
    if (i > 0 && PHONE_QUESTION.test(line.slice(0, i)) && !ID_WORDS.test(line.slice(0, i))) {
      const m = line.slice(i + 1).match(new RegExp(NUMBER));
      if (m) take(m[1], line.slice(0, i).trim());
    }
    for (const m of line.matchAll(HISTORY_LABELLED)) take(m[2], m[1]);
    if (ID_WORDS.test(line)) continue;
    for (const m of line.matchAll(BARE_HISTORY)) take(m[0], null, 9);
  }
  return [...found.values()];
}

/** Einträge, die keine Nummer des Kontakts enthalten: unsere eigenen Mails und Meldungen, Stufenwechsel, Abwesenheitsnotizen. */
export function skipHistoryEntry(a: { type: string; outcome?: string | null; note?: string | null }): boolean {
  if (a.type === "STATUS" || a.type === "EMAIL") return true;
  return /^(Neue (Telefonnummer|E-Mail-Adresse) erkannt|Zentrale Nummer entfernt|Automatische Antwort|Antwort gesendet|Gesendet|Nicht erreicht|E-Mail:|Auskunft|Löschung)/i.test((a.outcome ?? "").trim());
}

/**
 * Welche gefundenen Nummern sind neu für den Kontakt? Ohne Hauptnummer, weitere Nummern, von Hand entfernte und
 * eigene Nummern, jede Nummer nur einmal (Schreibweise egal).
 */
export function newPhonesFor(
  found: FoundPhone[],
  known: { phone?: string | null; extras?: string[]; removed?: string[]; ownKeys?: Set<string>; shared?: Set<string> },
): FoundPhone[] {
  const seen = new Set<string>(known.ownKeys ?? []);
  for (const p of [known.phone, ...(known.extras ?? []), ...(known.removed ?? [])]) {
    const k = phoneKey(p);
    if (k) seen.add(k);
  }
  const out: FoundPhone[] = [];
  for (const p of found) {
    const k = phoneKey(p.e164);
    if (!k || seen.has(k) || sharedPhoneReason(p.e164, known.shared)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}
