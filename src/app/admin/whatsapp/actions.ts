"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/gateway";

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") throw new Error("Nicht erlaubt.");
  return session;
}

/** KI-Bot für eine Konversation an- oder ausschalten (Mensch übernimmt). */
export async function toggleBotAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const conversationId = String(formData.get("conversationId") ?? "");
  if (!conversationId) return;
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { botActive: true },
  });
  if (!conv) return;
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { botActive: !conv.botActive },
  });
  revalidatePath(`/admin/whatsapp/${conversationId}`);
  revalidatePath("/admin/whatsapp");
}

/** Als Agent manuell antworten (sendet über 360dialog). */
export async function sendReplyAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!conversationId || !body) return;

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { customerId: true, contactPhone: true },
  });
  if (!conv) return;

  const userId = await prisma.user
    .findUnique({ where: { email: session.email }, select: { id: true } })
    .then((u) => u?.id ?? null);

  try {
    await sendWhatsAppMessage({
      customerId: conv.customerId,
      to: conv.contactPhone,
      body,
      sentBy: "agent",
      sentByUserId: userId,
    });
  } catch (err) {
    console.error("[whatsapp reply]", err);
  }
  revalidatePath(`/admin/whatsapp/${conversationId}`);
}
