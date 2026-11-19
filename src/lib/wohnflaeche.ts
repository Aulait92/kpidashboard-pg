// Wohnfläche aus einer freien Antwort lesen (Ole, 19.11.2026: die Knöpfe „Bis 60 m²“ usw. reichen dem Rechner nicht).
// „72“, „72 qm“, „72m²“, „ca. 75“, „75,5“, „etwa 80 Quadratmeter“, „knapp 90“, „1.200“; Spanne „60 bis 80“ → Mittelwert.
// Plausibel 10 bis 1000 m². Rein, ohne Datenbank.

import { WEISS_NICHT_RE } from "@/lib/datum-antwort";

export const WOHNFLAECHE_MIN = 10;
export const WOHNFLAECHE_MAX = 1000;

export type WohnflaecheAntwort =
  | { art: "zahl"; qm: number }
  | { art: "spanne"; von: number; bis: number; qm: number }
  | { art: "unplausibel"; qm: number }
  | { art: "weiss_nicht" };

/** „1.200“ (Tausenderpunkt), „75,5“, „75.5“ als Zahl. */
function zahl(s: string): number {
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  return Number(s.replace(",", "."));
}

const ZAHL = String.raw`\d{1,3}(?:\.\d{3})+(?!\d)|\d+(?:[.,]\d+)?`;

/** null = keine Zahl erkannt (z. B. eine Rückfrage). */
export function wohnflaecheLesen(text: string | null | undefined): WohnflaecheAntwort | null {
  const t = (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;
  const spanne = new RegExp(`(${ZAHL}) ?(?:m²|m2|qm)? ?(?:bis|-|–|und|oder|zu) ?(${ZAHL})`).exec(t);
  if (spanne) {
    const von = zahl(spanne[1]);
    const bis = zahl(spanne[2]);
    if (von < bis) {
      const qm = Math.round((von + bis) / 2);
      return qm >= WOHNFLAECHE_MIN && qm <= WOHNFLAECHE_MAX ? { art: "spanne", von, bis, qm } : { art: "unplausibel", qm };
    }
  }
  const m = new RegExp(`(${ZAHL})`).exec(t);
  if (m) {
    const qm = Math.round(zahl(m[1]) * 10) / 10;
    return qm >= WOHNFLAECHE_MIN && qm <= WOHNFLAECHE_MAX ? { art: "zahl", qm } : { art: "unplausibel", qm };
  }
  if (WEISS_NICHT_RE.test(t)) return { art: "weiss_nicht" };
  return null;
}

/** „72 m²“, „75,5 m²“ */
export const qmText = (qm: number) => `${qm.toLocaleString("de-DE", { maximumFractionDigits: 1 })} m²`;
