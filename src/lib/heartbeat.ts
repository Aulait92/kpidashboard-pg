import { prisma } from "@/lib/prisma";

// Lebenszeichen der Hintergrund-Jobs. /api/status prüft, ob sie frisch sind.
import type { HeartbeatKey } from "@/lib/heartbeat-limits";
export { HEARTBEAT_MAX_AGE_MIN, type HeartbeatKey } from "@/lib/heartbeat-limits";

export async function beat(key: HeartbeatKey, ok: boolean, note?: string | null): Promise<void> {
  const data = { at: new Date(), ok, note: note ? note.slice(0, 500) : null };
  await prisma.systemHeartbeat.upsert({ where: { key }, create: { key, ...data }, update: data }).catch(() => {});
}
