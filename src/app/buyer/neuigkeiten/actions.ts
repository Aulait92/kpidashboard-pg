"use server";

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { markUpdatesSeen } from "@/lib/neuigkeiten";

/** Hinweis „Neu: …“ in Heute weggeklickt: alles gilt als gelesen (nicht in der Admin-Vorschau). */
export async function dismissUpdatesAction(): Promise<void> {
  const ctx = await getBuyerContext();
  if (!ctx?.userId || ctx.preview) return;
  await markUpdatesSeen(ctx.userId);
  revalidatePath("/buyer", "layout");
}
