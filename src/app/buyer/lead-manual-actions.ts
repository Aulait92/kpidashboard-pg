"use server";

// Termin von Hand eintragen und WhatsApp-Gespräch starten (lib/lead-manual.ts). Berater nur bei eigenen Leads.

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { recordUsage } from "@/lib/usage";
import { createManualAppointment, startLeadChat, type StartChatResult } from "@/lib/lead-manual";

export async function manualAppointmentAction(
  leadId: string,
  input: { date: string; time: string; mode: string; durationMin?: number; note?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: "Diesen Lead können Sie nicht bearbeiten." };
  const ctx = await getBuyerContext();
  const r = await createManualAppointment({ leadId, customerId, userId: ctx?.userId ?? null, ...input });
  if (!r.ok) return r;
  await recordUsage("action", "lead.termin_manuell");
  revalidatePath(`/buyer/leads/${leadId}`);
  revalidatePath("/buyer");
  return { ok: true };
}

export async function startLeadChatAction(leadId: string): Promise<StartChatResult> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, reason: "not_found", error: "Diesen Lead können Sie nicht bearbeiten." };
  const r = await startLeadChat({ leadId, customerId });
  if (r.ok) {
    await recordUsage("action", "lead.chat_start");
    revalidatePath(`/buyer/leads/${leadId}`);
    revalidatePath("/buyer/chats");
  }
  return r;
}
