// KI-Einstufung „später relevant“ für Cold-Mail-Antworten (Ole, 18.11.2026: Norbert Tetenborg wollte laut
// Antwort später Leads, landete aber nicht im Später-Follow-up). Ergänzt die Regeln aus lib/vertrieb/spaeter.ts:
// die Regeln greifen immer (auch ohne KI), die KI nur bei Antworten mit Hinweis auf einen späteren Zeitpunkt.
// Gleicher KI-Weg wie die Follow-up-Texte (claudeCall + runAgent, ohne Gedankenstriche). Klare Absagen
// („kein Interesse“, „bitte nicht mehr schreiben“) kommen nie ins Später-Follow-up, auch wenn die KI „später“ meint.
import { claudeCall, runAgent, type LlmCall } from "@/lib/kampagnen/llm";
import type { Valid } from "@/lib/kampagnen/types";
import { reportError } from "@/lib/monitoring";
import { dayKey } from "@/lib/vertrieb/dates";
import { hasLaterHint, isClearDecline, laterTiming, workdayMorning } from "@/lib/vertrieb/spaeter";

export type KiKategorie = "spaeter" | "absage" | "interesse" | "automatisch" | "sonstiges";
export type KiEinstufung = { kategorie: KiKategorie; datum: string | null; zeitpunkt: string | null; grund: string };

const KATEGORIEN: KiKategorie[] = ["spaeter", "absage", "interesse", "automatisch", "sonstiges"];
const TIMEOUT_MS = 45_000;

/** KI nur mit Schlüssel (wie die Follow-up-Texte). */
export function spaeterLlm(): LlmCall | null {
  return process.env.ANTHROPIC_API_KEY ? claudeCall : null;
}

const SCHEMA = {
  type: "object",
  properties: {
    kategorie: { type: "string", enum: KATEGORIEN },
    datum: { type: ["string", "null"] },
    zeitpunkt: { type: ["string", "null"] },
    grund: { type: "string" },
  },
  required: ["kategorie", "datum", "zeitpunkt", "grund"],
  additionalProperties: false,
};

function validate(antwortAm: Date) {
  return (x: unknown): Valid<KiEinstufung> => {
    const o = (x ?? {}) as Record<string, unknown>;
    const errors: string[] = [];
    const kategorie = o.kategorie as KiKategorie;
    if (!KATEGORIEN.includes(kategorie)) errors.push(`kategorie muss eine von ${KATEGORIEN.join(", ")} sein.`);
    let datum = typeof o.datum === "string" && o.datum.trim() ? o.datum.trim() : null;
    if (datum && !/^\d{4}-\d{2}-\d{2}$/.test(datum)) errors.push("datum im Format JJJJ-MM-TT oder null.");
    if (datum && /^\d{4}-\d{2}-\d{2}$/.test(datum)) {
      const d = new Date(`${datum}T12:00:00Z`);
      // Unplausible Daten (vor der Antwort, Tippfehler, Jahre entfernt) verwerfen: dann Standard-Abstand
      if (isNaN(d.getTime()) || d.getTime() < antwortAm.getTime() + 7 * 86_400_000 || d.getTime() > antwortAm.getTime() + 3 * 365 * 86_400_000) datum = null;
    }
    const zeitpunkt = typeof o.zeitpunkt === "string" && o.zeitpunkt.trim() ? o.zeitpunkt.trim().slice(0, 40) : null;
    const grund = typeof o.grund === "string" ? o.grund.trim().slice(0, 200) : "";
    return errors.length ? { ok: false, errors } : { ok: true, value: { kategorie, datum, zeitpunkt, grund } };
  };
}

/** Eine Antwort per KI einstufen (ohne Vorfilter). Wirft bei Fehlern. */
export async function kiEinstufen(text: string, antwortAm: Date, llm: LlmCall): Promise<KiEinstufung> {
  const heute = dayKey(antwortAm);
  const system = `Du stufst Antworten von Versicherungsvermittlern auf eine Cold-Mail ein. Wir bieten Vermittlern neue Kunden bzw. Leads an.

Kategorien:
- "spaeter": Der Vermittler will jetzt nicht, zeigt aber Interesse für einen späteren Zeitpunkt (zum Beispiel "gerne später", "nächstes Jahr wieder", "aktuell nicht, aber im Frühjahr", "melden Sie sich in 3 Monaten", "momentan ausgelastet, später gerne").
- "absage": Klare Ablehnung ohne Hinweis auf später (zum Beispiel "kein Interesse", "bitte nicht mehr schreiben", "kein Bedarf", Ruhestand).
- "interesse": Will jetzt sprechen, Infos oder einen Termin.
- "automatisch": Abwesenheitsnotiz, Eingangsbestätigung, Unzustellbar.
- "sonstiges": alles andere.

Datum (nur bei "spaeter", sonst null), ausgehend vom Antwortdatum ${heute}, immer in der Zukunft:
- genannter Monat: der 1. dieses Monats (im nächsten Jahr, wenn er schon vorbei ist)
- "im Frühjahr": 1. März; "im Sommer": 15. Juni; "nach dem Sommer" oder "im Herbst": 1. September; "zum Jahresende": 1. Dezember
- "nächstes Jahr", "im neuen Jahr", "nach dem Jahreswechsel": 15. Januar des Folgejahres
- "in N Monaten" oder "in N Wochen": Antwortdatum plus diesen Abstand
- kein Zeitpunkt genannt: null
Format JJJJ-MM-TT.

zeitpunkt: kurze Angabe, die in den Satz "dass das Thema ... wieder interessant für Sie wird" passt, zum Beispiel "im Frühjahr", "ab März", "im neuen Jahr", "in einigen Monaten"; ohne Zeitpunkt null.
grund: ein kurzer Satz, warum (ohne Gedankenstriche).
Antworte nur mit dem JSON-Objekt.`;
  const user = `Antwort vom ${heute}:\n${text.slice(0, 2000)}`;
  const run = runAgent(llm, { agent: "Später-Erkennung", system, user, schema: SCHEMA, maxTokens: 4000 }, validate(antwortAm));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Später-Erkennung: Zeitüberschreitung")), TIMEOUT_MS);
  });
  try {
    return (await Promise.race([run, timeout])).value;
  } finally {
    clearTimeout(timer);
  }
}

export type SpaeterKiTreffer = { dueAt: Date; timing: string | null; grund: string };

/**
 * „Später relevant“ per KI, nur für echte Antworten mit Hinweis auf später (Vorfilter, spart Aufrufe) und nie
 * für klare Absagen. Ohne Schlüssel, bei Fehlern oder anderer Kategorie: null. Zeitpunkt aus der KI, sonst aus
 * den Regeln, sonst Standard-Abstand (3 Monate nach der Antwort).
 */
export async function spaeterPerKi(text: string, antwortAm: Date, opts: { llm?: LlmCall | null; seed?: string } = {}): Promise<SpaeterKiTreffer | null> {
  const llm = opts.llm === undefined ? spaeterLlm() : opts.llm;
  if (!llm || !text.trim() || isClearDecline(text) || !hasLaterHint(text)) return null;
  let k: KiEinstufung;
  try {
    k = await kiEinstufen(text, antwortAm, llm);
  } catch (e) {
    reportError(e, "spaeter-ki");
    return null;
  }
  if (k.kategorie !== "spaeter") return null;
  const regel = laterTiming(text, antwortAm, opts.seed ?? "");
  if (k.datum) return { dueAt: workdayMorning(k.datum, opts.seed ?? ""), timing: k.zeitpunkt ?? regel.label, grund: k.grund };
  return { dueAt: regel.date, timing: regel.label ?? k.zeitpunkt, grund: k.grund };
}
