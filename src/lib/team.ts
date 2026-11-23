// Team-Funktionen (Großkunden): mehrere Logins je Kunde.
//   owner   = Inhaber: sieht alle Leads, Chats, Termine; verwaltet das Team
//   advisor = Berater: sieht nur die ihm zugewiesenen Leads (+ deren Chats/Termine)
// Neue Leads werden gleichmäßig verteilt (wer am längsten keinen bekommen hat).
// Ohne Team (nur ein Login) ändert sich nichts.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendToBuyersOfCustomer, sendToUser, type PushPayload } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { absentUserIds } from "@/lib/absence";

export type TeamCtx = { customerId: string; userId: string | null; teamRole: "owner" | "advisor" };

export const isAdvisor = (ctx: TeamCtx) => ctx.teamRole === "advisor" && !!ctx.userId;

/** Sichtbare Leads im Kundenbereich. */
export function leadScope(ctx: TeamCtx): Prisma.LeadWhereInput {
  return { customerId: ctx.customerId, ...(isAdvisor(ctx) ? { assignedUserId: ctx.userId } : {}) };
}

/** Sichtbare WhatsApp-Gespräche. */
export function conversationScope(ctx: TeamCtx): Prisma.ConversationWhereInput {
  return {
    customerId: ctx.customerId,
    // AND statt OR auf oberster Ebene, damit Aufrufer eigene OR-Filter anhängen können.
    ...(isAdvisor(ctx) ? { AND: [{ OR: [{ lead: { assignedUserId: ctx.userId } }, { assignedUserId: ctx.userId }] }] } : {}),
  };
}

/**
 * Gespräche für Chatliste und Zähler (Ole, 21.11.2026): ohne Leads, die per WhatsApp nicht erreichbar sind
 * (Lead.waUnavailableAt, z. B. Festnetz oder „kein WhatsApp“) und nie selbst geschrieben haben. Die stehen auf der
 * Anrufliste bzw. in der Mail-Strecke; ein Chat ohne zugestellte Nachricht wäre nur Ballast.
 */
export function chatListeScope(ctx: TeamCtx): Prisma.ConversationWhereInput {
  const basis = conversationScope(ctx);
  const and = Array.isArray(basis.AND) ? basis.AND : basis.AND ? [basis.AND] : [];
  return {
    ...basis,
    // Nur Leads (Ole, 23.11.2026): fremde Nummern, die auf die WhatsApp-Nummer schreiben (Dokumente, private Kontakte),
    // erscheinen nicht. Sichtbar sind Chats mit Lead, mit Assistent (Schalter „Assistent auch für neue Kontakte“) oder
    // mit Buchung über die Buchungsseite (lib/whatsapp/nur-leads.ts istPipelineChat).
    AND: [
      ...and,
      { OR: [{ leadId: { not: null } }, { botActive: true }, { messages: { some: { direction: "internal", kind: "appointment_booked", sentBy: "lead" } } }] },
    ],
    NOT: { lead: { waUnavailableAt: { not: null } }, messages: { none: { direction: "inbound" } } },
  };
}

/**
 * Logins mit mindestens einem Gerät, das Mitteilungen empfängt: Web-Push (PushSubscription) oder App-Store-App
 * (DeviceToken, lib/native-push.ts). Bis 21.11.2026 zählte nur Web-Push, Nutzer der App-Store-App galten als „ohne App“.
 */
export async function nutzerMitPush(userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const [web, nativ] = await Promise.all([
    prisma.pushSubscription.findMany({ where: { userId: { in: userIds } }, select: { userId: true } }),
    prisma.deviceToken.findMany({ where: { userId: { in: userIds } }, select: { userId: true } }),
  ]);
  return new Set([...web, ...nativ].map((r) => r.userId).filter((x): x is string => !!x));
}

/** Sichtbare Termine. */
export function appointmentScope(ctx: TeamCtx): Prisma.AppointmentWhereInput {
  return {
    customerId: ctx.customerId,
    ...(isAdvisor(ctx) ? { AND: [{ OR: [{ lead: { assignedUserId: ctx.userId } }, { calendarKey: `user:${ctx.userId}` }] }] } : {}),
  };
}

/** Darf dieser Login den Lead sehen/bearbeiten? */
export async function canAccessLead(ctx: TeamCtx, leadId: string): Promise<boolean> {
  const n = await prisma.lead.count({ where: { id: leadId, ...leadScope(ctx) } });
  return n > 0;
}

export async function teamMembers(customerId: string) {
  return prisma.user.findMany({
    where: { customerId, role: "BUYER" },
    select: { id: true, email: true, displayName: true, teamRole: true, receivesLeads: true, leadReceivedAt: true, lastLoginAt: true, totpEnabledAt: true, createdAt: true, advisorCalendar: { select: { status: true, accountEmail: true } } },
    orderBy: [{ teamRole: "desc" }, { createdAt: "asc" }],
  });
}

/**
 * Neuen Lead gleichmäßig zuteilen: unter allen Team-Mitgliedern, die Leads
 * bekommen, an den, der am längsten keinen bekommen hat. Nur wenn es ein
 * Team gibt (mehr als ein Login); sonst bleibt alles wie bisher. Wer gerade
 * abwesend ist, wird übersprungen.
 */
export async function assignLead(leadId: string): Promise<string | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { customerId: true, assignedUserId: true } });
  if (!lead || lead.assignedUserId) return lead?.assignedUserId ?? null;
  const members = await prisma.user.findMany({
    where: { customerId: lead.customerId, role: "BUYER" },
    select: { id: true, teamRole: true, receivesLeads: true, lastLeadAssignedAt: true, createdAt: true, advisorCalendar: { select: { status: true } } },
  });
  if (members.length < 2) return null;
  // Erst nach Kalender und App mit Mitteilungen (Ole, 21.11.2026, lib/team-bereit.ts)
  const mitPush = await nutzerMitPush(members.map((m) => m.id));
  const { bereitFuerLeads } = await import("@/lib/team-bereit");
  const bereit = (m: (typeof members)[number]) =>
    bereitFuerLeads({ owner: m.teamRole !== "advisor", kalender: m.advisorCalendar?.status === "connected", push: mitPush.has(m.id) }).bereit;
  // Abwesende (Urlaub, Krank …) werden übersprungen, ohne ihren Schalter zu ändern.
  const absent = await absentUserIds(lead.customerId);
  const receivers = members.filter((m) => m.receivesLeads && !absent.has(m.id) && bereit(m));
  if (receivers.length === 0) return null; // niemand eingeteilt/da → Inhaber sieht ihn
  receivers.sort(
    (a, b) =>
      (a.lastLeadAssignedAt?.getTime() ?? 0) - (b.lastLeadAssignedAt?.getTime() ?? 0) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const pick = receivers[0];
  const now = new Date();
  await prisma.$transaction([
    prisma.lead.updateMany({ where: { id: leadId, assignedUserId: null }, data: { assignedUserId: pick.id } }),
    // leadReceivedAt: zählt heute als aktiver Verkäufer (Platz-Abrechnung, lib/seats.ts)
    prisma.user.update({ where: { id: pick.id }, data: { lastLeadAssignedAt: now, leadReceivedAt: now } }),
  ]);
  return pick.id;
}

/** Name für die Anzeige (Anzeigename, sonst E-Mail). */
export const memberName = (m: { displayName: string | null; email: string }) => m.displayName?.trim() || m.email;

/** Push zu einem Lead: an den zuständigen Berater, sonst an alle des Kunden. */
export async function notifyLeadPush(leadId: string, payload: PushPayload) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { customerId: true, assignedUserId: true } });
  if (!lead) return;
  try {
    if (lead.assignedUserId) await sendToUser(lead.assignedUserId, payload);
    else await sendToBuyersOfCustomer(lead.customerId, payload);
  } catch (err) {
    reportError(err, "team-push");
  }
}
