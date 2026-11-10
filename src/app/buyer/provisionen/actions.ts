"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { getBuyerContext } from "@/lib/buyer-context";
import { canEditProvision, saveCustomerProvision } from "@/lib/provision-server";

export type ProvisionFormState = { ok?: boolean; error?: string; at?: number };

/** „Meine Provisionen“ speichern (nur Inhaber, nicht in der Admin-Vorschau). */
export async function saveProvisionAction(_prev: ProvisionFormState, fd: FormData): Promise<ProvisionFormState> {
  const ctx = await getBuyerContext();
  if (!ctx) return { error: "Bitte neu anmelden." };
  if (ctx.preview) return { error: "In der Vorschau nicht möglich." };
  if (!canEditProvision(ctx)) return { error: "Nur der Inhaber kann die Provisionen ändern." };
  let payload: { typ?: unknown; rates?: unknown };
  try {
    payload = JSON.parse(String(fd.get("payload") ?? "{}"));
  } catch {
    return { error: "Ungültige Eingabe." };
  }
  const res = await saveCustomerProvision(ctx.customerId, { typ: payload.typ, rates: payload.rates ?? {} });
  if (!res.ok) return { error: res.error };
  await audit("customer.provision", {
    entity: "Customer",
    entityId: ctx.customerId,
    customerId: ctx.customerId,
    details: { typ: String(payload.typ), eigeneSaetze: res.changed },
  });
  revalidatePath("/buyer", "layout");
  return { ok: true, at: Date.now() };
}
