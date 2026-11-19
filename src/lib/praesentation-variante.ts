// Splittest der Beratungspräsentation (Ole, 19.11.2026: „konstant Splittests fahren und Conversion-Rates hochtesten“).
// A = bisherige Fassung, B = Abschluss-Dramaturgie (ohne Folie „Worauf es ankommt“, Preis pro Tag groß, Entscheidung
// mit Zusammenfassung und „Ja, so machen wir es“, Zusage im Kundenlink).
//
// PLATZHALTER bis zum Experiment-Modul (src/lib/experimente.ts, anderes Team): beim Zusammenführen den Körper von
// praesentationsVariante durch `variante("praesentation", leadId)` ersetzen und in lib/praesentation-messung.ts
// (ereignisSpeichern) zusätzlich `ereignis("praesentation", leadId, ziel)` aufrufen. Die Werte "A" | "B" bleiben.

export type PraesentationVariante = "A" | "B";

export const PRAESENTATION_VARIANTEN: readonly PraesentationVariante[] = ["A", "B"];

export const istVariante = (v: unknown): v is PraesentationVariante => v === "A" || v === "B";

/** Fester Hash je Lead (FNV-1a), gleichmäßig auf A und B verteilt; ohne Lead (z. B. Demo) die neue Fassung B. */
export function praesentationsVariante(leadId: string | null | undefined): PraesentationVariante {
  if (!leadId) return "B";
  let h = 0x811c9dc5;
  for (let i = 0; i < leadId.length; i++) {
    h ^= leadId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 2 === 0 ? "A" : "B";
}

/** Kundenlink: Abschluss-Leiste („Ja, so machen wir es“) nur in Variante B und nur mit gewählten Tarifen. */
export const mitAbschlussLeiste = (variante: PraesentationVariante, produkte: string[]) => variante === "B" && produkte.length > 0;
