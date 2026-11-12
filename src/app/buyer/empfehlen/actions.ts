"use server";

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { closeReferralNudge } from "@/lib/kollegen";

/** Hinweis „Kollegen empfehlen“ schließen (weggeklickt oder Link geöffnet). Nur Inhaber, nicht in der Vorschau. */
export async function closeReferralNudgeAction(key: string): Promise<void> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || ctx.teamRole !== "owner") return;
  await closeReferralNudge(ctx.customerId, String(key).slice(0, 40));
  revalidatePath("/buyer");
}
