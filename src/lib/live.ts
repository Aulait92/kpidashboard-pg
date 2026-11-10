// Live-Aktualisierung im Kundenbereich: ein kleiner „Fingerabdruck“ dessen,
// was ein Login sehen kann (Leads, Chats, Termine). Ändert er sich, lädt die
// Seite ihre Server-Daten neu (router.refresh). So erscheinen neue Leads und
// WhatsApp-Nachrichten in 2–3 Sekunden statt erst nach 15–60 Sekunden.

import { prisma } from "@/lib/prisma";
import { appointmentScope, conversationScope, leadScope, type TeamCtx } from "@/lib/team";
import { fingerprintOf, type FingerprintParts } from "@/lib/live-state";

export { fingerprintOf, nextLiveState, type FingerprintParts } from "@/lib/live-state";

/** Vier kleine Aggregat-Abfragen über die indizierten Kunden-Spalten. */
export async function loadFingerprintParts(ctx: TeamCtx): Promise<FingerprintParts> {
  const [leads, convs, attention, appts] = await Promise.all([
    prisma.lead.aggregate({ where: leadScope(ctx), _count: { _all: true }, _max: { createdAt: true, statusChangedAt: true } }),
    prisma.conversation.aggregate({ where: conversationScope(ctx), _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.conversation.count({ where: { ...conversationScope(ctx), needsAttention: true, status: "open" } }),
    prisma.appointment.aggregate({ where: appointmentScope(ctx), _count: { _all: true }, _max: { updatedAt: true } }),
  ]);
  return {
    leads: { count: leads._count._all, lastCreated: leads._max.createdAt, lastStatus: leads._max.statusChangedAt },
    conversations: { count: convs._count._all, lastUpdated: convs._max.updatedAt, attention },
    appointments: { count: appts._count._all, lastUpdated: appts._max.updatedAt },
  };
}

// Mehrere Tabs desselben Logins teilen sich das Ergebnis kurz (spart Abfragen).
const SHARE_MS = 1500;
const shared = new Map<string, { at: number; value: Promise<string> }>();

export function loadFingerprint(ctx: TeamCtx): Promise<string> {
  const key = `${ctx.customerId}:${ctx.teamRole === "advisor" ? ctx.userId : "*"}`;
  const now = Date.now();
  const hit = shared.get(key);
  if (hit && now - hit.at < SHARE_MS) return hit.value;
  const value = loadFingerprintParts(ctx).then(fingerprintOf);
  shared.set(key, { at: now, value });
  value.catch(() => shared.delete(key));
  if (shared.size > 500) {
    for (const [k, v] of shared) if (now - v.at > SHARE_MS) shared.delete(k);
  }
  return value;
}
