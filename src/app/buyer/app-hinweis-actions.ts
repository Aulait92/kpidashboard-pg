"use server";

import { getBuyerContext } from "@/lib/buyer-context";
import { appHinweisWegklicken } from "@/lib/app-store-server";

/** Hinweiskarte „iPhone-App“ auf „Heute“ weggeklickt: dauerhaft für diesen Login (lib/app-store-server.ts). */
export async function appHinweisWegklickenAction(): Promise<void> {
  const ctx = await getBuyerContext();
  if (!ctx?.userId || ctx.preview || ctx.demo) return;
  await appHinweisWegklicken(ctx.userId);
}
