import { prisma } from "@/lib/prisma";

/**
 * Hat dieser Kunde WhatsApp im Einsatz (Konto verbunden oder Agent aktiv)?
 * Steuert, ob im Kunden-CRM der Chat-Bereich erscheint — Kunden ohne
 * WhatsApp sehen das Kunden-CRM unverändert.
 */
export async function hasWhatsAppInbox(customerId: string): Promise<boolean> {
  const [account, agent] = await Promise.all([
    prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { id: true } }),
    prisma.agentConfig.findUnique({ where: { customerId }, select: { active: true } }),
  ]);
  return !!account || !!agent?.active;
}
