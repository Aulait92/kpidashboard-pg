// Neue Admin-Oberfläche (Admin-A) – pro Admin-Benutzer schaltbar (User.adminNewUi).
// Pro Anfrage gecacht, damit Kopfzeile und Seiten nur einmal nachfragen.

import { cache } from "react";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const isAdminNewUi = cache(async (): Promise<boolean> => {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") return false;
  const u = await prisma.user.findUnique({ where: { id: s.userId }, select: { adminNewUi: true } }).catch(() => null);
  return !!u?.adminNewUi;
});

/** Startseite nach dem Login bzw. beim Umschalten. */
export function adminHome(newUi: boolean): string {
  return newUi ? "/admin/heute" : "/";
}
