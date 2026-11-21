// Plausibilitätsregeln nach dem Auslesen (rein, ohne KI, ohne Datenbank). Läuft nach bereinige() und setzt Werte,
// die so in einer Police kaum vorkommen, auf „pruefen“ (der Vermittler sieht „bitte prüfen“ am Feld, Rechtsprüfung K6).
// Es wird nichts geändert oder geschätzt, nur markiert. Eine Bewertung des Vertrags ist das nicht (K8).

import { monatsbetrag, type AuslesenSparte, type Felder } from "@/lib/policen/auslesen/felder";

export const SACH_SPARTEN: readonly AuslesenSparte[] = ["haftpflicht", "hausrat", "kfz", "wohngebaeude", "rechtsschutz"];

/** Grenzen der Regeln (eine Stelle, damit Tests und Doku dieselben Zahlen nennen). */
export const PLAUSIBEL = {
  fristMaxMonate: 12,
  monatMaxSach: 500,
  deckungMin: 1_000_000,
  summeMin: 1_000,
} as const;

/** Schlüssel der Felder, die unplausibel sind (in fester Reihenfolge, ohne Doppelte). */
export function unplausibel(f: Felder, sparte: AuslesenSparte): string[] {
  const raus = new Set<string>();
  const beginn = f.beginn?.w;
  const ablauf = f.ablauf?.w;
  if (typeof beginn === "string" && typeof ablauf === "string" && ablauf < beginn) {
    raus.add("beginn");
    raus.add("ablauf");
  }
  const frist = f.kuendigungsfrist_monate?.w;
  if (typeof frist === "number" && frist > PLAUSIBEL.fristMaxMonate) raus.add("kuendigungsfrist_monate");
  const monat = monatsbetrag(f);
  if (SACH_SPARTEN.includes(sparte) && monat != null && monat > PLAUSIBEL.monatMaxSach) raus.add("beitrag");
  const deckung = f.deckungssumme?.w;
  if (typeof deckung === "number" && deckung < PLAUSIBEL.deckungMin) raus.add("deckungssumme");
  const summe = f.versicherungssumme?.w;
  if (typeof summe === "number" && summe < PLAUSIBEL.summeMin) raus.add("versicherungssumme");
  return [...raus];
}

/** Felder mit unplausiblen Werten auf „pruefen“ setzen (neues Objekt, Werte unverändert). */
export function plausibel(f: Felder, sparte: AuslesenSparte): Felder {
  const raus = unplausibel(f, sparte);
  if (!raus.length) return f;
  const neu: Felder = { ...f };
  for (const k of raus) if (neu[k]) neu[k] = { ...neu[k], s: "pruefen" };
  return neu;
}
