// Ziel nach der Anmeldung mit Rolle aus der Datenbank (Inhaber/Berater) und
// Admin-Vorschau. Regeln selbst: loginTarget in lib/login-karten.ts.
import { cookies } from "next/headers";
import type { SessionPayload } from "@/lib/auth";
import { VIEW_AS_COOKIE } from "@/lib/buyer-context";
import { loginTarget } from "@/lib/login-karten";
import { prisma } from "@/lib/prisma";

export async function loginTargetFor(p: Pick<SessionPayload, "userId" | "role">, next: unknown): Promise<string> {
  if (p.role === "BUYER") {
    const u = await prisma.user.findUnique({ where: { id: p.userId }, select: { teamRole: true } }).catch(() => null);
    // Unbekannt: vorsichtshalber wie ein Berater behandeln (Seiten nur für Inhaber nicht direkt öffnen)
    return loginTarget({ role: "BUYER", teamRole: u?.teamRole ?? "advisor" }, next);
  }
  const preview = !!(await cookies()).get(VIEW_AS_COOKIE)?.value;
  return loginTarget({ role: "ADMIN", preview }, next);
}
