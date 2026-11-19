// Beratungspräsentation: Fassungen für Splittests (Ole, 19.11.2026: „konstant Splittests fahren und Conversion-Rates
// hochtesten“). Seit 19.11.2026 ist Fassung B Standard (Abschluss-Dramaturgie: ohne Folie „Worauf es ankommt“, Preis pro
// Tag groß, Entscheidung mit Zusammenfassung und „Ja, so machen wir es“, Zusage im Kundenlink); die alte Fassung A ist
// abgeschaltet. Herausforderer (19.11.2026): Fassung C (lib/praesentation.ts, Kopf von folienRoh): Einstieg mit dem
// Anliegen des Kunden, Beitrag auf der Entscheidungsfolie, Wahl zwischen zwei Paketen, bisheriger Vertrag in Euro.
//
// Zuteilung (nur auf dem Server, lib/praesentation-variante-server.ts): Experiment PRAESENTATION_EXPERIMENT in
// lib/experimente.ts, a = B (Standard), b = C, Ziel „zusage“. Von Ole am 19.11.2026 freigegeben, läuft ab dem Deploy.
// Angehalten, Notschalter EXPERIMENTE_AUS oder Fehler: alle B. Nach der Entscheidung (ab 100 je Fassung, p < 0,05)
// sehen alle den Gewinner. Vorschau: /demo/beratung?fassung=c (Demo ohne Parameter bleibt B).
// Anhalten (wirkt nach höchstens 5 Minuten, Zwischenspeicher in lib/experimente.ts):
//   INSERT INTO "Experiment" ("key", "ziel", "aktiv", "updatedAt") VALUES ('praesentation', 'zusage', false, now())
//   ON CONFLICT ("key") DO UPDATE SET "aktiv" = false, "updatedAt" = now();   (alle wieder B, Zuteilungen bleiben)
// Stand: Diagnose q=experimente (Zusagequote je Fassung) und q=praesentation-quote (Abschlussquote je Variante).
// Diese Datei läuft auch im Browser (Kundenlink), daher hier nur Typen und reine Helfer.

export type PraesentationVariante = "A" | "B" | "C";

export const PRAESENTATION_VARIANTEN: readonly PraesentationVariante[] = ["A", "B", "C"];

/** Schlüssel des Splittests B gegen C in EXPERIMENTE (lib/experimente.ts). */
export const PRAESENTATION_EXPERIMENT = "praesentation";

export const istVariante = (v: unknown): v is PraesentationVariante => v === "A" || v === "B" || v === "C";

/** Fassung aus der Fassung des Experiments: a = B (Standard), b = C (Herausforderer). */
export const varianteAusExperiment = (v: "a" | "b"): PraesentationVariante => (v === "b" ? "C" : "B");

/** Kundenlink: Abschluss-Leiste („Ja, so machen wir es“) in B und C, nur mit gewählten Tarifen. */
export const mitAbschlussLeiste = (variante: PraesentationVariante, produkte: string[]) => (variante === "B" || variante === "C") && produkte.length > 0;
