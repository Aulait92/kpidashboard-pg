// Live-Aktualisierung im Kundenbereich: ein kleiner „Fingerabdruck“ dessen,
// was ein Login sehen kann (Leads, Chats, Termine). Ändert er sich, lädt die
// Seite ihre Server-Daten neu (router.refresh). So erscheinen neue Leads und
// WhatsApp-Nachrichten nach wenigen Sekunden statt erst nach dem Neuladen.
// Der Browser fragt ihn alle paar Sekunden ab (components/use-live-poll.ts).

import { prisma } from "@/lib/prisma";
import { appointmentScope, chatListeScope, conversationScope, leadScope, type TeamCtx } from "@/lib/team";
import { adminChatFingerprintOf, fingerprintOf, type FingerprintParts } from "@/lib/live-state";

export { fingerprintOf, nextLiveState, type FingerprintParts } from "@/lib/live-state";

/** Fünf kleine Aggregat-Abfragen über die indizierten Kunden-Spalten (immer im Sichtbereich des Logins). */
export async function loadFingerprintParts(ctx: TeamCtx): Promise<FingerprintParts> {
  const [leads, convs, attention, appts, msgs] = await Promise.all([
    prisma.lead.aggregate({ where: leadScope(ctx), _count: { _all: true }, _max: { createdAt: true, statusChangedAt: true } }),
    prisma.conversation.aggregate({ where: conversationScope(ctx), _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.conversation.count({ where: { ...chatListeScope(ctx), needsAttention: true, status: "open" } }),
    prisma.appointment.aggregate({ where: appointmentScope(ctx), _count: { _all: true }, _max: { updatedAt: true } }),
    // Neue Nachricht (auch Echo aus der WhatsApp-Business-App), selbst wenn der Chat dabei nicht angefasst wird
    prisma.message.aggregate({ where: { conversation: conversationScope(ctx) }, _max: { createdAt: true } }),
  ]);
  return {
    leads: { count: leads._count._all, lastCreated: leads._max.createdAt, lastStatus: leads._max.statusChangedAt },
    conversations: { count: convs._count._all, lastUpdated: convs._max.updatedAt, attention },
    appointments: { count: appts._count._all, lastUpdated: appts._max.updatedAt },
    messages: { lastCreated: msgs._max.createdAt },
  };
}

/** Admin-Chats (/admin/whatsapp): alle Kunden, auch die Support-Nummer. Nur für Admins aufrufen. */
export async function loadAdminChatFingerprint(): Promise<string> {
  const [convs, attention, msgs] = await Promise.all([
    prisma.conversation.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.conversation.count({ where: { needsAttention: true, status: "open" } }),
    prisma.message.aggregate({ _max: { createdAt: true } }),
  ]);
  return adminChatFingerprintOf({
    conversations: { count: convs._count._all, lastUpdated: convs._max.updatedAt, attention },
    messages: { lastCreated: msgs._max.createdAt },
  });
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

/** Letzte eingehende Nachricht je Chat (ms), für den Hinweis „Neue Nachricht“. Nur bereits sichtbare Chat-IDs übergeben. */
export async function lastInboundAt(conversationIds: string[]): Promise<Map<string, number>> {
  if (conversationIds.length === 0) return new Map();
  const rows = await prisma.message.groupBy({
    by: ["conversationId"],
    where: { conversationId: { in: conversationIds }, direction: "inbound" },
    _max: { createdAt: true },
  });
  return new Map(rows.flatMap((r) => (r._max.createdAt ? [[r.conversationId, r._max.createdAt.getTime()] as const] : [])));
}
