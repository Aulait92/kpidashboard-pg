"use server";

// Datenschutz-Anfrage auf „Heute“ als erledigt markieren (Betroffenenrechte, lib/dsgvo/server.ts). Nur der eigene Kunde.

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { dsgvoErledigt } from "@/lib/dsgvo/server";

export async function dsgvoErledigtAction(anfrageId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Nicht angemeldet." };
  if (ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  const ok = await dsgvoErledigt(ctx.customerId, anfrageId, ctx.userId ?? null);
  revalidatePath("/buyer");
  return ok ? { ok } : { ok: false, error: "Anfrage nicht gefunden." };
}
