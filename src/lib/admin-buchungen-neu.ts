// „Neue Buchungen seit Ihrem letzten Besuch“ (Admin → Heute), je Admin-Login.
// Gesehen gilt, sobald Admin → Zahlen → Buchungen geöffnet wird (User.buchungenSeenAt).

import { prisma } from "@/lib/prisma";
import { buildBuchungen, loadBuchungSources } from "@/lib/admin-buchungen";
import type { BuchungRow } from "@/lib/admin-buchungen-shared";

const DAY = 86_400_000;

/** Zeilen nach `seenAt` und nicht in der Zukunft; ohne Zeitpunkt: letzte 7 Tage. */
export function neueBuchungenSeit(rows: Pick<BuchungRow, "at">[], seenAt: Date | null, now: Date): number {
  const from = seenAt ?? new Date(now.getTime() - 7 * DAY);
  return rows.filter((r) => r.at > from && r.at <= now).length;
}

export async function countNeueBuchungen(userId: string, now: Date = new Date()): Promise<number> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { buchungenSeenAt: true } });
  const rows = buildBuchungen(await loadBuchungSources(now), now);
  return neueBuchungenSeit(rows, u?.buchungenSeenAt ?? null, now);
}

export async function markBuchungenGesehen(userId: string, now: Date = new Date()): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { buchungenSeenAt: now } }).catch(() => undefined);
}
