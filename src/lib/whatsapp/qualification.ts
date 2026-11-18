// Qualifizierung des KI-Assistenten strukturiert (Conversation.qualificationData):
// feste Punkte statt Fließtext mit Semikolons, damit die Seitenleiste im Chat
// sie als ruhige Zeilen zeigen kann. Der Bot liefert sie über record_qualification
// (Feld „angaben“); ältere Konversationen haben nur den Fließtext.

export const QUALIFICATION_FIELDS = [
  { key: "lebenssituation", label: "Lebenssituation", hint: "z. B. Alleinerziehend, Familie mit Kindern, Single" },
  { key: "interesse", label: "Interesse", hint: "Sparten bzw. Thema, z. B. Unfall, Haftpflicht" },
  { key: "vorhanden", label: "Vorhanden", hint: "bestehende Verträge, z. B. Haftpflicht (über 10 Jahre alt) oder keine" },
  { key: "kinder", label: "Kinder", hint: "z. B. Sohn, 9" },
  // Angebotsangaben Privatschutz (Ole, 15.11.2026, siehe lib/whatsapp/produkt-fragen)
  { key: "versichern", label: "Zu versichern", hint: "z. B. nur Lead, mit Partner, Familie" },
  { key: "geburt", label: "Geburtsdatum", hint: "z. B. 22.08.1992" },
  { key: "plz", label: "Adresse/PLZ", hint: "PLZ, bei Hausrat und Wohngebäude mit Straße und Hausnummer, z. B. 12209 Berlin, Achenseeweg 11a" },
  { key: "wohnflaeche", label: "Wohnfläche", hint: "z. B. 75 m², ständig bewohnt" },
  { key: "beruf", label: "Beruf", hint: "z. B. Angestellte Bürokauffrau, Beamter, selbstständig" },
  { key: "bereiche", label: "Rechtsschutz-Bereiche", hint: "z. B. Privat, Beruf, Verkehr, Wohnen (Mieter)" },
  { key: "gebaeude", label: "Gebäude", hint: "z. B. 2 Wohneinheiten, Bj. 2000, 78 m², teilw. vermietet, Keller mit Wohnfläche, Wärmepumpe, PV" },
  { key: "tier", label: "Tier", hint: "z. B. Katze Bernd, männlich, geb. 01.01.2025, Abessinier, Wohnungskatze, Zähne behandelt" },
  // Gesundheit des Tieres (TKV, feste Frage nach der Buchung, lib/whatsapp/tier-fragen.ts); keine Art.-9-Daten
  { key: "tiergesundheit", label: "Gesundheit (Tier)", hint: "nur Tiere: z. B. gesund oder War in Behandlung: Zahnbehandlung im Frühjahr" },
  { key: "tarifwunsch", label: "Gewünschter Schutz", hint: "z. B. nur OP-Schutz oder volle Krankenversicherung" },
  { key: "vorschaeden", label: "Vorschäden (5 Jahre)", hint: "je Art mit Anzahl, z. B. Hausrat 0, Fahrraddiebstahl 1; oder offen" },
  { key: "anlass", label: "Anlass", hint: "z. B. Umzug, Schaden, Geburt" },
  { key: "einwaende", label: "Einwände", hint: "Bedenken oder Fragen des Leads" },
  { key: "wunsch", label: "Wunsch", hint: "Telefon oder Videocall, Wunschzeit" },
  { key: "sonstiges", label: "Sonstiges", hint: "alles Weitere, kurz" },
] as const;

export type QualificationKey = (typeof QUALIFICATION_FIELDS)[number]["key"];
export type QualificationData = Partial<Record<QualificationKey, string>>;

const KEYS = new Set<string>(QUALIFICATION_FIELDS.map((f) => f.key));
const MAX_LEN = 200;

/** Eingabe (Tool-Input oder gespeichertes JSON) defensiv auf bekannte, nicht leere Punkte reduzieren. */
export function cleanQualificationData(raw: unknown): QualificationData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: QualificationData = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!KEYS.has(k)) continue;
    const text = Array.isArray(v) ? v.filter((x) => typeof x === "string").join(", ") : typeof v === "string" ? v : "";
    const t = text.replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
    if (t) out[k as QualificationKey] = t;
  }
  return out;
}

/** Neue Angaben über die bisherigen legen (der Bot meldet oft nur, was neu dazukam). */
export function mergeQualificationData(prev: unknown, next: unknown): QualificationData | null {
  const merged = { ...cleanQualificationData(prev), ...cleanQualificationData(next) };
  return Object.keys(merged).length ? merged : null;
}

/** Punkte in fester Reihenfolge für die Anzeige. */
export function qualificationPoints(raw: unknown): { key: QualificationKey; label: string; value: string }[] {
  const data = cleanQualificationData(raw);
  return QUALIFICATION_FIELDS.flatMap((f) => (data[f.key] ? [{ key: f.key, label: f.label, value: data[f.key]! }] : []));
}

/** Für den System-Prompt: „Lebenssituation: Alleinerziehend“ je Zeile. */
export function qualificationLines(raw: unknown): string {
  return qualificationPoints(raw)
    .map((p) => `${p.label}: ${p.value}`)
    .join("\n");
}

/** JSON-Schema für das Tool record_qualification (Feld „angaben“). */
export const QUALIFICATION_INPUT_SCHEMA = {
  type: "object",
  description:
    "Die erfassten Angaben als einzelne, kurze Punkte (Stichworte, keine ganzen Sätze). Nur Punkte angeben, die du wirklich kennst.",
  properties: Object.fromEntries(QUALIFICATION_FIELDS.map((f) => [f.key, { type: "string", description: f.hint }])),
} as const;
