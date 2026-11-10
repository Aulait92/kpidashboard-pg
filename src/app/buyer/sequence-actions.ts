"use server";

// Lead-Detail: laufende Nachfass-Abfolge stoppen.

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { writableCustomerId } from "@/lib/buyer-write";
import { stopSequences } from "@/lib/lead-sequences";
import { recordUsage } from "@/lib/usage";

export async function stopLeadSequenceAction(leadId: string): Promise<{ ok: boolean; error?: string }> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  const n = await stopSequences(leadId, "Vom Berater gestoppt");
  if (n > 0) {
    await audit("lead.sequence_stop", { entity: "Lead", entityId: leadId, customerId });
    await recordUsage("action", "sequence.stop");
  }
  revalidatePath(`/buyer/leads/${leadId}`);
  revalidatePath("/buyer");
  return { ok: true };
}
