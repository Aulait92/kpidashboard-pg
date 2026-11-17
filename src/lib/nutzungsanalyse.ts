// Nutzungsanalyse im Vermittlerbereich (Ole, 17.11.2026: „sehen, wie sie die Software nutzen und wo sie Fehler machen“).
// Sentry Session Replay, alle Texte und Eingaben maskiert, Medien blockiert, Endkundenseiten nie
// (src/instrumentation-client.ts, lib/sentry-redact.ts). Nur mit Einwilligung je Nutzer (§ 25 TDDDG,
// Art. 6 Abs. 1 lit. a DSGVO); Rechtsprüfung docs/rechtstexte/sitzungsaufnahme-2026-11-17.md.
// Aufnahme bei einem Teil der Sitzungen (ANTEIL), Auswertung einmal pro Woche (Rage- und Dead-Clicks).

/** Version des Einwilligungstexts (am Nutzer gespeichert, Nachweis). Bei Textänderung hochzählen. */
export const ANALYSE_VERSION = "2026-11-17";
/** Anteil der Sitzungen mit Aufnahme (Kosten bei Sentry). */
export const ANALYSE_ANTEIL = 0.3;

// Texte nach Rechtsprüfung (docs/rechtstexte/sitzungsaufnahme-2026-11-17.md, Abschnitt 2): informiert, freiwillig,
// beide Knöpfe gleich gestaltet, Link vor den Knöpfen, keine Gedankenstriche.
export const ANALYSE_TEXT = {
  titel: "Helfen Sie mit, die App einfacher zu machen?",
  text: "Mit Ihrem Ja zeichnen wir bei einem Teil Ihrer Sitzungen über unseren Dienstleister Sentry (Datenregion EU) auf, wie Sie durch die App klicken, damit wir umständliche Stellen finden und verbessern. Alle Texte, Eingaben und Kundendaten sind dabei unkenntlich, die Teilnahme ist freiwillig und lässt sich jederzeit unter Einstellungen beenden.",
  ja: "Ja, gern",
  nein: "Nein, danke",
  mehr: "Mehr erfahren",
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
