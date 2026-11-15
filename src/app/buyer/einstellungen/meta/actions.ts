"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { getBuyerContext } from "@/lib/buyer-context";
import { setCapiEnabled } from "@/lib/capi/server";
import { canEditProvision } from "@/lib/provision-server";

/** Rückmeldung an Meta an/aus (nur Inhaber, nicht in der Admin-Vorschau). */
export async function setCapiEnabledAction(on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  if (ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  if (!canEditProvision(ctx)) return { ok: false, error: "Nur der Inhaber kann das ändern." };
  await setCapiEnabled(ctx.customerId, !!on);
  await audit("customer.capi", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { on: !!on } });
  revalidatePath("/buyer/einstellungen/meta");
  return { ok: true };
}
