import { recordLeadProgress } from "@/lib/lead-progress";
import { prisma } from "@/lib/prisma";

/**
 * Verknüpft eine Konversation mit dem passenden Lead desselben Kunden
 * (gleiche, normalisierte Telefonnummer — neuester Lead gewinnt) und übernimmt
 * fehlende Kontaktdaten. Tut nichts, wenn bereits verknüpft oder kein Treffer.
 * Strikt tenant-isoliert: nur Leads mit derselben customerId.
 */
export async function linkLeadToConversation(conversationId: string): Promise<void> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      customerId: true,
      contactPhone: true,
      leadId: true,
      contactName: true,
      contactEmail: true,
    },
  });
  if (!conv || conv.leadId) return;

  // 1) gleiche Telefonnummer, 2) sonst gleiche E-Mail (Lead hat im Formular
  // evtl. eine andere Nummer angegeben als beim Buchen).
  const lead =
    (await prisma.lead.findFirst({
      where: { customerId: conv.customerId, phone: conv.contactPhone },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true },
    })) ??
    (conv.contactEmail
      ? await prisma.lead.findFirst({
          where: {
            customerId: conv.customerId,
            email: { equals: conv.contactEmail, mode: "insensitive" },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, email: true },
        })
      : null);
  if (!lead) return;

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      leadId: lead.id,
      ...(!conv.contactName && lead.name ? { contactName: lead.name } : {}),
      ...(!conv.contactEmail && lead.email ? { contactEmail: lead.email } : {}),
    },
  });
}

/**
 * Gegenrichtung: Ein Lead kommt erst NACH der Buchung im System an (Meta-
 * Formular → Zapier → Airtable → Sync dauert 1–2 Minuten, gebucht wird direkt
 * nach dem Formular). Dann die passende, noch unverknüpfte Konversation
 * (gleiche Nummer oder E-Mail, letzte 14 Tage) übernehmen, ihre Termine dem
 * Lead zuordnen und den Lead bei gebuchtem Termin auf „In Beratung" setzen.
 */
export async function attachLeadToContact(leadId: string): Promise<void> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { customerId: true, phone: true, email: true },
  });
  if (!lead?.customerId) return;
  const or: object[] = [];
  if (lead.phone) or.push({ contactPhone: lead.phone });
  if (lead.email) or.push({ contactEmail: { equals: lead.email, mode: "insensitive" } });
  if (or.length === 0) return;

  const conv = await prisma.conversation.findFirst({
    where: {
      customerId: lead.customerId,
      leadId: null,
      createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      OR: or,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!conv) return;

  await prisma.conversation.update({ where: { id: conv.id }, data: { leadId } });
  await prisma.appointment.updateMany({
    where: { conversationId: conv.id, leadId: null },
    data: { leadId },
  });
  const booked = await prisma.appointment.count({ where: { leadId, status: "booked" } });
  if (booked > 0) {
    await recordLeadProgress(leadId, "booked");
  } else {
    const replied = await prisma.message.count({
      where: { conversationId: conv.id, direction: "inbound" },
    });
    if (replied > 0) await recordLeadProgress(leadId, "replied");
  }
}
