"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { deleteTestCustomer } from "@/lib/testkunde";

/** Testkunde mit einem Klick löschen (nur Admins, nur Kunden mit Kennzeichen „Test“). */
export async function deleteTestCustomerAction(customerId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return { ok: false, error: "Nur Admins." };
  const r = await deleteTestCustomer(customerId);
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/admin/kunden", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
  return { ok: true };
}
