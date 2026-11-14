// Gewinn-Schalter auf /buyer/zahlen (Ole, 14.11.2026): „Nur jetzt“ oder „Inkl. Bestand“, gespeichert je
// Login (User.gewinnMitBestand). In der Admin-Vorschau (ohne eigenen Login) per Cookie.

import { cookies } from "next/headers";
import type { BuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";

/** Cookie für die Wahl in der Admin-Vorschau. */
export const GEWINN_MODUS_COOKIE = "kpi_gewinn_bestand";

/** true = „Inkl. Bestand“. */
export async function loadGewinnMitBestand(ctx: Pick<BuyerContext, "userId"> | null): Promise<boolean> {
  if (ctx?.userId) {
    const u = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { gewinnMitBestand: true } }).catch(() => null);
    return !!u?.gewinnMitBestand;
  }
  return (await cookies()).get(GEWINN_MODUS_COOKIE)?.value === "1";
}
