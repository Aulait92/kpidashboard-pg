// Gesundheitsangaben aus Leadformularen (Art. 9 DSGVO, § 203 StGB; Anwalts-Memo Punkt 3, Ole 15.11.2026):
// Vorerkrankungen, Diagnosen, Behandlungen, BMI usw. gehen nicht an die KI und nicht per WhatsApp raus.
// Der Vermittler sieht sie nur im Kontakt, als vertraulich markiert. Erkannt an der Frage (Label) und an
// eindeutigen Begriffen in der Antwort. Tierangaben (Tierkrankenversicherung) sind keine Gesundheitsdaten
// einer Person und bleiben für den Assistenten sichtbar.

type Answer = { label: string; value: string };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// Fragen nach der Gesundheit einer Person
const LABEL_RE =
  /(gesundheit|vorerkrank|erkrank|krankheit|krankenhaus|krankschreib|diagnos|behandl|therapie|therapeut|medikament|arznei|\bbmi\b|körpergewicht|\bgewicht\b|körpergröße|raucher|schwanger|behinder|operation|operiert|psych|pflegegrad|pflegebedürft|arbeitsunfähig|allergi|blutdruck|diabet|zähne|zahnlücke|zahnstatus|parodont|kieferorthop|beschwerden|unfallfolge|\breha\b|rehabilitation|sehhilfe|hörgerät)/;
// Eindeutige Begriffe in Antworten (z. B. Freitext „Anmerkungen“)
const VALUE_RE =
  /(vorerkrank|diagnos|erkrankung|diabet|krebs|tumor|depress|burn-?out|psychotherap|psychiatr|therapie|medikament|schwanger|bandscheib|herzinfarkt|schlaganfall|\bhiv\b|asthma|bluthochdruck|operiert|krankenhausaufenthalt|\breha\b|behinderung|pflegegrad|\bbmi\b)/;
// Angaben zu Tieren (Tierkrankenversicherung, Futter-Funnel)
const TIER_RE = /(\btier\b|\(tier\)|\bhund|\bkatze|\bpferd|futter|rasse|kastriert)/;

/** Ist diese Formularangabe eine Gesundheitsangabe einer Person? */
export function isHealthAnswer(a: Answer): boolean {
  const label = norm(a.label ?? "");
  if (TIER_RE.test(label)) return false;
  return LABEL_RE.test(label) || VALUE_RE.test(norm(a.value ?? ""));
}

/** Nur die Frage prüfen (z. B. Airtable-Feldnamen in der Kontaktansicht). */
export function isHealthLabel(label: string): boolean {
  const l = norm(label);
  return !TIER_RE.test(l) && LABEL_RE.test(l);
}

/** Formularangaben aufteilen: unbedenklich (für Assistent und Texte) und Gesundheitsangaben (nur Vermittler). */
export function splitHealthAnswers<T extends Answer>(answers: T[]): { normal: T[]; health: T[] } {
  const normal: T[] = [];
  const health: T[] = [];
  for (const x of answers) (isHealthAnswer(x) ? health : normal).push(x);
  return { normal, health };
}

/** Platzhalter, der statt einer Gesundheitsangabe aus dem Chat an die KI geht. */
export const HEALTH_REDACTED = "[Gesundheitsangabe ausgeblendet, nur für den Berater sichtbar]";

/** Lead zu einer Tierversicherung (Katze, Hund, Pferd, TKV)? Dann sind Krankheitsangaben keine Art.-9-Daten. */
export function istTierLead(source: string | null | undefined): boolean {
  return /katze|kater|\bhund|tier|\btkv\b|pferd/i.test(source ?? "");
}

/**
 * Gesundheitsangaben einer Person in einer Chatnachricht des Leads vor der KI ausblenden (Art. 9 DSGVO,
 * Datenminimierung nach Art. 5 Abs. 1 lit. c und Art. 25 DSGVO; Rechtsprüfung 16.11.2026). Sätze mit eindeutigen
 * Begriffen werden durch einen Platzhalter ersetzt; in der Datenbank und für den Vermittler bleibt die Nachricht
 * vollständig. Bei Tier-Leads oder Sätzen über ein Tier bleibt der Text: Tiergesundheit ist keine Gesundheitsangabe
 * einer natürlichen Person (Art. 4 Nr. 15 DSGVO).
 */
export function redactHealthText(text: string, opts: { tier?: boolean } = {}): string {
  if (opts.tier || !VALUE_RE.test(norm(text))) return text;
  const parts = text.split(/(?<=[.!?\n])\s*/);
  const out: string[] = [];
  for (const s of parts) {
    const n = norm(s);
    const hide = VALUE_RE.test(n) && !TIER_RE.test(n);
    if (!hide) out.push(s.trim());
    else if (out[out.length - 1] !== HEALTH_REDACTED) out.push(HEALTH_REDACTED);
  }
  return out.filter(Boolean).join(" ");
}

/** Regel für den System-Prompt des Assistenten. */
export const GESUNDHEITS_REGEL =
  `- Frage nie nach Gesundheitsangaben (Vorerkrankungen, Diagnosen, Behandlungen, Medikamente, Größe und Gewicht). Nennt der Lead welche, wiederhole sie nicht, halte sie nicht fest (auch nicht in record_qualification) und sag freundlich, dass das der Berater persönlich im Termin bespricht. Steht im Verlauf „${HEALTH_REDACTED}“, hat der Lead dort etwas zu seiner Gesundheit geschrieben: nicht nachfragen, nur kurz sagen, dass der Berater das im Termin bespricht.`;
