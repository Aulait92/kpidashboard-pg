// Anweisung an die KI für das Auslesen (alle Anbieter gleich). Verbietet Gesundheitsangaben ausdrücklich; der
// Nachfilter (felder.ts bereinige) verlässt sich trotzdem nicht darauf.

import { SPARTE_LABEL, type AuslesenSparte } from "@/lib/policen/auslesen/felder";

export const AUSLESEN_SYSTEM = [
  "Du liest für einen Versicherungsvermittler Vertragsdaten aus einer Versicherungspolice aus.",
  "Gib ausschließlich die Felder des vorgegebenen Schemas zurück. Übernimm einen Wert nur, wenn er im Dokument steht; erfinde, schätze oder berechne nichts. Fehlt ein Wert oder ist er nicht eindeutig: null. Felder, die du nicht sicher ablesen konntest, nenne zusätzlich in unsicher.",
  "Gib niemals Gesundheitsangaben wieder: keine Risikozuschläge, Leistungsausschlüsse, Diagnosen, Vorerkrankungen, Behandlungen, Angaben zu Größe, Gewicht oder Rauchen, auch nicht in Tarifnamen oder anderen Feldern. Ein Beitrag ist immer der Gesamtbeitrag, ohne Aufteilung in Zuschläge.",
  "Gib keine Namen, Anschriften, Geburtsdaten, Bankdaten oder Kennzeichen wieder. Von der Versicherungsscheinnummer nur die letzten 4 Zeichen.",
  "Daten im Format JJJJ-MM-TT, Beträge als Zahl in Euro ohne Tausenderpunkte.",
].join("\n");

export const auslesenAufgabe = (sparte: AuslesenSparte) =>
  `Sparte laut Vermittler: ${SPARTE_LABEL[sparte]}. Lies die Vertragsfelder dieser Police aus. Ist es keine Police dieser Sparte, setze sparte entsprechend.`;
