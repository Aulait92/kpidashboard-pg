"use server";

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";

/** Einführungsvideo angesehen oder weggeklickt: Karte auf „Heute“ nicht mehr zeigen. */
export async function markIntroSeenAction(): Promise<void> {
  const ctx = await getBuyerContext();
  if (!ctx?.userId || ctx.preview) return;
  await prisma.user.updateMany({ where: { id: ctx.userId, introVideoSeenAt: null }, data: { introVideoSeenAt: new Date() } });
  revalidatePath("/buyer");
}
