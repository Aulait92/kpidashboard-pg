"use server";

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { spaeterAvv, stimmeAvvZu } from "@/lib/policen/freischaltung";

// Karte „Policen aus Kranken, BU und Leben freischalten“ (lib/policen/freischaltung.ts), nur Inhaber.
export async function policenAvvZustimmenAction(): Promise<{ ok: boolean }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false };
  const ok = await stimmeAvvZu(ctx);
  revalidatePath("/buyer", "layout");
  return { ok };
}

export async function policenAvvSpaeterAction(): Promise<{ ok: boolean }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false };
  const ok = await spaeterAvv(ctx);
  revalidatePath("/buyer", "layout");
  return { ok };
}
