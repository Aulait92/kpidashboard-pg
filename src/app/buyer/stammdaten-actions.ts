"use server";

// Lead-Stammdaten im Kontakt korrigieren (Ole, 14.11.2026). Berater nur bei eigenen Leads (writableCustomerId).

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { fetchLeadRecord } from "@/lib/airtable-write";
import { prisma } from "@/lib/prisma";
import { recordUsage } from "@/lib/usage";
import { erstnachrichtAnNeueNummer, saveLeadStammdaten, type SaveStammdatenResult, type StammdatenInput } from "@/lib/lead-stammdaten";

export async function saveLeadStammdatenAction(leadId: string, input: Partial<StammdatenInput>): Promise<SaveStammdatenResult> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: "Diesen Lead können Sie nicht bearbeiten." };
  const ctx = await getBuyerContext();
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: { airtableId: true } });
  let fields: Record<string, unknown> | null = null;
  if (lead?.airtableId) {
    try {
      fields = await fetchLeadRecord({ airtableId: lead.airtableId });
    } catch {
      /* ohne Airtable-Felder: Verlauf zeigt dann nur die bekannten Werte */
    }
  }
  const r = await saveLeadStammdaten({ leadId, customerId, userId: ctx?.userId ?? null, input, fields });
  if (r.ok && r.changed.length) {
    await recordUsage("action", "lead.stammdaten");
    revalidatePath(`/buyer/leads/${leadId}`);
    revalidatePath("/buyer/leads");
    revalidatePath("/buyer");
  }
  return r;
}

/** Nach dem Ändern der Nummer: Erstnachricht per WhatsApp an die neue Nummer (Klick des Vermittlers, Ole 22.11.2026). */
export async function erstnachrichtAnNeueNummerAction(leadId: string): Promise<{ ok: boolean; text: string }> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, text: "Diesen Lead können Sie nicht bearbeiten." };
  const r = await erstnachrichtAnNeueNummer(leadId, customerId);
  if (r.ok) {
    await recordUsage("action", "lead.erstnachricht_neue_nummer");
    revalidatePath(`/buyer/leads/${leadId}`);
  }
  return r;
}
