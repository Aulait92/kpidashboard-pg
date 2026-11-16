"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { deleteTestLead } from "@/lib/testlead";

/** Kontakt → Mehr → „Testlead löschen“: nur Testleads, vom Kunden selbst oder vom Admin in „Als Kunde ansehen“. */
export async function deleteOwnTestLeadAction(leadId: string): Promise<{ ok: boolean; error?: string }> {
  let customerId = await writableCustomerId(leadId);
  if (!customerId) {
    const [session, ctx] = await Promise.all([getCurrentSession(), getBuyerContext()]);
    if (session?.role === "ADMIN" && ctx?.preview && !ctx.demo) customerId = ctx.customerId;
  }
  if (!customerId) return { ok: false, error: "Keine Berechtigung." };
  const r = await deleteTestLead(leadId, { customerId });
  if (!r.ok) return r;
  revalidatePath("/buyer", "layout");
  return { ok: true };
}
