"use server";

// Termin für einen Lead im Buchungsfenster der App (lib/lead-buchung.ts). Berater nur bei eigenen Leads.

import { anrufErledigt } from "@/lib/telefonat-server";
import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { recordUsage } from "@/lib/usage";
import { bookForLead, leadSlots, type BookForLeadResult, type LeadSlots } from "@/lib/lead-buchung";

export async function leadSlotsAction(leadId: string): Promise<LeadSlots> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, reason: "error", error: "Diesen Lead können Sie nicht bearbeiten." };
  return leadSlots(customerId, leadId);
}

export async function bookForLeadAction(leadId: string, start: string, mode: string): Promise<BookForLeadResult> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: "Diesen Lead können Sie nicht bearbeiten." };
  const ctx = await getBuyerContext();
  const r = await bookForLead({ customerId, leadId, start, mode: mode === "video" ? "video" : "phone", userId: ctx?.userId ?? null });
  if (r.ok) {
    // Termin eingetragen: Pause des Assistenten nach „Anrufen“ endet (lib/telefonat.ts)
    await anrufErledigt(leadId);
    await recordUsage("action", "appointment.book_by_advisor");
    revalidatePath(`/buyer/leads/${leadId}`);
    revalidatePath("/buyer");
  }
  return r;
}
