// Nutzungsanalyse im Vermittlerbereich (Ole, 17.11.2026: „sehen, wie sie die Software nutzen und wo sie Fehler machen“).
// Sentry Session Replay, alle Texte und Eingaben maskiert, Medien blockiert, Endkundenseiten nie
// (src/instrumentation-client.ts, lib/sentry-redact.ts). Nur mit Einwilligung je Nutzer (§ 25 TDDDG,
// Art. 6 Abs. 1 lit. a DSGVO); Rechtsprüfung docs/rechtstexte/sitzungsaufnahme-2026-11-17.md.
// Aufnahme bei einem Teil der Sitzungen (ANTEIL), Auswertung einmal pro Woche (Rage- und Dead-Clicks).

/** Version des Einwilligungstexts (am Nutzer gespeichert, Nachweis). Bei Textänderung hochzählen. */
export const ANALYSE_VERSION = "2026-11-17";
/** Anteil der Sitzungen mit Aufnahme (Kosten bei Sentry). */
export const ANALYSE_ANTEIL = 0.3;

export const ANALYSE_TEXT = {
  titel: "Helfen Sie mit, die App noch einfacher zu machen?",
  text: "Wir sehen dann, wo Sie klicken und wo es hakt, nie Ihre Kunden, Texte oder Eingaben (alles unkenntlich). So verbessern wir genau das, was Sie im Alltag aufhält. Jederzeit in den Einstellungen widerrufbar.",
  ja: "Ja, ich helfe mit",
  nein: "Nein, danke",
  mehr: "Mehr erfahren",
  link: "/datenschutz#nutzungsanalyse",
} as const;

export type AnalyseStatus = "ja" | "nein" | null;
export const asAnalyseStatus = (v: unknown): AnalyseStatus => (v === "ja" || v === "nein" ? v : null);
