"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { withDismissed, type TipKey } from "@/lib/zahlen-tipps";

const KEYS: readonly TipKey[] = ["empfehlung_an", "empfehlung_fragen", "kollegen", "bestand", "cross_sell", "erreichbarkeit", "terminquote", "abschlussquote", "beitrag"];

/** Tipp der Karte „So holen Sie mehr raus“ für 30 Tage wegklicken (nur Inhaber, nicht in der Vorschau). */
export async function dismissTipAction(key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  if (ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  if (ctx.teamRole !== "owner") return { ok: false, error: "Nur der Inhaber." };
  if (!KEYS.includes(key as TipKey)) return { ok: false, error: "Unbekannter Tipp." };
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { zahlenTipsDismissed: true } });
  const next = withDismissed(c?.zahlenTipsDismissed, key);
  await prisma.customer.update({ where: { id: ctx.customerId }, data: { zahlenTipsDismissed: next as Prisma.InputJsonValue } });
  revalidatePath("/buyer/zahlen");
  return { ok: true };
}
