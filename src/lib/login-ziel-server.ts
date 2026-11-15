// Ziel nach der Anmeldung mit Rolle aus der Datenbank (Inhaber/Berater) und
// Admin-Vorschau. Regeln selbst: loginTarget in lib/login-karten.ts.
import { cookies } from "next/headers";
import type { SessionPayload } from "@/lib/auth";
import { VIEW_AS_COOKIE } from "@/lib/buyer-context";
import { loginTarget } from "@/lib/login-karten";
import { prisma } from "@/lib/prisma";

export async function loginTargetFor(p: Pick<SessionPayload, "userId" | "role">, next: unknown): Promise<string> {
  if (p.role === "BUYER") {
    const u = await prisma.user.findUnique({ where: { id: p.userId }, select: { teamRole: true, customer: { select: { dormantSince: true } } } }).catch(() => null);
    // Ruhendes Konto (lib/ruhend.ts): nur Export und die Seite für ruhende Konten
    if (u?.customer?.dormantSince) return dormantTarget(next);
    // Unbekannt: vorsichtshalber wie ein Berater behandeln (Seiten nur für Inhaber nicht direkt öffnen)
    return loginTarget({ role: "BUYER", teamRole: u?.teamRole ?? "advisor" }, next);
  }
  const preview = !!(await cookies()).get(VIEW_AS_COOKIE)?.value;
  return loginTarget({ role: "ADMIN", preview }, next);
}

/** Ziel für Logins ruhender Konten: Export-Link aus der Erinnerungsmail bleibt, sonst /buyer/ruhend. */
export function dormantTarget(next: unknown): string {
  const path = typeof next === "string" ? next : "";
  if (path === "/buyer/konto/export" || /^\/buyer\/ruhend(?=$|[?#])/.test(path)) return path;
  return "/buyer/ruhend";
}
