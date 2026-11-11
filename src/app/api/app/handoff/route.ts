import { redirect } from "next/navigation";
import { getCurrentSession, sessionPayloadFor, setSessionCookie } from "@/lib/auth";
import { createHandoff, redeemHandoff, safeNext } from "@/lib/app-handoff";
import { publicOrigin } from "@/lib/calendar/oauth-routes";
import { prisma } from "@/lib/prisma";

// POST (in der App, angemeldet): Einmal-Link für den System-Browser erzeugen.
export async function POST(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { next?: unknown } | null;
  const next = safeNext(typeof body?.next === "string" ? body.next : null);
  const token = await createHandoff(session.userId, next);
  const url = new URL("/api/app/handoff", publicOrigin(req));
  url.searchParams.set("t", token);
  return Response.json({ url: url.toString() });
}

// GET (im System-Browser): Link einlösen, anmelden, weiterleiten.
export async function GET(req: Request): Promise<never> {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const hit = await redeemHandoff(t);
  if (!hit) redirect("/login?fehler=abgelaufen");
  const user = await prisma.user.findUnique({ where: { id: hit.userId }, select: { id: true, email: true, role: true, customerId: true, sessionVersion: true } });
  if (!user) redirect("/login");
  const payload = sessionPayloadFor(user);
  // Cookie über next/headers setzen; redirect() übernimmt es in die Antwort (wie beim SSO-Login).
  await setSessionCookie(payload);
  redirect(hit.next);
}
