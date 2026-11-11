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

/**
 * „Chats“ schon vor dem Verbinden zeigen (mit Hinweis „WhatsApp verbinden“):
 * nur neue Oberfläche und Paket mit Software. Sonst wie bisher nur mit Postfach.
 */
export async function showChatsTeaser(customerId: string): Promise<boolean> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { newUi: true, plan: true } });
  return !!c?.newUi && c.plan !== "service";
}
