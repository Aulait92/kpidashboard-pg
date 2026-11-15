// Ruhendes Konto nach Vertragsende (Ole, 15.11.2026): reine Regeln und Texte, auch im Browser nutzbar.
// Server-Teil (Übergang, Erinnerungen, Löschung, Reaktivierung): lib/ruhend.ts.
//
// Ablauf: Vertrag endet (Customer.cancelEffectiveAt, letzter Vertragstag) → ab dem Folgetag ruht das Konto für die
// gewählte Aufbewahrung (Standard 24 Monate, sonst 3 Monate oder sofort) → danach endgültige Löschung. Erinnerung
// 30 und 7 Tage vorher. Die Wahl ist bis zur Löschung jederzeit änderbar (auch zurück auf 24 Monate).

import { berlinEndOfDay, fmtIso, nextDayIso, periodEndIso } from "@/lib/vertrag-laufzeit";

export type RetentionChoice = "24m" | "3m" | "sofort";

export const RETENTION_DEFAULT: RetentionChoice = "24m";

export const RETENTION_CHOICES: { key: RetentionChoice; months: number; label: string; hint: string }[] = [
  { key: "24m", months: 24, label: "24 Monate aufbewahren (empfohlen)", hint: "Sie können jederzeit zurückkommen und finden alles so vor, wie Sie es verlassen haben." },
  { key: "3m", months: 3, label: "3 Monate aufbewahren", hint: "Danach löschen wir Ihre Daten endgültig." },
  { key: "sofort", months: 0, label: "Sofort nach Vertragsende löschen", hint: "Bitte laden Sie Ihre Daten vorher unter „Ihre Daten herunterladen“ herunter. Nach der Löschung ist keine Wiederherstellung möglich." },
];

/** Der Hinweis bei der Kündigung (Ole, 15.11.2026). */
export const RETENTION_NOTICE =
  "Ihre Daten bewahren wir 24 Monate auf, damit Sie jederzeit zurückkommen können. Danach löschen wir sie endgültig. Sie können auch eine frühere Löschung wählen.";

export const isRetentionChoice = (v: unknown): v is RetentionChoice => v === "24m" || v === "3m" || v === "sofort";

export function normalizeRetention(v: unknown): RetentionChoice {
  return isRetentionChoice(v) ? v : RETENTION_DEFAULT;
}

export const retentionMonths = (c: RetentionChoice) => RETENTION_CHOICES.find((x) => x.key === c)?.months ?? 24;

/**
 * Letzter Tag der Aufbewahrung (YYYY-MM-DD). Die Ruhephase beginnt am Tag nach dem letzten Vertragstag und dauert die
 * gewählten Monate (Fristberechnung wie lib/vertrag-laufzeit.periodEndIso). „sofort“: der letzte Vertragstag selbst.
 */
export function retentionLastDayIso(contractEndIso: string, choice: RetentionChoice): string {
  const months = retentionMonths(choice);
  if (months <= 0) return contractEndIso;
  return periodEndIso(nextDayIso(contractEndIso), months);
}

/** Ab diesem Zeitpunkt ist die endgültige Löschung fällig (Ende des letzten Aufbewahrungstags in Berlin). */
export function deleteAfterFor(contractEndIso: string, choice: RetentionChoice): Date {
  return berlinEndOfDay(retentionLastDayIso(contractEndIso, choice));
}

/** „bis einschließlich 30.09.2029“ bzw. für „sofort“ der Vertragsende-Text. */
export function retentionText(contractEndIso: string, choice: RetentionChoice): string {
  if (choice === "sofort") return `Wir löschen Ihre Daten direkt nach Vertragsende am ${fmtIso(contractEndIso)}.`;
  return `Wir bewahren Ihre Daten bis einschließlich ${fmtIso(retentionLastDayIso(contractEndIso, choice))} auf und löschen sie danach endgültig.`;
}

const DAY = 86_400_000;

/**
 * Welche Erinnerung ist fällig? 30 Tage vorher („30“) bzw. 7 Tage vorher („7“), je einmal. Liegt die Löschung schon
 * näher als 7 Tage und die 30-Tage-Erinnerung fehlt, geht nur noch die 7-Tage-Erinnerung raus. Rein, getestet.
 */
export function retentionReminderDue(
  c: { deleteAfter: Date | null; dataDeletedAt?: Date | null; reminder30At: Date | null; reminder7At: Date | null },
  now: Date,
): "30" | "7" | null {
  if (!c.deleteAfter || c.dataDeletedAt) return null;
  const left = c.deleteAfter.getTime() - now.getTime();
  if (left <= 0) return null;
  if (left <= 7 * DAY) return c.reminder7At ? null : "7";
  if (left <= 30 * DAY) return c.reminder30At || c.reminder7At ? null : "30";
  return null;
}

/** Status für Kundenbereich und Kundenakte. */
export type LifecycleState = "aktiv" | "gekuendigt" | "ruhend" | "geloescht";

export function lifecycleState(c: { cancelEffectiveAt: Date | null; dormantSince: Date | null; dataDeletedAt: Date | null }): LifecycleState {
  if (c.dataDeletedAt) return "geloescht";
  if (c.dormantSince) return "ruhend";
  if (c.cancelEffectiveAt) return "gekuendigt";
  return "aktiv";
}

/** Ist der Vertrag zu `now` beendet (Ende des letzten Vertragstags in Berlin vorbei)? */
export function contractEnded(contractEndIso: string, now: Date): boolean {
  return berlinEndOfDay(contractEndIso).getTime() <= now.getTime();
}

export const LIFECYCLE_KINDS = ["cancelled", "dormant", "reactivated", "deleted"] as const;
export type LifecycleKind = (typeof LIFECYCLE_KINDS)[number];

export const LIFECYCLE_LABEL: Record<LifecycleKind, string> = {
  cancelled: "Gekündigt",
  dormant: "Ruht seit Vertragsende",
  reactivated: "Reaktiviert",
  deleted: "Daten endgültig gelöscht",
};
