"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { createTestLead, deleteTestLead, type CreateTestLeadResult } from "@/lib/testlead";

/** Admin → Kunde → Leads → „Testlead schicken“ (nur Admins; echte Kunden nur mit Bestätigung). */
export async function sendTestLeadAction(input: { customerId: string; name: string; product: string; phone: string; confirmed?: boolean }): Promise<CreateTestLeadResult> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return { ok: false, error: "Nur Admins." };
  const r = await createTestLead(
    { customerId: input.customerId, name: input.name, product: input.product, phone: input.phone, confirmed: !!input.confirmed },
    { id: session.userId, email: session.email, role: session.role },
  );
  if (r.ok) revalidatePath(`/admin/kunden/${input.customerId}`, "layout");
  return r;
}

/** Admin: Testlead löschen (nur Leads mit Kennzeichen „Test“). */
export async function deleteTestLeadAdminAction(customerId: string, leadId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return { ok: false, error: "Nur Admins." };
  const r = await deleteTestLead(leadId, { customerId, actor: { id: session.userId, email: session.email, role: session.role } });
  if (!r.ok) return r;
  revalidatePath(`/admin/kunden/${customerId}`, "layout");
  return { ok: true };
}
