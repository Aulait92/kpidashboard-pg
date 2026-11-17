// Nutzungsanalyse im Vermittlerbereich (Ole, 17.11.2026: „sehen, wie sie die Software nutzen und wo sie Fehler machen“).
// Sentry Session Replay, alle Texte und Eingaben maskiert, Medien blockiert, Endkundenseiten nie
// (src/instrumentation-client.ts, lib/sentry-redact.ts). Nur mit Einwilligung je Nutzer (§ 25 TDDDG,
// Art. 6 Abs. 1 lit. a DSGVO); Rechtsprüfung docs/rechtstexte/sitzungsaufnahme-2026-11-17.md.
// Aufnahme bei einem Teil der Sitzungen (ANTEIL), Auswertung einmal pro Woche (Rage- und Dead-Clicks).

/** Version des Einwilligungstexts (am Nutzer gespeichert, Nachweis). Bei Textänderung hochzählen. */
export const ANALYSE_VERSION = "2026-11-17-f2";
/** Anteil der Sitzungen mit Aufnahme (Kosten bei Sentry). */
export const ANALYSE_ANTEIL = 0.3;

// Texte nach Rechtsprüfung (docs/rechtstexte/sitzungsaufnahme-2026-11-17.md, Abschnitt 2): informiert, freiwillig,
// beide Knöpfe gleich gestaltet, Link vor den Knöpfen, keine Gedankenstriche.
// Fassung 2 (konversionsoptimiert, Rechtsprüfung Abschnitt 7): Nutzen zuerst, „aufzeichnen“, Sentry EU, Teil der
// Sitzungen, unkenntlich, Abschalten unter Einstellungen; gleichrangige Knöpfe, Ja zuerst; Frage nach einem Erfolgsmoment.
export const ANALYSE_TEXT = {
  titel: "Helfen Sie uns, Ihnen Klicks zu sparen?",
  text: "Mit Ihrem Ja zeichnen wir bei einem Teil Ihrer Sitzungen über Sentry (Datenregion EU) auf, wo Klicks hängen bleiben, und bauen genau diese Stellen um. Ihre Kunden, Texte und Eingaben sind dabei unkenntlich, und Sie können die Aufnahme jederzeit unter Einstellungen abschalten.",
  unterzeile: "Danke für Ihre Hilfe, Ole Kannapinn, Gründer",
  ja: "Ja, ich helfe mit",
  nein: "Nein, danke",
  mehr: "Was genau aufgenommen wird",
  link: "/rechtliches/sitzungsaufnahmen",
  danke: "Danke! Sie können das jederzeit unter Einstellungen wieder ausschalten.",
  schalter: "Sitzungsaufnahme zur Verbesserung der App",
  schalterHinweis: "Wir sehen, wie Sie klicken, nicht was Sie lesen oder eingeben.",
} as const;

/** Erst fragen, wenn der Nutzer angekommen ist: nicht in den ersten 2 Tagen und nicht während der Einrichtung. */
export function darfAnalyseFragen(o: { createdAt: Date; einrichtungOffen: number; now?: Date }): boolean {
  const now = o.now ?? new Date();
  return now.getTime() - o.createdAt.getTime() >= 2 * 24 * 60 * 60 * 1000 && o.einrichtungOffen === 0;
}

export type AnalyseStatus = "ja" | "nein" | null;
export const asAnalyseStatus = (v: unknown): AnalyseStatus => (v === "ja" || v === "nein" ? v : null);
