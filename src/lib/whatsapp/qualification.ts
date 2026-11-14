// Qualifizierung des KI-Assistenten strukturiert (Conversation.qualificationData):
// feste Punkte statt Fließtext mit Semikolons, damit die Seitenleiste im Chat
// sie als ruhige Zeilen zeigen kann. Der Bot liefert sie über record_qualification
// (Feld „angaben“); ältere Konversationen haben nur den Fließtext.

export const QUALIFICATION_FIELDS = [
  { key: "lebenssituation", label: "Lebenssituation", hint: "z. B. Alleinerziehend, Familie mit Kindern, Single" },
  { key: "interesse", label: "Interesse", hint: "Sparten bzw. Thema, z. B. Unfall, Haftpflicht" },
  { key: "vorhanden", label: "Vorhanden", hint: "bestehende Verträge, z. B. Haftpflicht (über 10 Jahre alt) oder keine" },
  { key: "kinder", label: "Kinder", hint: "z. B. Sohn, 9" },
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
