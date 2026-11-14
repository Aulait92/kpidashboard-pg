// Verloren mit Grund und Schutz vor vorzeitigem Aufgeben (Ole, 14.11.2026):
// „Es gibt Vertreter, die einmal anrufen und dann sagen, der Lead sei schlecht.“
//
// - Gründe ersetzen das unklare „Disqualifiziert“ allein. Jeder Grund setzt einen der bestehenden Status
//   (Kein Interesse bzw. Disqualifiziert), damit Pipeline, Airtable und Zahlen unverändert funktionieren.
//   Nie erreichte Leads (falsche Daten, nicht erreichbar) bekommen „Disqualifiziert“: der Airtable-Abgleich
//   leitet „erreicht“ aus dem Status ab, „Kein Interesse“ würde die Erreichbarkeit verfälschen.
// - Nie erreicht und weniger als 6 dokumentierte Anrufversuche: Warnung („Erst X von 6 Anrufversuchen“).
//   Ohne Warnung: falsche Nummer bzw. Daten, hat nichts angefragt, kein Interesse im Gespräch
//   (dann war der Lead erreicht bzw. die Daten sind falsch).
// - „Nach 6 Versuchen nicht erreichbar“ erst nach 6 dokumentierten Versuchen ohne Erreichen.
// Rein (auch im Browser nutzbar). Server-Aktion: app/buyer/next-step-actions.ts.

export const CALL_ATTEMPTS_TARGET = 6;

export type LostReasonKey = "kein_interesse" | "schon_versichert" | "passt_nicht" | "falsche_daten" | "nicht_angefragt" | "nicht_erreichbar" | "sonstiges";

export type LostReason = {
  key: LostReasonKey;
  label: string;
  hint: string;
  /** Gespeicherter Status (bestehende Werte, damit Pipeline und Airtable gleich bleiben). */
  status: "Kein Interesse" | "Disqualifiziert";
  /** Lead gilt danach als erreicht (true), nicht erreicht (false) oder bleibt, wie er ist (null). */
  reached: boolean | null;
  /** Ohne Warnung, auch wenn der Lead nie erreicht wurde. */
  noWarning?: boolean;
  /** Pflicht-Freitext. */
  needsNote?: boolean;
};

export const LOST_REASONS: readonly LostReason[] = [
  { key: "kein_interesse", label: "Kein Interesse", hint: "Im Gespräch abgelehnt", status: "Kein Interesse", reached: true, noWarning: true },
  { key: "schon_versichert", label: "Schon versichert", hint: "Anderweitig abgeschlossen", status: "Kein Interesse", reached: true },
  { key: "passt_nicht", label: "Zu teuer oder passt nicht", hint: "Angebot passt nicht zum Bedarf", status: "Kein Interesse", reached: true },
  { key: "falsche_daten", label: "Falsche oder ungültige Daten", hint: "Nummer existiert nicht, Fake-Angaben", status: "Disqualifiziert", reached: false, noWarning: true },
  { key: "nicht_angefragt", label: "Hat nichts angefragt", hint: "Lead sagt, er hat keine Anfrage gestellt", status: "Disqualifiziert", reached: true, noWarning: true },
  { key: "nicht_erreichbar", label: `Nach ${CALL_ATTEMPTS_TARGET} Versuchen nicht erreichbar`, hint: "Alle Anrufversuche ohne Erfolg", status: "Disqualifiziert", reached: false },
  { key: "sonstiges", label: "Sonstiges", hint: "Bitte kurz begründen", status: "Kein Interesse", reached: null, needsNote: true },
];

export const isLostReason = (v: unknown): v is LostReasonKey => LOST_REASONS.some((r) => r.key === v);
export const lostReason = (key: string | null | undefined): LostReason | null => LOST_REASONS.find((r) => r.key === key) ?? null;
export const lostReasonLabel = (key: string | null | undefined): string | null => lostReason(key)?.label ?? null;

/** Status, die als „verloren“ zählen (inklusive Alt-Werte aus Airtable). */
export const LOST_STATUSES = ["Kein Interesse", "Disqualifiziert", "Disqualified", "Nicht qualifiziert"] as const;
export const isLostStatus = (s: string | null | undefined) => !!s && (LOST_STATUSES as readonly string[]).includes(s.trim());

/**
 * Alte Gründe bei „Disqualifiziert“ (lib/lead-quality) auf die neuen abbilden. Gleiche Abbildung wie in der
 * Migration 20261118640000_naechster_schritt. „Kein Interesse“ ohne Grund → „kein_interesse“.
 */
export const LEGACY_REASON_MAP: Record<string, LostReasonKey> = {
  falsche_nummer: "falsche_daten",
  fake: "falsche_daten",
  kein_bedarf: "passt_nicht",
  doppelt: "sonstiges",
  region: "sonstiges",
  sonstiges: "sonstiges",
};

/** Verloren-Grund eines Leads (gespeichert, sonst aus Status und altem Grund abgeleitet), null wenn offen. */
export function lostReasonOf(l: { status: string | null; lostReason?: string | null; disqualifyReason?: string | null }): LostReasonKey | null {
  if (!isLostStatus(l.status)) return null;
  if (isLostReason(l.lostReason)) return l.lostReason;
  if (l.disqualifyReason && LEGACY_REASON_MAP[l.disqualifyReason]) return LEGACY_REASON_MAP[l.disqualifyReason];
  if (isLostReason(l.disqualifyReason)) return l.disqualifyReason;
  return (l.status ?? "").trim() === "Kein Interesse" ? "kein_interesse" : null;
}

export type LostGuardInput = { reached: boolean; callAttempts: number };

/** Lead wurde nie erreicht und hat weniger als 6 dokumentierte Anrufversuche. */
export function tooFewAttempts(l: LostGuardInput): boolean {
  return !l.reached && l.callAttempts < CALL_ATTEMPTS_TARGET;
}

/** Warnung vor „Verloren“ zeigen? */
export function needsLostWarning(l: LostGuardInput, reason: LostReasonKey): boolean {
  const r = lostReason(reason);
  if (!r || r.noWarning) return false;
  if (reason === "nicht_erreichbar") return false; // nur wählbar, wenn genug Versuche
  return tooFewAttempts(l);
}

/** „Nach 6 Versuchen nicht erreichbar“ wählbar? */
export function canChooseUnreachable(l: LostGuardInput): boolean {
  return !l.reached && l.callAttempts >= CALL_ATTEMPTS_TARGET;
}

/** Text der Warnung (Vermittler-Oberfläche, Sie-Form). */
export function lostWarningText(attempts: number): string {
  return `Erst ${Math.min(attempts, CALL_ATTEMPTS_TARGET)} von ${CALL_ATTEMPTS_TARGET} Anrufversuchen. Viele Leads erreicht man erst beim 4. bis 6. Versuch.`;
}
