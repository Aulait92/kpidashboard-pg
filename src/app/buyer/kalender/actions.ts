"use server";

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";

/** Eigenen Kalender trennen (Tokens löschen). Künftige Termine gehen dann in den Agentur-Kalender. */
export async function disconnectOwnCalendarAction(): Promise<void> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || !ctx.userId) return;
  await prisma.advisorCalendar.deleteMany({ where: { userId: ctx.userId } });
  revalidatePath("/buyer/kalender");
}
