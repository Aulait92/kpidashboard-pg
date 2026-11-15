"use server";

// Terminvorbereitung: „Vorbereitet“ abhaken bzw. zurücknehmen.

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { setPrepared } from "@/lib/termin-vorbereitung-server";

export async function setPreparedAction(appointmentId: string, prepared: boolean): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  if (ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  const ok = await setPrepared(appointmentId, ctx, prepared);
  revalidatePath("/buyer");
  revalidatePath(`/buyer/termine/${appointmentId}/vorbereitung`);
  return ok ? { ok: true } : { ok: false, error: "Termin nicht gefunden." };
}
