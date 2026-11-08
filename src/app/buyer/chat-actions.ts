"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { cancelAppointment } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/gateway";

// Chat-Aktionen im Kunden-CRM. Strikte Mandantentrennung: Jede Aktion lädt
// die Konversation NUR zusammen mit der customerId des eingeloggten Buyers.
// Admin-Vorschau ist schreibgeschützt (verlangt role=BUYER).

async function requireBuyer() {
  const session = await getCurrentSession();
  if (!session || session.role !== "BUYER" || !session.customerId) return null;
  return session as typeof session & { customerId: string };
}

function chatUrl(conversationId: string, err?: string) {
  const p = new URLSearchParams({ c: conversationId });
  if (err) p.set("err", err);
  return `/buyer/chats?${p.toString()}`;
}

/** Assistent für diesen Chat pausieren / wieder aktivieren. */
export async function toggleBotBuyerAction(formData: FormData): Promise<void> {
  const conversationId = String(formData.get("conversationId") ?? "");
  const session = await requireBuyer();
  if (!session) redirect(chatUrl(conversationId, "preview"));
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, customerId: session.customerId },
    select: { id: true, botActive: true },
  });
  if (!conv) redirect("/buyer/chats");
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { botActive: !conv.botActive },
  });
  revalidatePath("/buyer/chats");
  redirect(chatUrl(conv.id));
}

/**
 * Selbst antworten. Übernimmt automatisch (Assistent pausiert), damit Mensch
 * und Assistent nicht gleichzeitig schreiben.
 */
export async function sendReplyBuyerAction(formData: FormData): Promise<void> {
  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const session = await requireBuyer();
  if (!session) redirect(chatUrl(conversationId, "preview"));
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, customerId: session.customerId },
    select: { id: true, contactPhone: true, windowExpiresAt: true },
  });
  if (!conv) redirect("/buyer/chats");
  if (!body) redirect(chatUrl(conv.id));
  if (!conv.windowExpiresAt || conv.windowExpiresAt.getTime() <= Date.now()) {
    redirect(chatUrl(conv.id, "window"));
  }

  let failed = false;
  try {
    await sendWhatsAppMessage({
      customerId: session.customerId,
      to: conv.contactPhone,
      body,
      sentBy: "agent",
      sentByUserId: session.userId,
    });
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { botActive: false, needsAttention: false, attentionReason: null, attentionAt: null },
    });
  } catch (err) {
    console.error("[buyer chat reply]", err);
    failed = true;
  }
  revalidatePath("/buyer/chats");
  redirect(chatUrl(conv.id, failed ? "send" : undefined));
}

/** Termin absagen (nur eigene Termine; Teilnehmer erhalten eine Absage). */
export async function cancelAppointmentBuyerAction(formData: FormData): Promise<void> {
  const appointmentId = String(formData.get("appointmentId") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  const session = await requireBuyer();
  if (!session) redirect(chatUrl(conversationId, "preview"));
  try {
    // cancelAppointment prüft customerId → fremde Termine sind nicht absagbar.
    await cancelAppointment(appointmentId, session.customerId);
  } catch (err) {
    console.error("[buyer cancel appointment]", err);
  }
  revalidatePath("/buyer/chats");
  redirect(chatUrl(conversationId));
}

/** „Braucht dich" als erledigt markieren (z. B. nach einem Anruf). */
export async function markChatDoneBuyerAction(formData: FormData): Promise<void> {
  const conversationId = String(formData.get("conversationId") ?? "");
  const session = await requireBuyer();
  if (!session) redirect(chatUrl(conversationId, "preview"));
  await prisma.conversation.updateMany({
    where: { id: conversationId, customerId: session.customerId },
    data: { needsAttention: false, attentionReason: null, attentionAt: null },
  });
  revalidatePath("/buyer/chats");
  revalidatePath("/buyer");
  redirect(chatUrl(conversationId));
}

/**
 * Nachfassen, wenn das 24-h-Fenster zu ist: freigegebene Vorlage „followup"
 * senden. Antwortet der Lead, ist der Chat wieder offen.
 */
export async function followupBuyerAction(formData: FormData): Promise<void> {
  const conversationId = String(formData.get("conversationId") ?? "");
  const session = await requireBuyer();
  if (!session) redirect(chatUrl(conversationId, "preview"));
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, customerId: session.customerId },
    select: { id: true, contactPhone: true, contactName: true, leadId: true },
  });
  if (!conv) redirect("/buyer/chats");
  const { NoTemplateError, sendWhatsAppNotice } = await import("@/lib/whatsapp/templates");
  const { chooseFollowup } = await import("@/lib/whatsapp/followup");
  // Zweck/Vorlage serverseitig aus der Situation ableiten (nicht vom Client).
  const choice = await chooseFollowup(conv.id);
  let err: string | undefined;
  if (choice.kind === "blocked") {
    err = "followup_blocked";
  } else {
    try {
      await sendWhatsAppNotice({
        customerId: session.customerId,
        to: conv.contactPhone,
        purpose: choice.purpose,
        params: choice.params,
        text: choice.preview,
        leadId: conv.leadId,
        contactName: conv.contactName,
      });
    } catch (e) {
      console.error("[buyer followup]", e);
      err = e instanceof NoTemplateError ? "template" : "send";
    }
  }
  revalidatePath("/buyer/chats");
  redirect(chatUrl(conv.id, err));
}
