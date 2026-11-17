// „Braucht dich": Chats, in denen der Berater gefragt ist. Gesetzt, wenn der
// Assistent übergibt (handover_to_advisor) oder ein Lead in einem bereits
// übernommenen Chat schreibt. Beim ersten Setzen gibt es eine Push-Nachricht
// an den Kunden; zurückgesetzt wird beim Antworten oder per „Erledigt".

import { prisma } from "@/lib/prisma";
import { sendToBuyersOfCustomer, sendToUser } from "@/lib/push";
import { conversationScope, type TeamCtx } from "@/lib/team";
import { waOhneMarker } from "@/lib/wa-format";

/** opts.push = false: nur markieren, kein Push (z. B. Kontakt aus der WhatsApp-Business-App). */
export async function flagAttention(conversationId: string, reason: string, opts: { push?: boolean } = {}): Promise<void> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, customerId: true, contactName: true, contactPhone: true, needsAttention: true, assignedUserId: true, lead: { select: { assignedUserId: true } } },
  });
  if (!conv) return;
  // Grund enthält oft Chattext (Zitat): ohne WhatsApp-Marker für Hinweis und Push (lib/wa-format.ts)
  reason = waOhneMarker(reason);
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { needsAttention: true, attentionReason: reason.slice(0, 200), attentionAt: new Date() },
  });
  if (conv.needsAttention || opts.push === false) return; // schon markiert → kein zweiter Push
  const payload = {
    title: `💬 ${conv.contactName ?? `+${conv.contactPhone}`} braucht dich`,
    body: reason.slice(0, 140),
    tag: `chat-attention:${conv.id}`,
    url: `/buyer/chats?c=${conv.id}`,
  };
  // Team: nur der zuständige Berater bekommt den Push.
  const assignee = conv.lead?.assignedUserId ?? conv.assignedUserId;
  await (assignee ? sendToUser(assignee, payload) : sendToBuyersOfCustomer(conv.customerId, payload)).catch((e) =>
    console.error("[attention push]", e),
  );
}

export async function clearAttention(conversationId: string): Promise<void> {
  await prisma.conversation.updateMany({
    where: { id: conversationId, needsAttention: true },
    data: { needsAttention: false, attentionReason: null, attentionAt: null },
  });
}

export async function attentionCount(ctx: TeamCtx): Promise<number> {
  return prisma.conversation.count({ where: { ...conversationScope(ctx), needsAttention: true } });
}
