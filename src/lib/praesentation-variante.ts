// Beratungspräsentation: Fassungen für Splittests (Ole, 19.11.2026: „konstant Splittests fahren und Conversion-Rates
// hochtesten“). Seit 19.11.2026 gilt für alle Termine Fassung B (Abschluss-Dramaturgie: ohne Folie „Worauf es ankommt“,
// Preis pro Tag groß, Entscheidung mit Zusammenfassung und „Ja, so machen wir es“, Zusage im Kundenlink); die alte
// Fassung A ist abgeschaltet (Ole: „100 % aller Leads“). Die Infrastruktur bleibt für den nächsten Test: Variante im
// Kundenlink, PraesentationEreignis.variante, Abschlussquote je Variante (lib/praesentation-messung.ts), und
// ereignisSpeichern meldet die Zusage schon als Ziel „zusage“ an das Experiment PRAESENTATION_EXPERIMENT.
//
// Neuen Herausforderer anschließen (lib/experimente.ts):
//   1. Neue Fassung als Variante ergänzen (z. B. "C") und in lib/praesentation.ts (folien) umsetzen.
//   2. In EXPERIMENTE eintragen: praesentation: { titel, ziel: "zusage", a: "Fassung B (Standard)", b: "Herausforderer" }.
//   3. praesentationsVariante async machen (Aufrufer: termin-vorbereitung-server.ts loadPraesentation, lib/praesentation-
//      messung.ts ereignisSpeichern) und auf den Server verschieben, weil diese Datei auch im Client (Kundenlink) läuft:
//      `(await variante(PRAESENTATION_EXPERIMENT, einheit, { merken })) === "b" ? "C" : "B"`; lesen ohne merken beim
//      Laden, zuteilen (merken) erst beim Zeigen einer Folie in ereignisSpeichern. Notschalter EXPERIMENTE_AUS gibt "a".

export type PraesentationVariante = "A" | "B";

export const PRAESENTATION_VARIANTEN: readonly PraesentationVariante[] = ["A", "B"];

/** Schlüssel für einen künftigen Test in EXPERIMENTE (lib/experimente.ts); derzeit nicht eingetragen. */
export const PRAESENTATION_EXPERIMENT = "praesentation";

export const istVariante = (v: unknown): v is PraesentationVariante => v === "A" || v === "B";

/**
 * Fassung der Präsentation für einen Lead (Einheit: Lead-ID, ohne Lead die Termin-ID). Seit 19.11.2026 immer B, für
 * alle Leads, die Demo und auch bei EXPERIMENTE_AUS; ein neuer Test wird wie oben beschrieben angeschlossen.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function praesentationsVariante(einheit?: string | null): PraesentationVariante {
  return "B";
}

/** Kundenlink: Abschluss-Leiste („Ja, so machen wir es“) nur in Variante B und nur mit gewählten Tarifen. */
export const mitAbschlussLeiste = (variante: PraesentationVariante, produkte: string[]) => variante === "B" && produkte.length > 0;
