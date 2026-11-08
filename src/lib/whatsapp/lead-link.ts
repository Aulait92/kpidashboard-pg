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

  const lead = await prisma.lead.findFirst({
    where: { customerId: conv.customerId, phone: conv.contactPhone },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true },
  });
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
