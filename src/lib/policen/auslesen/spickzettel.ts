// Spickzettel in der Terminvorbereitung (Policen auslesen, Paket 3 „Champions League“, 19.11.2026): reine Logik, testbar.
// Wer: Vermittler kurz vor dem Termin, oft am Handy. Aufgabe: ohne Scrollen sehen, was der Kunde zahlt und welche
// 1 bis 3 Fragen im Termin Geld bringen; ein Tipp öffnet die Vertragsseite.
// Jeder Zustand hat eine nächste Handlung (oder läuft automatisch). Texte kommen aus derselben Quelle wie auf der
// Vertragsseite (Fragen aus zusammenfassung.ts, Kopf, K6-Satz und Sperrgründe aus vertragsseite.ts).
// Keine Beratung und keine Bewertung (K8): nur die Fragen aus den festen Vorlagen.

import type { AuslesenSparte } from "@/lib/policen/auslesen/felder";
import type { Frage, Zusammenfassung } from "@/lib/policen/auslesen/zusammenfassung";
import { GRUND_TEXT, kopfZeile, SICHTBARE_FRAGEN, SPERRE_TEXT } from "@/lib/policen/auslesen/vertragsseite";

export type SpickzettelZustand = "nie_gebeten" | "gebeten" | "sparte_offen" | "wird_ausgelesen" | "ohne_ki" | "gesperrt" | "fertig";

/** Was der Spickzettel vom Vergleich braucht (Teilmenge von Vergleich aus server.ts). */
export type SpickzettelEingabe = {
  sperre: string | null;
  vertraege: { geprueft: boolean }[];
  offen: { documentId: string; status: string; datum: string }[];
  zusammenfassung: Pick<Zusammenfassung, "monatSumme" | "jahrSumme" | "vertraege" | "ungeprueft" | "fragen">;
};

export type SpickzettelAktion = { art: "unterlagen" | "original"; text: string; documentId?: string };

export type Spickzettel = {
  zustand: SpickzettelZustand;
  /** Hauptsatz (alle Zustände außer fertig) */
  text: string | null;
  /** Kurzer Hinweis zur nächsten Handlung (z. B. „Sonst im Termin …“) */
  hinweis: string | null;
  /** fertig: Beiträge im Monat (formatiert, null = unbekannt) und Zeile darunter, gleich wie auf der Vertragsseite */
  kopf: { monat: string | null; zeile: string } | null;
  ungeprueft: number;
  /** fertig: bis zu 3 Fragen, Rest als Anzahl („Mehr (n)“) */
  fragen: Frage[];
  mehr: number;
  /** Unterlage, deren Sparte der Vermittler mit einem Tipp wählt (Chips direkt im Spickzettel) */
  sparteWahl: { documentId: string; datum: string; frage: string; text: string } | null;
  /** fertig: kurze Zeilen zu Unterlagen, die (noch) nicht ausgelesen sind */
  neben: string[];
  aktion: SpickzettelAktion | null;
};

const LAUFEND = new Set(["neu", "laeuft"]);
const WAHL = new Set(["sparte_offen", "sparte_abweichend"]);
/** Sperren, bei denen der Spickzettel ohne ausgelesene Verträge schweigt (Funktion aus bzw. nicht freigeschaltet): dann
 *  ist die aufgeklappte Unterlagen-Liste die Handlung. */
const STILL: ReadonlySet<string> = new Set(["aus", "pause", "kunde"]);

const tagMonat = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(new Date(iso));
const unterlagen = (n: number) => (n === 1 ? "1 Unterlage" : `${n} Unterlagen`);

export const SPICKZETTEL_TEXT = {
  nieGebeten: "Noch keine Policen. Ihr Assistent bittet vor dem Termin darum.",
  gebeten: (am: string) => `Um Policen gebeten am ${tagMonat(am)}, noch keine Antwort.`,
  gebetenHinweis: "Sonst im Termin nach den Policen fragen.",
  sparteOffen: (n: number) => `${unterlagen(n)} ${n === 1 ? "wartet" : "warten"} auf Ihre Sparten-Wahl.`,
  laufend: (n: number) => `${unterlagen(n)} ${n === 1 ? "wird" : "werden"} noch ausgelesen.`,
  nichtAusgelesen: (n: number) => `${unterlagen(n)} ${n === 1 ? "wird" : "werden"} nicht automatisch ausgelesen.`,
  unterlagenAnsehen: "Unterlagen ansehen",
  imOriginal: "Im Original ansehen",
} as const;

const leer = (zustand: SpickzettelZustand, text: string, x: Partial<Spickzettel> = {}): Spickzettel => ({
  zustand,
  text,
  hinweis: null,
  kopf: null,
  ungeprueft: 0,
  fragen: [],
  mehr: 0,
  sparteWahl: null,
  neben: [],
  aktion: null,
  ...x,
});

/**
 * Zustand und Inhalt des Spickzettels. v = Vergleich (null: keine Unterlagen bzw. Admin-Vorschau), gebetenAm = erste
 * Policen-Bitte im Chat (ISO, aus den vorhandenen Strecken-Einträgen), policenAn = Policen per WhatsApp eingerichtet.
 * null = nichts anzeigen.
 */
export function spickzettel(v: SpickzettelEingabe | null, o: { gebetenAm: string | null; policenAn: boolean }): Spickzettel | null {
  const offen = v?.offen ?? [];
  if (!v || (!v.vertraege.length && !offen.length)) {
    if (o.gebetenAm) return leer("gebeten", SPICKZETTEL_TEXT.gebeten(o.gebetenAm), { hinweis: SPICKZETTEL_TEXT.gebetenHinweis });
    return o.policenAn ? leer("nie_gebeten", SPICKZETTEL_TEXT.nieGebeten) : null;
  }
  const sperre = v.sperre;
  const wahl = sperre ? undefined : offen.find((x) => WAHL.has(x.status));
  const nWahl = sperre ? 0 : offen.filter((x) => WAHL.has(x.status)).length;
  const sparteWahl = wahl
    ? { documentId: wahl.documentId, datum: wahl.datum, frage: GRUND_TEXT[wahl.status] ?? GRUND_TEXT.sparte_offen, text: SPICKZETTEL_TEXT.sparteOffen(nWahl) }
    : null;
  const nLaufend = sperre ? 0 : offen.filter((x) => LAUFEND.has(x.status)).length;
  const nRest = offen.length - nWahl - nLaufend;

  // Kurze Zeilen zu Unterlagen, die (noch) nicht ausgelesen sind (die Sparten-Wahl steht mit Chips extra)
  const neben = [nLaufend ? SPICKZETTEL_TEXT.laufend(nLaufend) : null, nRest ? SPICKZETTEL_TEXT.nichtAusgelesen(nRest) : null].filter((x): x is string => !!x);

  if (v.vertraege.length) {
    const z = v.zusammenfassung;
    return {
      ...leer("fertig", ""),
      text: null,
      kopf: kopfZeile(z),
      ungeprueft: z.ungeprueft,
      fragen: z.fragen.slice(0, SICHTBARE_FRAGEN),
      mehr: Math.max(0, z.fragen.length - SICHTBARE_FRAGEN),
      sparteWahl,
      neben,
    };
  }

  // Ohne ausgelesene Verträge, aber mit Unterlagen
  if (sperre === "ohne_ki") return leer("ohne_ki", SPERRE_TEXT.ohne_ki, { aktion: { art: "unterlagen", text: SPICKZETTEL_TEXT.unterlagenAnsehen } });
  if (sperre && STILL.has(sperre)) return null;
  if (sperre) return leer("gesperrt", SPERRE_TEXT[sperre] ?? GRUND_TEXT.limit, { aktion: { art: "unterlagen", text: SPICKZETTEL_TEXT.unterlagenAnsehen } });
  if (sparteWahl) return leer("sparte_offen", SPICKZETTEL_TEXT.sparteOffen(nWahl), { sparteWahl, neben });
  if (nLaufend) return leer("wird_ausgelesen", GRUND_TEXT.neu);
  const nichtAus = offen.filter((x) => !WAHL.has(x.status) && !LAUFEND.has(x.status));
  const einer = nichtAus.length === 1 ? nichtAus[0] : null;
  return leer("gesperrt", einer ? (GRUND_TEXT[einer.status] ?? GRUND_TEXT.limit) : SPICKZETTEL_TEXT.nichtAusgelesen(nichtAus.length), {
    aktion: einer ? { art: "original", text: SPICKZETTEL_TEXT.imOriginal, documentId: einer.documentId } : { art: "unterlagen", text: SPICKZETTEL_TEXT.unterlagenAnsehen },
  });
}

/** Unterlagen-Liste in der Terminvorbereitung aufgeklappt? Ja, wenn sie die nächste Handlung ist. */
export const unterlagenAufgeklappt = (s: Spickzettel | null, anzahl: number) =>
  anzahl > 0 && (!s || s.zustand === "ohne_ki" || s.aktion?.art === "unterlagen");

/** Chat-Sparte (lib/whatsapp/vorvertraege.ts VERTRAG_SPARTEN) je ausgelesener Sparte. Leben/Rente bleibt offen (im Chat
 *  getrennt nach Risikoleben und Altersvorsorge, nicht eindeutig). */
const CHAT_SPARTE: Partial<Record<AuslesenSparte, string>> = {
  haftpflicht: "Haftpflicht",
  hausrat: "Hausrat",
  kfz: "Kfz",
  wohngebaeude: "Wohngebäude",
  rechtsschutz: "Rechtsschutz",
  pkv: "Private Krankenversicherung",
  bu: "Berufsunfähigkeit",
};

/** Chat-Sparten, die ausgelesen vorliegen: deren „Bestehende Verträge aus dem Chat“ werden ausgeblendet (kein doppeltes
 *  Konzept, die Unterlage ersetzt die Chat-Angabe). Nur Verträge mit Werten. */
export function chatSpartenAusgelesen(vertraege: readonly { sparte: AuslesenSparte; status: string }[]): string[] {
  return [...new Set(vertraege.filter((x) => x.status === "ausgelesen").map((x) => CHAT_SPARTE[x.sparte]).filter((x): x is string => !!x))];
}
