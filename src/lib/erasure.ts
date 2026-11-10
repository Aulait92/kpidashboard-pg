// DSGVO-Löschung (Art. 17): Personenbezogene Daten eines Leads entfernen.
// Die Lead-Zeile bleibt anonym erhalten (Produkt, Status, Datum, Umsatz), damit
// Abrechnung und Kennzahlen stimmen. Chats, Termine und Einwilligungen werden
// gelöscht. Der Airtable-Sync überspringt gelöschte Leads (erasedAt).

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";

export const ERASED_NAME = "Gelöscht (Datenschutz)";

export type EraseResult = { conversations: number; messages: number; appointments: number; consents: number };

/** Einen Lead anonymisieren. Gibt null zurück, wenn es ihn nicht gibt. */
export async function eraseLead(leadId: string, actor?: AuditActor): Promise<EraseResult | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, customerId: true, phone: true, externalId: true, airtableId: true, erasedAt: true },
  });
  if (!lead) return null;
  const result = await eraseLeads(lead.customerId, [lead]);
  await audit("lead.erase", {
    entity: "Lead",
    entityId: lead.id,
    customerId: lead.customerId,
    // Bewusst ohne Name/Telefon: das Protokoll soll die Daten nicht weiter vorhalten.
    details: { ...result, airtable: !!lead.airtableId },
    actor,
  });
  return result;
}

/** Alle Leads eines Kunden anonymisieren (Vertragsende) und Kalender trennen. */
export async function eraseCustomerData(customerId: string, actor?: AuditActor) {
  const leads = await prisma.lead.findMany({
    where: { customerId },
    select: { id: true, customerId: true, phone: true, externalId: true, airtableId: true, erasedAt: true },
  });
  const result = await eraseLeads(customerId, leads);
  // Restliche Chats/Termine/Einwilligungen ohne Lead-Bezug (z. B. Leute, die
  // von sich aus geschrieben haben).
  const [conv, appt, consent] = await prisma.$transaction([
    prisma.conversation.deleteMany({ where: { customerId } }),
    prisma.appointment.deleteMany({ where: { customerId } }),
    prisma.consentOptIn.deleteMany({ where: { customerId } }),
    prisma.calendarConnection.deleteMany({ where: { customerId } }),
    prisma.advisorCalendar.deleteMany({ where: { user: { customerId } } }),
  ]);
  const total = {
    leads: leads.length,
    conversations: result.conversations + conv.count,
    messages: result.messages,
    appointments: result.appointments + appt.count,
    consents: result.consents + consent.count,
  };
  await audit("customer.erase", { entity: "Customer", entityId: customerId, customerId, details: total, actor });
  return total;
}

type LeadRef = { id: string; customerId: string; phone: string | null; externalId: string | null };

async function eraseLeads(customerId: string, leads: LeadRef[]): Promise<EraseResult> {
  const res: EraseResult = { conversations: 0, messages: 0, appointments: 0, consents: 0 };
  if (leads.length === 0) return res;
  const ids = leads.map((l) => l.id);
  const phones = leads.map((l) => l.phone).filter((p): p is string => !!p);
  const externalIds = leads.map((l) => l.externalId).filter((p): p is string => !!p);

  const convs = await prisma.conversation.findMany({
    where: { customerId, OR: [{ leadId: { in: ids } }, ...(phones.length ? [{ contactPhone: { in: phones } }] : [])] },
    select: { id: true },
  });
  const convIds = convs.map((c) => c.id);

  const [messages, appointments, conversations, consents] = await prisma.$transaction([
    prisma.message.deleteMany({ where: { conversationId: { in: convIds } } }),
    prisma.appointment.deleteMany({
      where: { customerId, OR: [{ leadId: { in: ids } }, ...(convIds.length ? [{ conversationId: { in: convIds } }] : [])] },
    }),
    prisma.conversation.deleteMany({ where: { id: { in: convIds } } }),
    prisma.consentOptIn.deleteMany({ where: { customerId, contactPhone: { in: phones } } }),
    prisma.unassignedLead.deleteMany({ where: { externalId: { in: externalIds } } }),
    prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: {
        name: ERASED_NAME,
        phone: null,
        email: null,
        formData: Prisma.DbNull,
        notes: null,
        followUpAt: null,
        followUpNote: null,
        callbackSnoozedUntil: null,
        erasedAt: new Date(),
      },
    }),
  ]);
  res.messages = messages.count;
  res.appointments = appointments.count;
  res.conversations = conversations.count;
  res.consents = consents.count;
  return res;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Löschfristen für Hilfsdaten (täglich im Cron): nicht zugeordnete Leads
 * (Rohdaten aus Meta) nach 30 Tagen, wenn erledigt, sonst nach 90 Tagen;
 * Passwort-Links 7 Tage nach Ablauf.
 */
export async function pruneTransient(now = new Date()) {
  const [unassigned, resetTokens] = await prisma.$transaction([
    prisma.unassignedLead.deleteMany({
      where: {
        OR: [
          { resolvedAt: { lt: new Date(now.getTime() - 30 * DAY_MS) } },
          { createdAt: { lt: new Date(now.getTime() - 90 * DAY_MS) } },
        ],
      },
    }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * DAY_MS) } } }),
  ]);
  return { unassigned: unassigned.count, resetTokens: resetTokens.count };
}
