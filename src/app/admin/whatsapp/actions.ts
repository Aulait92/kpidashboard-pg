"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/gateway";
import { ADMIN_FOLLOWUP_PURPOSES, chooseFollowup, followupOptions } from "@/lib/whatsapp/followup";
import { NoTemplateError, sendWhatsAppNotice } from "@/lib/whatsapp/templates";

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") throw new Error("Nicht erlaubt.");
  return session;
}

export type AdminChatResult = { ok: true } | { ok: false; error: string };

/** Bot an/aus für eine Konversation (gemeinsam für Knopf und „Übernehmen beim Tippen“). */
async function setBotActive(conversationId: string, active: boolean): Promise<boolean> {
  const res = await prisma.conversation.updateMany({
    where: { id: conversationId },
    data: { botActive: active },
  });
  return res.count > 0;
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
  await setBotActive(conversationId, !conv.botActive);
  revalidatePath("/admin/whatsapp");
}

/** Übernehmen (Bot aus), z. B. sobald der Admin im Chat zu tippen beginnt. Idempotent. */
export async function takeOverAction(conversationId: string): Promise<AdminChatResult> {
  await requireAdmin();
  if (typeof conversationId !== "string" || !conversationId) return { ok: false, error: "Chat nicht gefunden." };
  const ok = await setBotActive(conversationId, false);
  revalidatePath("/admin/whatsapp");
  return ok ? { ok: true } : { ok: false, error: "Chat nicht gefunden." };
}

/** Als Agent manuell antworten (sendet über 360dialog, nur im offenen 24h-Fenster). */
export async function sendReplyAction(conversationId: string, rawBody: string): Promise<AdminChatResult> {
  const session = await requireAdmin();
  const body = typeof rawBody === "string" ? rawBody.trim() : "";
  if (typeof conversationId !== "string" || !conversationId || !body) return { ok: false, error: "Bitte eine Nachricht eingeben." };

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { customerId: true, contactPhone: true, windowExpiresAt: true },
  });
  if (!conv) return { ok: false, error: "Chat nicht gefunden." };
  if (!conv.windowExpiresAt || conv.windowExpiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "Das Antwortfenster ist geschlossen. Bitte eine Vorlage senden." };
  }

  try {
    await sendWhatsAppMessage({
      customerId: conv.customerId,
      to: conv.contactPhone,
      body,
      sentBy: "agent",
      sentByUserId: session.userId,
    });
  } catch (err) {
    console.error("[whatsapp reply]", err);
    return { ok: false, error: "Nachricht konnte nicht gesendet werden." };
  }
  // Wer selbst schreibt, hat übernommen: der Bot antwortet nicht dazwischen.
  await setBotActive(conversationId, false);
  revalidatePath("/admin/whatsapp");
  return { ok: true };
}

/**
 * Fenster geschlossen: freigegebene Nachfass-Vorlage senden. Der Client wählt
 * nur den Zweck; Parameter und Text entstehen serverseitig. Gleiche Sperren wie
 * im Kundenbereich (kein Interesse, Abschluss, Termin steht).
 */
export async function sendTemplateAction(conversationId: string, purpose: string): Promise<AdminChatResult> {
  await requireAdmin();
  if (typeof conversationId !== "string" || !conversationId) return { ok: false, error: "Chat nicht gefunden." };
  if (!(ADMIN_FOLLOWUP_PURPOSES as readonly string[]).includes(purpose)) return { ok: false, error: "Bitte eine Vorlage wählen." };
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, customerId: true, contactPhone: true, contactName: true, leadId: true },
  });
  if (!conv) return { ok: false, error: "Chat nicht gefunden." };
  const situation = await chooseFollowup(conv.id);
  if (situation.kind === "blocked") return { ok: false, error: situation.reason };
  const option = (await followupOptions(conv.id)).find((o) => o.key === purpose);
  if (!option?.approved) return { ok: false, error: "Für diese Vorlage gibt es noch keine Freigabe von Meta." };
  try {
    await sendWhatsAppNotice({
      customerId: conv.customerId,
      to: conv.contactPhone,
      purpose: option.purpose,
      params: option.params,
      legacyParams: option.legacyParams,
      buttonPayloads: option.buttonPayloads,
      anrede: option.anrede,
      text: option.preview,
      leadId: conv.leadId,
      contactName: conv.contactName,
      // Von Hand gesendet (Klick), keine Automatik
      manuell: true,
    });
  } catch (err) {
    console.error("[whatsapp template]", err);
    return { ok: false, error: err instanceof NoTemplateError ? "Für diese Vorlage gibt es noch keine Freigabe von Meta." : "Vorlage konnte nicht gesendet werden." };
  }
  revalidatePath("/admin/whatsapp");
  return { ok: true };
}

// ─── Support-Nummer: Chat einem Vertriebskontakt bzw. Kunden zuordnen (Ole, 15.11.2026) ───

export type SupportAssignState = { ok?: boolean; error?: string; candidates?: { type: "contact" | "customer"; id: string; label: string }[] };

/** Suchen und zuordnen: genau ein Treffer → sofort zuordnen, mehrere → zur Auswahl; „pick“ ordnet direkt zu. */
export async function assignSupportContactAction(_prev: SupportAssignState, fd: FormData): Promise<SupportAssignState> {
  await requireAdmin();
  const { assignSupportConversation, findAssignCandidates } = await import("@/lib/whatsapp/support-contacts");
  const conversationId = String(fd.get("conversationId") ?? "");
  if (!conversationId) return { error: "Chat fehlt." };
  if (fd.get("unlink")) {
    await assignSupportConversation(conversationId, null);
    revalidatePath("/admin/whatsapp");
    return { ok: true };
  }
  const pick = String(fd.get("pick") ?? "");
  if (pick) {
    const [type, id] = pick.split(":");
    if ((type !== "contact" && type !== "customer") || !id) return { error: "Ungültige Auswahl." };
    const ok = await assignSupportConversation(conversationId, { type, id });
    revalidatePath("/admin/whatsapp");
    return ok ? { ok: true } : { error: "Zuordnung nicht möglich." };
  }
  const candidates = await findAssignCandidates(String(fd.get("q") ?? ""));
  if (!candidates.length) return { error: "Nichts gefunden. Name, Firma oder E-Mail eingeben." };
  if (candidates.length === 1) {
    await assignSupportConversation(conversationId, candidates[0]);
    revalidatePath("/admin/whatsapp");
    return { ok: true };
  }
  return { candidates };
}
