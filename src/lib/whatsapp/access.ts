import { prisma } from "@/lib/prisma";

/**
 * Hat dieser Kunde WhatsApp im Einsatz (Konto verbunden oder Agent aktiv)?
 * Steuert, ob im Kunden-CRM der Chat-Bereich erscheint — Kunden ohne
 * WhatsApp sehen das Kunden-CRM unverändert.
 */
export async function hasWhatsAppInbox(customerId: string): Promise<boolean> {
  const [account, agent] = await Promise.all([
    prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true, apiKeyEnc: true } }),
    prisma.agentConfig.findUnique({ where: { customerId }, select: { active: true } }),
  ]);
  if (agent?.active || inboxReady(account)) return true;
  // Ole, 15.11.2026: Einladung oder halb fertige Verbindung zählt nicht als Postfach.
  // Gab es schon Gespräche (z. B. Verbindung später getrennt), bleiben die Chats sichtbar.
  if (!account) return false;
  return (await prisma.conversation.count({ where: { customerId }, take: 1 })) > 0;
}

/** Konto ist wirklich nutzbar: verbunden oder mit API-Key (nicht nur eingeladen bzw. in Einrichtung). */
export function inboxReady(account: { status: string; apiKeyEnc: string | null } | null): boolean {
  return !!account && (account.status === "connected" || !!account.apiKeyEnc);
}

/**
 * „Chats“ schon vor dem Verbinden zeigen (mit Hinweis „WhatsApp verbinden“):
 * nur neue Oberfläche und Paket mit Software. Sonst wie bisher nur mit Postfach.
 */
export async function showChatsTeaser(customerId: string): Promise<boolean> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { newUi: true, plan: true } });
  return !!c?.newUi && c.plan !== "service";
}
