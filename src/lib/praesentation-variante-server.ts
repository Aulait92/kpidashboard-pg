// Fassung der Beratungspräsentation je Lead (nur Server): Splittest B (Standard) gegen C (Herausforderer) über das
// Experiment-Modul (lib/experimente.ts, Schlüssel „praesentation“). Einheit: Lead-ID, ohne Lead die Termin-ID.
//   - Laden (Termin, Kundenlink, Vorschau): nur lesen (merken: false), keine Zuteilung durch bloßes Öffnen.
//   - Zuteilen (merken): erst wenn eine Folie nach „Das haben Sie uns gesagt“ gezeigt bzw. zugesagt wird
//     (lib/praesentation-messung.ts ereignisSpeichern). Die Fassung ist fest je Einheit (SHA-256), beides passt zusammen.
//   - Angehalten, Notschalter EXPERIMENTE_AUS, unbekannt oder Fehler: "a" = B. Nach einer Entscheidung der Gewinner.

import { variante } from "@/lib/experimente";
import { PRAESENTATION_EXPERIMENT, varianteAusExperiment, type PraesentationVariante } from "@/lib/praesentation-variante";

export async function praesentationsVariante(einheit: string | null | undefined, o: { merken?: boolean } = {}): Promise<PraesentationVariante> {
  return varianteAusExperiment(await variante(PRAESENTATION_EXPERIMENT, einheit, { merken: o.merken ?? false }));
}
