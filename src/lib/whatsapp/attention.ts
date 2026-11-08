// „Braucht dich": Chats, in denen der Berater gefragt ist. Gesetzt, wenn der
// Assistent übergibt (handover_to_advisor) oder ein Lead in einem bereits
// übernommenen Chat schreibt. Beim ersten Setzen gibt es eine Push-Nachricht
// an den Kunden; zurückgesetzt wird beim Antworten oder per „Erledigt".

import { prisma } from "@/lib/prisma";
import { sendToBuyersOfCustomer } from "@/lib/push";

export async function flagAttention(conversationId: string, reason: string): Promise<void> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, customerId: true, contactName: true, contactPhone: true, needsAttention: true },
  });
  if (!conv) return;
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { needsAttention: true, attentionReason: reason.slice(0, 200), attentionAt: new Date() },
  });
  if (conv.needsAttention) return; // schon markiert → kein zweiter Push
  await sendToBuyersOfCustomer(conv.customerId, {
    title: `💬 ${conv.contactName ?? `+${conv.contactPhone}`} braucht dich`,
    body: reason.slice(0, 140),
    tag: `chat-attention:${conv.id}`,
    url: `/buyer/chats?c=${conv.id}`,
  }).catch((e) => console.error("[attention push]", e));
}

export async function clearAttention(conversationId: string): Promise<void> {
  await prisma.conversation.updateMany({
    where: { id: conversationId, needsAttention: true },
    data: { needsAttention: false, attentionReason: null, attentionAt: null },
  });
}

export async function attentionCount(customerId: string): Promise<number> {
  return prisma.conversation.count({ where: { customerId, needsAttention: true } });
}
