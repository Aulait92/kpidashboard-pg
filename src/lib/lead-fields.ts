// Produktspezifische Lead-Felder aus Airtable (Funnel-/Leadformular-Angaben).
// Eine Quelle für: Kunden-CRM-Detailansicht, Airtable-Sync (Snapshot am Lead)
// und den WhatsApp-Bot (bekommt die Formularangaben als Kontext).

export type ReadOnlyField = {
  key: string;
  label: string;
  format?: "date" | "datetime" | "eur" | "chip-product" | "chip-status";
  // Alternative Airtable-Feldnamen — der erste nicht-leere gewinnt. Nötig,
  // weil derselbe Wert je nach Funnel-Version unter verschiedenen Feldnamen
  // liegt (z. B. „Alter (Futter)" vs. „Altersklasse Hund (Futter)").
  fallbackKeys?: string[];
};

// Immer relevante Kontaktfelder.
export const COMMON_FIELDS: ReadOnlyField[] = [
  { key: "Vorname", label: "Vorname" },
  { key: "Nachname", label: "Nachname" },
  { key: "Telefonnummer", label: "Telefonnummer" },
  { key: "E-Mail", label: "E-Mail" },
  { key: "Postleitzahl", label: "Postleitzahl" },
  { key: "Ort", label: "Ort" },
  { key: "Bundesland", label: "Bundesland" },
];

// PKV-spezifisch (Wechsel/Tarifoptimierung/Neugeschäft).
const PKV_FIELDS: ReadOnlyField[] = [
  { key: "Geburtsdatum", label: "Geburtsdatum", format: "date" },
  { key: "Aktuelle Versicherung", label: "Aktuelle Versicherung" },
  { key: "Gesetzlich oder privat?", label: "Gesetzlich oder privat?" },
  { key: "Situation", label: "Situation" },
  { key: "Wie lange in PKV?", label: "Wie lange in PKV?" },
  { key: "Monatlicher Beitrag", label: "Monatlicher Beitrag", format: "eur" },
];

// Tierversicherung (Hund/Katze/Pferd) — die Felder sind in Airtable generisch
// „… (Tier)" benannt und für alle Tierarten dieselben.
const TIER_FIELDS: ReadOnlyField[] = [
  { key: "Tierart", label: "Tierart" },
  { key: "Rasse (Tier)", label: "Rasse" },
  { key: "Tiername", label: "Name des Tieres" },
  { key: "Geschlecht (Tier)", label: "Geschlecht" },
  { key: "Geburtsjahr (Tier)", label: "Geburtsjahr" },
  { key: "Geburtsmonat (Tier)", label: "Geburtsmonat" },
  { key: "Kastriert (Tier)", label: "Kastriert/Sterilisiert" },
  { key: "Haltung (Tier)", label: "Haltung" },
  { key: "Anzahl Tiere", label: "Anzahl Tiere" },
];

// Hundefutter-Funnel — physiologische Angaben zum Hund plus Futter-Details.
// Feldnamen tragen je nach Funnel-Version „(Futter)"- oder „(Tier)"-Suffix;
// wo sich der Name zwischen alter/neuer Funnel-Version unterscheidet, deckt
// fallbackKeys die Alternative ab.
const HUNDEFUTTER_FIELDS: ReadOnlyField[] = [
  // 1) Wer ist der Hund?
  { key: "Tiername", label: "Tiername" },
  { key: "Rasse (Tier)", label: "Rasse" },
  { key: "Geschlecht (Tier)", label: "Geschlecht" },
  {
    key: "Alter (Futter)",
    label: "Alter Hund",
    fallbackKeys: ["Altersklasse Hund (Futter)"],
  },
  { key: "Gewicht (Futter)", label: "Gewicht" },
  { key: "Kastriert (Tier)", label: "Kastriert" },
  // 2) Aktivität & Gesundheit
  { key: "Aktivitätslevel (Futter)", label: "Aktivitätslevel" },
  {
    key: "Gesundheitl. Probleme (Futter)",
    label: "Gesundheitliche Probleme",
    fallbackKeys: ["Gesundheitliche Probleme (Futter)"],
  },
  {
    key: "Gesundheit-Detail (Futter)",
    label: "Gesundheitliche Probleme Details",
  },
  { key: "Allergien (Futter)", label: "Allergien" },
  { key: "Allergie-Detail (Futter)", label: "Allergien Details" },
  // 3) Futter
  {
    key: "Aktuelles Futter (Futter)",
    label: "Aktuelles Futter",
    // Manche Funnel-Versionen liefern das Feld ohne „(Futter)"-Suffix; als
    // Fallback aufnehmen, damit es nicht zusätzlich in „Weitere Angaben"
    // doppelt auftaucht.
    fallbackKeys: ["Aktuelles Futter"],
  },
];

// Kinderwunsch.
const KIWU_FIELDS: ReadOnlyField[] = [
  { key: "Geburtsdatum", label: "Geburtsdatum", format: "date" },
  { key: "Alter der Frau", label: "Alter der Frau" },
  { key: "Verheiratet?", label: "Verheiratet?" },
  { key: "Offen für Behandlung?", label: "Offen für Behandlung?" },
  { key: "Wie lange versucht?", label: "Wie lange versucht?" },
  { key: "Vorbehandlung", label: "Vorbehandlung" },
];

// Kindersparpläne (KSP-Funnel). Feldnamen tragen in Airtable das Suffix
// „(KSP)".
const KSP_FIELDS: ReadOnlyField[] = [
  { key: "Anzahl Kinder (KSP)", label: "Anzahl Kinder" },
  { key: "Alter der Kinder (KSP)", label: "Alter der Kinder" },
  { key: "Monatliche Sparrate (KSP)", label: "Monatliche Sparrate" },
  { key: "Zielbetrag (KSP)", label: "Zielbetrag (zum 18. Geburtstag)" },
  { key: "Zeithorizont (KSP)", label: "Zeithorizont" },
];

// Zahnzusatzversicherung (Zahnzusatz-Funnel). Feldnamen tragen in Airtable das
// Suffix „(Zahnzusatz)".
const ZAHNZUSATZ_FIELDS: ReadOnlyField[] = [
  { key: "Interesse (Zahnzusatz)", label: "Interesse an Zahnzusatz" },
  { key: "Fehlende Zähne (Zahnzusatz)", label: "Fehlende Zähne" },
];

// Privatschutz (Haftpflicht/Hausrat/Rechtsschutz …, Meta-Leadformular).
// Feldnamen tragen in Airtable das Suffix „(Privatschutz)".
const PRIVATSCHUTZ_FIELDS: ReadOnlyField[] = [
  { key: "Lebenssituation (Privatschutz)", label: "Lebenssituation" },
  {
    key: "Versicherungsinteresse (Privatschutz)",
    label: "Versicherungsinteresse",
  },
];

// Immer am Ende: Produkt, Status, Auslieferung.
export const TAIL_FIELDS: ReadOnlyField[] = [
  { key: "_produktEingang", label: "Produkt (Eingang)", format: "chip-product" },
  { key: "Bearbeitungsstatus", label: "Bearbeitungsstatus", format: "chip-status" },
  { key: "ausgeliefert_am", label: "ausgeliefert_am", format: "datetime" },
];

export type LeadKind =
  | "pkv"
  | "tier"
  | "kinderwunsch"
  | "hundefutter"
  | "kindersparplan"
  | "zahnzusatz"
  | "privatschutz"
  | "other";

export function firstString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  // Airtable liefert Number-Felder (z. B. "Monatlicher Beitrag",
  // "Kontaktversuche") als JS-Zahl, nicht als String. Boolean ebenfalls
  // direkt — beide stringifizieren, damit die Read-Only-Anzeige nicht
  // leer bleibt.
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "Ja" : "Nein";
  if (Array.isArray(v)) {
    for (const x of v) {
      if (typeof x === "string" && x.trim() && !x.startsWith("rec")) {
        return x.trim();
      }
      if (typeof x === "number" && Number.isFinite(x)) return String(x);
    }
  }
  return null;
}

// Produkt-Kategorie des Leads bestimmen — steuert, welche Feldgruppe angezeigt
// wird. „Tierart" gesetzt ⇒ Tier; sonst über Produktname/Slug/source.
export function detectLeadKind(
  source: string | null | undefined,
  fields: Record<string, unknown>,
): LeadKind {
  const hay = [
    source ?? "",
    firstString(fields["slug (from Produkt (Eingang))"]) ?? "",
    firstString(fields["Zielgruppe Bezeichnung (from Produkt (Eingang))"]) ?? "",
  ]
    .join(" ")
    .toLowerCase();
  // Hundefutter zuerst prüfen: Diese Leads tragen zwar „(Tier)"-Felder (Rasse,
  // Geschlecht …) und teils „Tierart", sind aber KEINE Versicherung. Erkennung
  // über den Produktnamen („futter") oder Futter-spezifische Funnel-Felder.
  const hasFutterField =
    firstString(fields["Aktuelles Futter (Futter)"]) != null ||
    firstString(fields["Futterbezeichnung (Futter)"]) != null ||
    firstString(fields["Aktivitätslevel (Futter)"]) != null;
  if (hay.includes("futter") || hasFutterField) return "hundefutter";
  // Kindersparpläne: Produktname („sparplan") oder ein gesetztes KSP-Funnelfeld.
  const hasKspField =
    firstString(fields["Anzahl Kinder (KSP)"]) != null ||
    firstString(fields["Zielbetrag (KSP)"]) != null ||
    firstString(fields["Monatliche Sparrate (KSP)"]) != null;
  if (hay.includes("sparplan") || hasKspField) return "kindersparplan";
  // Zahnzusatz: Produktname („zahnzusatz") oder ein gesetztes Zahnzusatz-Feld.
  const hasZahnField =
    firstString(fields["Interesse (Zahnzusatz)"]) != null ||
    firstString(fields["Fehlende Zähne (Zahnzusatz)"]) != null;
  if (hay.includes("zahnzusatz") || hasZahnField) return "zahnzusatz";
  // Privatschutz: Produktname („privatschutz") oder ein gesetztes Feld.
  const hasPrivatschutzField =
    firstString(fields["Lebenssituation (Privatschutz)"]) != null ||
    firstString(fields["Versicherungsinteresse (Privatschutz)"]) != null;
  if (hay.includes("privatschutz") || hasPrivatschutzField) return "privatschutz";
  // Verlässlichstes Signal: das Airtable-Feld „Tierart" wird nur bei echten
  // Tier(kranken)versicherungs-Funnels gesetzt.
  if (firstString(fields["Tierart"])) return "tier";
  // NUR echte Tierversicherung — „Hundefutter"/„Hundehalter" (enthalten „hund",
  // aber kein „versicherung") dürfen NICHT als Tier gelten.
  const hasAnimal = /(hund|katze|pferd|tier)/.test(hay);
  if ((hasAnimal && hay.includes("versicherung")) || /\btier\b/.test(hay))
    return "tier";
  if (/kinderwunsch|kiwu/.test(hay)) return "kinderwunsch";
  if (/pkv|wechsel|tarifopt|neugesch|beihilfe|krankenvoll/.test(hay))
    return "pkv";
  return "other";
}

export function fieldGroupFor(kind: LeadKind): ReadOnlyField[] {
  switch (kind) {
    case "tier":
      return TIER_FIELDS;
    case "hundefutter":
      return HUNDEFUTTER_FIELDS;
    case "kindersparplan":
      return KSP_FIELDS;
    case "zahnzusatz":
      return ZAHNZUSATZ_FIELDS;
    case "privatschutz":
      return PRIVATSCHUTZ_FIELDS;
    case "kinderwunsch":
      return KIWU_FIELDS;
    case "pkv":
      return PKV_FIELDS;
    default:
      return [];
  }
}

/** Alle Feldnamen (inkl. Fallbacks) sämtlicher Produktgruppen. */
export const ALL_GROUP_KEYS: string[] = [
  TIER_FIELDS,
  PKV_FIELDS,
  KIWU_FIELDS,
  HUNDEFUTTER_FIELDS,
  KSP_FIELDS,
  ZAHNZUSATZ_FIELDS,
  PRIVATSCHUTZ_FIELDS,
].flatMap((g) => g.flatMap((f) => [f.key, ...(f.fallbackKeys ?? [])]));

export type FormAnswer = { label: string; value: string };

/**
 * Formularangaben eines Leads als Label/Wert-Liste — nur die Felder der
 * erkannten Produktgruppe (Datenminimierung: keine internen/Abrechnungsfelder,
 * keine Kontaktdaten; die liegen separat am Lead).
 */
export function extractFormAnswers(
  source: string | null | undefined,
  fields: Record<string, unknown>,
): FormAnswer[] {
  const out: FormAnswer[] = [];
  for (const f of fieldGroupFor(detectLeadKind(source, fields))) {
    for (const key of [f.key, ...(f.fallbackKeys ?? [])]) {
      const v = firstString(fields[key]);
      if (v) {
        out.push({ label: f.label, value: v });
        break;
      }
    }
  }
  return out;
}

/**
 * Airtable-ähnliche Feld-Map aus den DB-Daten eines Leads — für Leads ohne
 * Airtable-Referenz (z. B. Demo-Daten), damit die Detailansicht trotzdem
 * Kontakt, Formularangaben und Status zeigt.
 */
export function fieldsFromLead(lead: {
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  source: string | null;
  formData: unknown;
}): Record<string, unknown> {
  const [vorname, ...rest] = (lead.name ?? "").trim().split(/\s+/);
  const fields: Record<string, unknown> = {
    Vorname: vorname || undefined,
    Nachname: rest.join(" ") || undefined,
    Telefonnummer: lead.phone ? `+${lead.phone}` : undefined,
    "E-Mail": lead.email ?? undefined,
    Bearbeitungsstatus: lead.status ?? undefined,
  };
  const group = fieldGroupFor(detectLeadKind(lead.source, {}));
  if (Array.isArray(lead.formData)) {
    for (const a of lead.formData as { label?: unknown; value?: unknown }[]) {
      if (typeof a?.label !== "string" || typeof a?.value !== "string") continue;
      const def = group.find((f) => f.label === a.label);
      fields[def?.key ?? a.label] = a.value;
    }
  }
  return fields;
}
