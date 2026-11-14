"use server";

// Lead-Stammdaten im Kontakt korrigieren (Ole, 14.11.2026). Berater nur bei eigenen Leads (writableCustomerId).

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { fetchLeadRecord } from "@/lib/airtable-write";
import { prisma } from "@/lib/prisma";
import { recordUsage } from "@/lib/usage";
import { saveLeadStammdaten, type SaveStammdatenResult, type StammdatenInput } from "@/lib/lead-stammdaten";

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
