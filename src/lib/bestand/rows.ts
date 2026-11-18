// Bestandskunden-Import ohne Datenbank: Felder, Spaltenerkennung, Parser und Gruppierung.
// Wird beim Übernehmen (lib/bestand/import.ts) und für die Live-Vorschau im Browser genutzt –
// damit „4.493 Zeilen → 1.870 Kunden mit 4.493 Verträgen“ genau dem entspricht, was gespeichert wird.
// Übernommen werden nur bekannte Felder; alle anderen Spalten (auch Gesundheitsangaben) verfallen.

import { normalizePhone } from "@/lib/whatsapp/phone";
import { parseConsent } from "@/lib/bestand/einwilligung";

export const FIELDS = {
  externalNo: "Kundennummer",
  salutation: "Anrede",
  firstName: "Vorname",
  lastName: "Nachname",
  fullName: "Name (komplett)",
  company: "Firma",
  phone: "Mobil/Telefon",
  email: "E-Mail",
  birthday: "Geburtsdatum",
  street: "Straße",
  zip: "PLZ",
  city: "Ort",
  emailConsent: "E-Mail-Einwilligung",
  whatsappConsent: "WhatsApp-Einwilligung",
  widerspruchHinweis: "Hinweis auf Widerspruchsrecht",
  line: "Sparte/Produkt",
  contractNo: "Vertragsnummer",
  insurer: "Versicherer",
  annualPremium: "Jahresbeitrag",
  contractStatus: "Vertragsstatus",
  startDate: "Vertragsbeginn",
  renewalDate: "Ablauf/Hauptfälligkeit",
} as const;
export type FieldKey = keyof typeof FIELDS;
export type Mapping = Partial<Record<FieldKey, string>>;
export type Row = Record<string, string>;

/** Felder je Gruppe für die Oberfläche „Spalten zuordnen“. */
/** important = empfohlen (nicht Pflicht): Ohne Telefon gibt es kein WhatsApp, ohne Sparte keine Chancen. */
export const FIELD_GROUPS: { title: string; hint: string; fields: { key: FieldKey; label: string; important?: boolean; hint?: string }[] }[] = [
  {
    title: "Kunde",
    hint: "Einmal je Person. Zeilen desselben Kunden werden zusammengeführt.",
    fields: [
      { key: "firstName", label: "Vorname" },
      { key: "lastName", label: "Nachname" },
      { key: "fullName", label: "Name (komplett, falls nicht getrennt)" },
      { key: "phone", label: "Mobil/Telefon", important: true, hint: "Für WhatsApp nötig" },
      { key: "email", label: "E-Mail" },
      { key: "externalNo", label: "Kundennummer" },
      { key: "salutation", label: "Anrede" },
      { key: "company", label: "Firma (Gewerbekunden)" },
      { key: "birthday", label: "Geburtsdatum" },
      { key: "street", label: "Straße" },
      { key: "zip", label: "PLZ" },
      { key: "city", label: "Ort" },
      { key: "emailConsent", label: "E-Mail-Einwilligung", hint: "ja, nein oder Datum; leer = unbekannt" },
      { key: "whatsappConsent", label: "WhatsApp-Einwilligung", hint: "ja, nein oder Datum; ohne sie keine WhatsApp-Kampagne" },
      {
        key: "widerspruchHinweis",
        label: "Hinweis auf Widerspruchsrecht (bei Erhebung der E-Mail)",
        hint: "ja, nein oder Datum; ohne Nachweis E-Mails nur mit Einwilligung",
      },
    ],
  },
  {
    title: "Vertrag",
    hint: "Je Zeile ein Vertrag. Ein Kunde kann viele Verträge haben.",
    fields: [
      { key: "line", label: "Sparte/Produkt", important: true, hint: "Für Chancen wie „KFZ ohne Hausrat“" },
      { key: "annualPremium", label: "Jahresbeitrag" },
      { key: "contractNo", label: "Vertragsnummer" },
      { key: "insurer", label: "Versicherer" },
      { key: "contractStatus", label: "Vertragsstatus" },
      { key: "renewalDate", label: "Ablauf/Hauptfälligkeit" },
      { key: "startDate", label: "Vertragsbeginn" },
    ],
  },
];

// ß → ss, sonst würde „Straße“ zu „strae“ und nie erkannt
const norm = (s: string) => s.toLowerCase().replace(/ß/g, "ss").normalize("NFKD").replace(/[^a-z0-9]/g, "");

/** Synonyme, die nur als ganze Spaltenüberschrift zählen („Kunde“ ja, „Kunde seit“ oder „Kundenbetreuer“ nicht). */
const EXACT_ONLY = new Set(["kunde"]);

const SYNONYMS: Record<FieldKey, string[]> = {
  externalNo: ["kundennummer", "kundennr", "kdnr", "vnnr", "versicherungsnehmernr", "partnernummer", "partnernr", "kundenid"],
  salutation: ["anrede", "salutation", "geschlecht"],
  firstName: ["vorname", "firstname"],
  lastName: ["nachname", "name", "familienname", "lastname", "zuname"],
  fullName: ["vollstandigername", "kunde", "kundenname", "versicherungsnehmer", "vorundnachname"],
  company: ["firma", "firmenname", "unternehmen", "company", "gewerbe"],
  phone: ["mobil", "handy", "mobilnummer", "mobiltelefon", "telefon", "telefonnummer", "tel", "telmobil", "rufnummer", "phone"],
  email: ["email", "emailadresse", "mail"],
  birthday: ["geburtsdatum", "geburtstag", "gebdatum", "gebdat", "birthday"],
  street: ["strasse", "strase", "strassehausnr", "adresse", "anschrift"],
  zip: ["plz", "postleitzahl"],
  city: ["ort", "wohnort", "stadt"],
  emailConsent: ["emaileinwilligung", "einwilligungemail", "mailwerbung", "emailwerbung", "werbeeinwilligungemail", "optinemail", "emailoptin"],
  whatsappConsent: ["whatsappeinwilligung", "einwilligungwhatsapp", "whatsappwerbung", "optinwhatsapp", "whatsappoptin", "messengereinwilligung"],
  // Bewusst nicht „Widerspruch“ allein: so heißt oft die Spalte, in der ein Kunde der Werbung widersprochen hat
  widerspruchHinweis: ["widerspruchshinweis", "hinweiswiderspruch", "hinweisaufwiderspruch", "hinweiswiderspruchsrecht", "hinweisaufdaswiderspruchsrecht", "uwghinweis"],
  line: ["sparte", "produkt", "vertrag", "tarif", "produktname", "sparten", "vertragsart"],
  contractNo: ["vertragsnummer", "vertragsnr", "versicherungsscheinnummer", "versicherungsscheinnr", "vsnr", "policennummer", "policennr", "polizzennummer", "scheinnummer"],
  insurer: ["versicherer", "gesellschaft", "versicherungsgesellschaft", "risikotrager", "anbieter"],
  annualPremium: ["jahresbeitrag", "jahrespramie", "beitragjahrlich", "jahresbeitragbrutto", "jahresbeitragnetto", "beitrag", "pramie", "beitragpa"],
  contractStatus: ["vertragsstatus", "status", "vertragszustand"],
  startDate: ["beginn", "vertragsbeginn", "versicherungsbeginn", "beginndatum"],
  renewalDate: ["ablauf", "hauptfalligkeit", "fallig", "falligkeit", "vertragsende", "ablaufdatum"],
};

// Spalten, die nie übernommen werden (Gesundheitsangaben u. Ä.)
const BLOCKED = /gesund|diagnos|vorerkrank|krankheit|behandl|medikament|bmi|gewicht|gr(ö|oe|o)(ß|ss)e|risikozuschlag|leistungsfall/i;

export function isBlockedColumn(header: string): boolean {
  return BLOCKED.test(header);
}

/** Spalten automatisch zuordnen (erste passende Spalte je Feld). */
export function detectMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<string>();
  // Genauere Felder zuerst (Vertragsnummer vor Kundennummer-Teiltreffern, Jahresbeitrag vor „Beitrag“)
  const order: FieldKey[] = [
    "widerspruchHinweis", "emailConsent", "whatsappConsent",
    "contractNo", "externalNo", "salutation", "firstName", "fullName", "lastName", "company", "phone", "email", "birthday", "street", "zip", "city",
    "insurer", "annualPremium", "contractStatus", "startDate", "renewalDate", "line",
  ];
  for (const key of order) {
    const hit = headers.find(
      (h) =>
        !used.has(h) &&
        !isBlockedColumn(h) &&
        !(key === "annualPremium" && /monat|zahlweise/i.test(h)) && // Monatsbeitrag ist kein Jahresbeitrag
        SYNONYMS[key].some((syn) => norm(h) === syn || (syn.length > 4 && !EXACT_ONLY.has(syn) && norm(h).includes(syn))),
    );
    if (hit) {
      m[key] = hit;
      used.add(hit);
    }
  }
  // „Name“ ohne Vorname-Spalte ist meist der volle Name
  if (m.lastName && !m.firstName && !m.fullName && norm(m.lastName) === "name") {
    m.fullName = m.lastName;
    delete m.lastName;
  }
  // Mobil hat Vorrang vor Festnetz
  const mobile = headers.find((h) => /mobil|handy/i.test(h));
  if (mobile) m.phone = mobile;
  return m;
}

/**
 * Telefonnummer aus dem Import. Excel speichert Nummern oft als Zahl und verliert die führende 0
 * (0170 1234567 → 1701234567); normalizePhone hielte das für eine Nummer mit Ländervorwahl 1 (USA).
 * Deutsche Mobilnummern ohne 0 (15x, 16x, 17x mit 10 bis 11 Ziffern) bekommen deshalb die 49 vorangestellt.
 */
export function importPhone(raw: string | undefined): string | null {
  const t = (raw ?? "").trim();
  const digits = t.replace(/\D/g, "");
  if (!/^(\+|00|0)/.test(t) && /^1[5-7]\d{8,9}$/.test(digits)) return `49${digits}`;
  return normalizePhone(t) || null;
}

export function parseDate(raw: string | undefined): Date | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // Auch mit Uhrzeit dahinter („12.03.1975 00:00:00“, so exportieren manche Bestandssysteme Datumsfelder)
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 1900 + +m[3] + (+m[3] < 30 ? 100 : 0) : +m[3];
    return new Date(Date.UTC(y, +m[2] - 1, +m[1]));
  }
  if (/^\d{5}$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000); // Excel-Seriennummer
  return null;
}

/**
 * Geldbetrag aus deutschen oder englischen Schreibweisen: „1.234,56 €“, „1234,56“, „1,234.56“, „EUR 980“.
 * Negative, leere oder unplausible Werte (über 1 Mio. €) → null.
 */
export function parseMoney(raw: string | undefined): number | null {
  let s = (raw ?? "").replace(/eur(o)?|€|\s| /gi, "").trim();
  if (!s || s.startsWith("-")) return null;
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // Das zuletzt stehende Zeichen trennt die Nachkommastellen
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = /,\d{1,2}$/.test(s) && s.split(",").length === 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot >= 0) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // 1.234 = Tausender
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.round(n * 100) / 100;
}

export type ContractStatus = "aktiv" | "storniert" | "ruhend" | "unbekannt";

/** Vertragsstatus grob vereinheitlichen. Stornierte und ruhende Verträge zählen nicht als aktiv. */
export function normalizeStatus(raw: string | undefined): ContractStatus | null {
  const s = (raw ?? "").toLowerCase().trim();
  if (!s) return null;
  if (/storn|k(ü|ue|u)ndig|gek(ü|ue|u)nd|beendet|abgelaufen|ausgelaufen|aufgehoben|erloschen|inaktiv|annull|r(ü|ue|u)cktritt|widerruf|abgang|\bende\b/.test(s)) return "storniert";
  if (/ruh|beitragsfrei|stillgel|pausiert|suspend|unterbroch/.test(s)) return "ruhend";
  if (/aktiv|laufend|\bbestand|in kraft|policiert|g(ü|ue|u)ltig|lebend|\bok\b|^ja$/.test(s)) return "aktiv";
  return "unbekannt";
}

/** Zählt der Vertrag für Sparten, Lücken, Ablauf und Beitragsvolumen? (ohne Angabe: ja) */
export function isActiveContract(status: string | null | undefined): boolean {
  return status !== "storniert" && status !== "ruhend";
}

export function normalizeSalutation(raw: string | undefined): "Herr" | "Frau" | "Divers" | null {
  const s = (raw ?? "").toLowerCase().replace(/[.\s]/g, "");
  if (!s) return null;
  if (/^(herr|hr|herrn|m|mann|m(ä|ae|a)nnlich|male)$/.test(s)) return "Herr";
  if (/^(frau|fr|w|weiblich|female)$/.test(s)) return "Frau";
  if (/^(divers|d|x|neutral)$/.test(s)) return "Divers";
  return null;
}

// Reihenfolge zählt (erste passende Regel): Tierhalter-, Hunde- oder Pferdehaftpflicht ist keine Privathaftpflicht,
// Reisekranken keine Krankenversicherung, sonst fehlten Chancen wie „Haftpflicht fehlt“ und es käme der Hinweis
// zu Personenversicherungen.
const LINE_RULES: [RegExp, string][] = [
  [/kfz|kraftfahrt|auto|pkw|motorrad|wohnmobil|kraftrad/, "KFZ"],
  [/\btier|haustier|hund|pferd|katze/, "Tier"],
  [/reise/, "Reise"],
  [/hausrat/, "Hausrat"],
  [/haftpflicht|phv/, "Haftpflicht"],
  [/geb(ä|a)ude|wohngeb/, "Wohngebäude"],
  [/unfall/, "Unfall"],
  [/rechtsschutz/, "Rechtsschutz"],
  [/berufsunf|\bbu\b/, "BU"],
  [/pflege/, "Pflege"],
  [/kranken|\bpkv\b|zahn|station(ä|a)r|ambulant/, "Kranken"],
  [/risikoleben|leben|rente|riester|r(ü|u)rup|altersvorsorge|pension|fonds/, "Vorsorge"],
];

/** Alle Sparten, die der Import erkennt (plus „Sonstiges“). */
export const LINE_NAMES: readonly string[] = ["KFZ", "Hausrat", "Haftpflicht", "Wohngebäude", "Unfall", "Rechtsschutz", "BU", "Pflege", "Kranken", "Vorsorge", "Tier", "Reise"];

export function normalizeLine(raw: string): string | null {
  const s = raw.toLowerCase();
  if (!s.trim()) return null;
  return LINE_RULES.find(([re]) => re.test(s))?.[1] ?? "Sonstiges";
}

export type GroupedContract = {
  line: string;
  product: string;
  startDate: Date | null;
  renewalDate: Date | null;
  annualPremium: number | null;
  contractNo: string | null;
  insurer: string | null;
  status: ContractStatus | null;
};
export type GroupedCustomer = {
  externalNo: string | null;
  salutation: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  birthday: Date | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  /** Einwilligung je Kanal aus der Datei: ja | nein | null (unbekannt bzw. nicht geliefert), mit Datum falls angegeben */
  emailConsent: "ja" | "nein" | null;
  emailConsentAt: Date | null;
  whatsappConsent: "ja" | "nein" | null;
  whatsappConsentAt: Date | null;
  /** Nachweis: bei Erhebung der E-Mail auf das Widerspruchsrecht hingewiesen (aus der Datei), mit Datum falls angegeben */
  widerspruchHinweis: "ja" | "nein" | null;
  widerspruchHinweisAt: Date | null;
  contracts: GroupedContract[];
};

export type SkipReason = "ohne Kundennummer, Telefon und E-Mail";
export type GroupResult = {
  groups: Map<string, GroupedCustomer>;
  rows: number;
  skipped: number;
  skipReasons: Partial<Record<SkipReason, number>>;
  contracts: number;
  inactiveContracts: number;
  premiumTotal: number;
  withPhone: number;
  /** Kunden ohne Vor- und Nachnamen (werden in Nachrichten neutral angesprochen). */
  withoutName: number;
  withEmail: number;
  /** Einwilligungen aus der Datei je Kanal */
  consent: { emailJa: number; emailNein: number; whatsappJa: number; whatsappNein: number; hinweisJa: number; hinweisNein: number };
  /** Kunden mit Personenversicherung (Kranken, BU, Leben/Vorsorge, Unfall, Pflege): Hinweis § 203 StGB */
  withPersonLines: number;
};

/** Personenversicherungs-Sparten (schon die Tatsache des Vertrags ist geschützt, § 203 StGB). */
export const PERSON_LINES: readonly string[] = ["Kranken", "BU", "Vorsorge", "Unfall", "Pflege"];

/**
 * Anzeigename eines Bestandskunden: Vor- und Nachname, sonst Firma, sonst E-Mail.
 * Name ist seit 14.11.2026 kein Pflichtfeld mehr (Ole: Liste nur mit Firma, Ort, E-Mail).
 */
export function displayName(c: { firstName?: string | null; lastName?: string | null; company?: string | null; email?: string | null }): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.company?.trim() || c.email?.trim() || "Ohne Namen";
}

/**
 * Zeilen zu Kunden zusammenführen: gleiche Kundennummer, sonst gleiches Telefon, sonst gleiche E-Mail,
 * sonst Nachname + Geburtsdatum. Jede Zeile mit Sparte wird ein Vertrag (mehrere Sparten in einer Zelle → mehrere Verträge).
 * Zeilen ohne Merkmal zum Wiedererkennen (Kundennummer, Telefon, E-Mail) werden übersprungen; ein Name ist nicht nötig.
 */
export function groupRows(rows: Row[], m: Mapping): GroupResult {
  const get = (r: Row, k: FieldKey) => (m[k] ? (r[m[k]!] ?? "").trim() : "");
  const groups = new Map<string, GroupedCustomer>();
  const skipReasons: Partial<Record<SkipReason, number>> = {};
  let skipped = 0;
  for (const r of rows) {
    let first = get(r, "firstName") || null;
    let last = get(r, "lastName") || null;
    const full = get(r, "fullName");
    if (!first && !last && full) {
      const parts = full.includes(",") ? full.split(",").map((x) => x.trim()).reverse() : full.split(/\s+/);
      first = parts.slice(0, -1).join(" ") || null;
      last = parts.at(-1) || null;
    }
    const phone = importPhone(get(r, "phone"));
    const email = get(r, "email").toLowerCase() || null;
    const ext = get(r, "externalNo") || null;
    const birthday = parseDate(get(r, "birthday"));
    const key = ext ?? phone ?? email ?? (last && birthday ? `${last}|${birthday.toISOString()}` : null);
    // Ohne Namen ist die Zeile trotzdem gültig: Anzeige über Firma/E-Mail, Nachrichten mit „Guten Tag,“
    if (!key) {
      skipped++;
      skipReasons["ohne Kundennummer, Telefon und E-Mail"] = (skipReasons["ohne Kundennummer, Telefon und E-Mail"] ?? 0) + 1;
      continue;
    }
    const acc: GroupedCustomer = groups.get(key) ?? {
      externalNo: ext,
      salutation: normalizeSalutation(get(r, "salutation")),
      firstName: first,
      lastName: last,
      company: get(r, "company").slice(0, 160) || null,
      phone,
      email,
      birthday,
      street: get(r, "street") || null,
      zip: get(r, "zip").replace(/\D/g, "").slice(0, 5) || null,
      city: get(r, "city") || null,
      emailConsent: null,
      emailConsentAt: null,
      whatsappConsent: null,
      whatsappConsentAt: null,
      widerspruchHinweis: null,
      widerspruchHinweisAt: null,
      contracts: [],
    };
    // Einwilligung je Kanal (erste Angabe je Kunde gilt; „nein“ geht vor)
    for (const ch of ["email", "whatsapp"] as const) {
      const raw = get(r, ch === "email" ? "emailConsent" : "whatsappConsent");
      const v = parseConsent(raw);
      if (!v) continue;
      const key = ch === "email" ? "emailConsent" : "whatsappConsent";
      if (acc[key] === "nein") continue;
      acc[key] = v;
      if (v === "ja") acc[ch === "email" ? "emailConsentAt" : "whatsappConsentAt"] ??= parseDate(raw);
      else acc[ch === "email" ? "emailConsentAt" : "whatsappConsentAt"] = null;
    }
    // Nachweis zum Widerspruchshinweis (wie Einwilligung: „nein“ geht vor)
    {
      const raw = get(r, "widerspruchHinweis");
      const v = parseConsent(raw);
      if (v && acc.widerspruchHinweis !== "nein") {
        acc.widerspruchHinweis = v;
        if (v === "ja") acc.widerspruchHinweisAt ??= parseDate(raw);
        else acc.widerspruchHinweisAt = null;
      }
    }
    acc.phone ??= phone;
    acc.email ??= email;
    acc.firstName ??= first;
    acc.lastName ??= last;
    acc.salutation ??= normalizeSalutation(get(r, "salutation"));
    acc.company ??= get(r, "company").slice(0, 160) || null;

    const shared = {
      startDate: parseDate(get(r, "startDate")),
      renewalDate: parseDate(get(r, "renewalDate")),
      insurer: get(r, "insurer").slice(0, 120) || null,
      status: normalizeStatus(get(r, "contractStatus")),
    };
    const premium = parseMoney(get(r, "annualPremium"));
    const contractNo = get(r, "contractNo").slice(0, 60) || null;
    const products = get(r, "line").split(/[;,/|]+/).map((x) => x.trim()).filter(Boolean);
    if (products.length) {
      // Beitrag und Vertragsnummer gehören zur Zeile – bei mehreren Sparten in einer Zelle nicht aufteilbar
      for (const product of products) {
        const line = normalizeLine(product);
        if (line) acc.contracts.push({ line, product, ...shared, annualPremium: products.length === 1 ? premium : null, contractNo: products.length === 1 ? contractNo : null });
      }
    } else if (premium != null || contractNo) {
      acc.contracts.push({ line: "Sonstiges", product: "", ...shared, annualPremium: premium, contractNo });
    }
    groups.set(key, acc);
  }
  let contracts = 0;
  let inactiveContracts = 0;
  let premiumTotal = 0;
  let withPhone = 0;
  let withoutName = 0;
  let withEmail = 0;
  let withPersonLines = 0;
  const consent = { emailJa: 0, emailNein: 0, whatsappJa: 0, whatsappNein: 0, hinweisJa: 0, hinweisNein: 0 };
  for (const g of groups.values()) {
    contracts += g.contracts.length;
    if (!g.firstName && !g.lastName) withoutName++;
    if (g.email) withEmail++;
    if (g.contracts.some((c) => PERSON_LINES.includes(c.line))) withPersonLines++;
    if (g.emailConsent === "ja") consent.emailJa++;
    if (g.emailConsent === "nein") consent.emailNein++;
    if (g.whatsappConsent === "ja") consent.whatsappJa++;
    if (g.whatsappConsent === "nein") consent.whatsappNein++;
    if (g.widerspruchHinweis === "ja") consent.hinweisJa++;
    if (g.widerspruchHinweis === "nein") consent.hinweisNein++;
    for (const c of g.contracts) {
      if (!isActiveContract(c.status)) inactiveContracts++;
      else if (c.annualPremium != null) premiumTotal += c.annualPremium;
    }
    if (g.phone) withPhone++;
  }
  return { groups, rows: rows.length, skipped, skipReasons, contracts, inactiveContracts, premiumTotal: Math.round(premiumTotal * 100) / 100, withPhone, withoutName, withEmail, consent, withPersonLines };
}

/** Warnung vor dem Übernehmen, wenn fast nichts übernommen würde (null = alles gut). */
export function importWarning(r: Pick<GroupResult, "groups" | "rows" | "skipped" | "skipReasons">): { block: boolean; text: string } | null {
  const customers = r.groups.size;
  const reasons = Object.entries(r.skipReasons)
    .filter(([, n]) => n)
    .map(([k, n]) => `${n!.toLocaleString("de-DE")} ${k}`)
    .join(", ");
  if (r.rows > 0 && customers === 0) {
    return {
      block: true,
      text: `Mit dieser Zuordnung würde kein einziger Kunde übernommen (${reasons}). Bitte mindestens eine Spalte für Telefon, E-Mail oder Kundennummer zuordnen. Ist das vielleicht keine Kundenliste?`,
    };
  }
  if (r.rows >= 10 && r.skipped / r.rows >= 0.5) {
    return { block: false, text: `Mehr als die Hälfte der Zeilen würde übersprungen (${reasons}). Bitte die Zuordnung prüfen.` };
  }
  return null;
}

// ─── Zuordnung prüfen (Ole, 14.11.2026: Spalte „Email“ lag auf Vorname, Telefon und E-Mail) ───

export type MappingIssue = {
  field: FieldKey;
  /** duplicate = dieselbe Spalte liegt auf mehreren Feldern (Warnung); content = Inhalt passt nicht zum Feld */
  kind: "duplicate" | "content";
  /** true = Import gesperrt (über 50 % der Stichprobe unpassend) */
  block: boolean;
  text: string;
};

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Sieht nach Telefonnummer aus: nur Ziffern, Leerzeichen und + ( ) - / . und mindestens 6 Ziffern. */
export function looksLikePhone(v: string): boolean {
  const s = v.trim().replace(/^(tel|mobil|handy|fon)[.:]?\s*/i, "");
  return /^[+\d\s()\-/.]+$/.test(s) && s.replace(/\D/g, "").length >= 6;
}
export const looksLikeEmail = (v: string) => EMAIL_LIKE.test(v.trim());

type ContentCheck = { ok: (v: string) => boolean; problem: string };
const NOT_EMAIL = (v: string) => !v.includes("@");
const IS_DATE = (v: string) => parseDate(v) != null;
const CONTENT_CHECKS: Partial<Record<FieldKey, ContentCheck>> = {
  phone: { ok: looksLikePhone, problem: "sehen nicht wie Telefonnummern aus" },
  email: { ok: looksLikeEmail, problem: "sehen nicht wie E-Mail-Adressen aus" },
  firstName: { ok: NOT_EMAIL, problem: "sind E-Mail-Adressen, keine Namen" },
  lastName: { ok: NOT_EMAIL, problem: "sind E-Mail-Adressen, keine Namen" },
  fullName: { ok: NOT_EMAIL, problem: "sind E-Mail-Adressen, keine Namen" },
  birthday: { ok: IS_DATE, problem: "sind kein Datum" },
  startDate: { ok: IS_DATE, problem: "sind kein Datum" },
  renewalDate: { ok: IS_DATE, problem: "sind kein Datum" },
  // Nachweis nur aus eindeutigen Werten (ja, nein, Datum), damit keine andere Spalte als Nachweis durchgeht
  widerspruchHinweis: { ok: (v) => parseConsent(v) !== null, problem: "sind weder ja, nein noch ein Datum" },
};

/** So viele gefüllte Werte je Spalte werden geprüft. */
export const SAMPLE_SIZE = 50;

/**
 * Zuordnung prüfen: doppelt belegte Spalten (Warnung am Feld) und Inhalte, die nicht zum Feld passen
 * (Stichprobe der ersten gefüllten Werte; über 50 % unpassend → Feld rot, Import gesperrt).
 */
export function mappingIssues(rows: Row[], m: Mapping): MappingIssue[] {
  const out: MappingIssue[] = [];
  const byColumn = new Map<string, FieldKey[]>();
  for (const [k, col] of Object.entries(m) as [FieldKey, string][]) {
    if (col) byColumn.set(col, [...(byColumn.get(col) ?? []), k]);
  }
  for (const [col, keys] of byColumn) {
    if (keys.length < 2) continue;
    for (const k of keys) {
      const others = keys.filter((x) => x !== k).map((x) => FIELDS[x]);
      out.push({ field: k, kind: "duplicate", block: false, text: `Die Spalte „${col}“ ist auch bei ${others.join(", ")} zugeordnet. Bitte prüfen, welches Feld gemeint ist.` });
    }
  }
  for (const [k, col] of Object.entries(m) as [FieldKey, string][]) {
    const check = CONTENT_CHECKS[k];
    if (!col || !check) continue;
    const sample: string[] = [];
    for (const r of rows) {
      const v = (r[col] ?? "").trim();
      if (v) sample.push(v);
      if (sample.length >= SAMPLE_SIZE) break;
    }
    if (!sample.length) continue;
    const bad = sample.filter((v) => !check.ok(v));
    if (bad.length * 2 > sample.length) {
      const example = bad[0].length > 40 ? `${bad[0].slice(0, 40)}…` : bad[0];
      out.push({
        field: k,
        kind: "content",
        block: true,
        text: `${bad.length} von ${sample.length} geprüften Werten in „${col}“ ${check.problem} (z. B. „${example}“). Bitte eine andere Spalte wählen oder „Nicht zuordnen“.`,
      });
    }
  }
  return out;
}

/** Erster sperrender Fehler der Zuordnung als Satz für den Server (null = alles gut). */
export function mappingBlocker(rows: Row[], m: Mapping): string | null {
  const b = mappingIssues(rows, m).find((i) => i.block);
  return b ? `${FIELDS[b.field]}: ${b.text}` : null;
}
