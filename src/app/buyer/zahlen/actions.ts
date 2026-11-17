"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { Prisma } from "@/generated/prisma/client";
import { getBuyerContext } from "@/lib/buyer-context";
import { GEWINN_MODUS_COOKIE } from "@/lib/gewinn-modus";
import { prisma } from "@/lib/prisma";
import { withDismissed, type TipKey } from "@/lib/zahlen-tipps";

const KEYS: readonly TipKey[] = [
  "empfehlung_an",
  "empfehlung_fragen",
  "kollegen",
  "bestand",
  "cross_sell",
  "erreichbarkeit",
  "terminquote",
  "abschlussquote",
  "beitrag",
  "naechster_schritt",
  "meta_lernen",
  "kein_whatsapp",
];

/** Hebel bzw. Tipp („Ihre 3 Hebel diese Woche“) für 30 Tage wegklicken (nur Inhaber, nicht in der Vorschau). */
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
  revalidatePath("/buyer/wachstum");
  return { ok: true };
}

/** Wachstum „Rechnet sich das?“: „Nur Abschlussprovision“ (false) oder „Inkl. Bestand (5 Jahre)“ (true), gespeichert je Login. */
export async function setGewinnModusAction(mitBestand: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  if (ctx.userId) {
    await prisma.user.update({ where: { id: ctx.userId }, data: { gewinnMitBestand: !!mitBestand } });
  } else {
    (await cookies()).set(GEWINN_MODUS_COOKIE, mitBestand ? "1" : "0", { path: "/buyer", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  }
  revalidatePath("/buyer/zahlen");
  revalidatePath("/buyer/wachstum");
  return { ok: true };
}
