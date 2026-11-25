// Leserecht für empfangene Mails bei Resend (Usability-Check 25.11.2026, Sentry „restricted_api_key“, 83 Ereignisse):
// Antworten per E-Mail, Termin-Weiterleitung, Beleg-Adresse und Anhänge lesen Resend „Receiving“. Das geht nur mit einem
// Schlüssel mit „Full access“. Ein Schlüssel mit „Sending access“ (typisch für RESEND_API_KEY) liefert „restricted_api_key“.
// Statt bei jedem Lauf Sentry zu melden: einmal beim Wechsel auf „kein Leserecht“ melden und den Zustand im
// SystemHeartbeat „resend-empfang“ ablegen (Admin › Heute und Systemzustand zeigen ihn). Wieder lesbar: Zustand ok.

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";

export const EMPFANG_HEARTBEAT = "resend-empfang";

/** Welche Variable liefert den Leseschlüssel (RESEND_EMPFANG_API_KEY vor RESEND_API_KEY)? null: keiner gesetzt. */
export function empfangsSchluesselName(env: Record<string, string | undefined> = process.env): "RESEND_EMPFANG_API_KEY" | "RESEND_API_KEY" | null {
  if (env.RESEND_EMPFANG_API_KEY?.trim()) return "RESEND_EMPFANG_API_KEY";
  if (env.RESEND_API_KEY?.trim()) return "RESEND_API_KEY";
  return null;
}

/** Fehler (Error, Resend-Fehlername oder Text) heißt: Schlüssel ohne Leserecht („Sending access“ statt „Full access“). */
export function istFehlendesLeserecht(err: unknown): boolean {
  const text =
    err instanceof Error ? err.message : typeof err === "string" ? err : err && typeof err === "object" ? String((err as { name?: unknown; message?: unknown }).name ?? "") + " " + String((err as { message?: unknown }).message ?? "") : "";
  return /restricted_api_key|restricted to only send/i.test(text);
}

/** Hinweistext für Admin › Heute und Systemzustand (ein Satz, was zu tun ist). */
export function leserechtHinweis(schluessel: string | null): string {
  return schluessel === "RESEND_EMPFANG_API_KEY"
    ? "RESEND_EMPFANG_API_KEY hat kein Leserecht: in Resend einen Schlüssel mit „Full access“ anlegen und in Railway eintragen."
    : "RESEND_EMPFANG_API_KEY fehlt, RESEND_API_KEY darf nur senden: in Resend einen Schlüssel mit „Full access“ anlegen und in Railway als RESEND_EMPFANG_API_KEY eintragen.";
}

/**
 * Kein Leserecht: Zustand ablegen; Sentry nur beim Wechsel von ok (bzw. unbekannt) auf Fehler, nicht bei jedem Lauf.
 * Gibt zurück, ob gemeldet wurde.
 */
export async function meldeLeserechtFehlt(where: string, now = new Date()): Promise<boolean> {
  const schluessel = empfangsSchluesselName();
  const note = leserechtHinweis(schluessel);
  const vorher = await prisma.systemHeartbeat.findUnique({ where: { key: EMPFANG_HEARTBEAT } }).catch(() => null);
  await prisma.systemHeartbeat
    .upsert({ where: { key: EMPFANG_HEARTBEAT }, create: { key: EMPFANG_HEARTBEAT, at: now, ok: false, note }, update: { at: now, ok: false, note } })
    .catch(() => null);
  if (vorher && !vorher.ok) {
    console.warn(`[resend-empfang] ${where}: weiterhin kein Leserecht (${schluessel ?? "kein Schlüssel"})`);
    return false;
  }
  reportError(new Error(`resend_empfang_ohne_leserecht (Schlüssel: ${schluessel ?? "keiner"})`), where, { schluessel: schluessel ?? "keiner" });
  return true;
}

/** Lesen hat geklappt: Zustand ok (nur schreiben, wenn er vorher nicht ok war oder fehlt). */
export async function meldeLeserechtOk(now = new Date()): Promise<void> {
  const vorher = await prisma.systemHeartbeat.findUnique({ where: { key: EMPFANG_HEARTBEAT } }).catch(() => null);
  if (vorher?.ok) return;
  await prisma.systemHeartbeat
    .upsert({ where: { key: EMPFANG_HEARTBEAT }, create: { key: EMPFANG_HEARTBEAT, at: now, ok: true, note: null }, update: { at: now, ok: true, note: null } })
    .catch(() => null);
}
