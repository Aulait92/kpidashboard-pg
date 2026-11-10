import { prisma } from "@/lib/prisma";

// Lebenszeichen der Hintergrund-Jobs. /api/status prüft, ob sie frisch sind.
export type HeartbeatKey = "cron" | "sync";

/** Maximal erlaubtes Alter, bevor /api/status Alarm schlägt. */
export const HEARTBEAT_MAX_AGE_MIN: Record<HeartbeatKey, number> = { cron: 20, sync: 240 };

export async function beat(key: HeartbeatKey, ok: boolean, note?: string | null): Promise<void> {
  const data = { at: new Date(), ok, note: note ? note.slice(0, 500) : null };
  await prisma.systemHeartbeat.upsert({ where: { key }, create: { key, ...data }, update: data }).catch(() => {});
}
