// Warme Kontakte aus dem Bestand für „Heute“ (Bestand Paket 4, 20.11.2026): Bestandskunden, die auf eine Kampagne
// geantwortet haben, aber seit 2 Tagen keinen Termin haben. Höchstens 10, beschriftet „Nachfassen per Nachricht“.
// Anrufen nur bei dokumentiertem Rückrufwunsch (§ 7 Abs. 2 Nr. 1 UWG): Solche Kontakte stehen schon unter „Anrufen“
// (Rückruf oder Wiedervorlage) und erscheinen hier nicht doppelt. Nur sichtbar, wenn das Modul für den Kunden sichtbar
// ist (lib/bestand/sichtbar-server.ts).

import { prisma } from "@/lib/prisma";
import { leadScope, type TeamCtx } from "@/lib/team";
import { istWarm, WARM_AFTER_DAYS, WARM_MAX, WARM_MAX_DAYS, type InboxBestandWarm } from "@/lib/bestand/warm-shared";

export * from "@/lib/bestand/warm-shared";

const DAY = 86_400_000;

/** Warme Kontakte laden; `exclude` = Leads, die schon unter „Anrufen“ stehen. Älteste Antwort zuerst. */
export async function loadBestandWarm(ctx: TeamCtx, now: Date, exclude: Set<string>): Promise<InboxBestandWarm[]> {
  const rows = await prisma.campaignRecipient.findMany({
    where: {
      campaign: { customerId: ctx.customerId },
      status: "replied",
      reason: null,
      leadId: { not: null },
      repliedAt: { lte: new Date(now.getTime() - WARM_AFTER_DAYS * DAY), gte: new Date(now.getTime() - WARM_MAX_DAYS * DAY) },
      existingCustomer: { optOutAt: null, blockedAt: null },
    },
    orderBy: { repliedAt: "asc" },
    take: 60,
    select: { id: true, status: true, reason: true, repliedAt: true, leadId: true, conversationId: true, campaign: { select: { name: true } } },
  });
  if (!rows.length) return [];
  const leads = await prisma.lead.findMany({
    where: { ...leadScope(ctx), id: { in: rows.map((r) => r.leadId!) }, erasedAt: null },
    select: { id: true, name: true, status: true, appointments: { where: { status: { in: ["booked", "completed"] } }, select: { id: true }, take: 1 }, conversations: { select: { id: true }, take: 1 } },
  });
  const byId = new Map(leads.map((l) => [l.id, l]));
  const out: InboxBestandWarm[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const l = byId.get(r.leadId!);
    if (!l || exclude.has(l.id) || seen.has(l.id)) continue;
    if (!istWarm({ ...r, optOut: false, leadStatus: l.status, hasAppointment: l.appointments.length > 0 }, now)) continue;
    seen.add(l.id);
    out.push({
      recipientId: r.id,
      leadId: l.id,
      name: l.name ?? "Bestandskunde",
      kampagne: r.campaign.name.replace(/\bKFZ\b/g, "Kfz"),
      repliedAt: r.repliedAt!.toISOString(),
      conversationId: r.conversationId ?? l.conversations[0]?.id ?? null,
    });
    if (out.length >= WARM_MAX) break;
  }
  return out;
}
