import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { badgeForUser } from "@/lib/native-push";

// App-Store-App: Push-Token des Geräts an- bzw. abmelden (nur eingeloggt).
// Ein Token gehört immer dem zuletzt angemeldeten Login (Gerätewechsel/Abmelden).

const TOKEN_RE = /^[A-Za-z0-9:_\-.]{20,4096}$/;

export async function POST(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { token?: unknown; platform?: unknown; appVersion?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const platform = body?.platform === "ios" || body?.platform === "android" ? body.platform : null;
  if (!TOKEN_RE.test(token) || !platform) return Response.json({ error: "Ungültige Angaben." }, { status: 400 });
  const appVersion = typeof body?.appVersion === "string" ? body.appVersion.slice(0, 40) : null;
  await prisma.deviceToken.upsert({
    where: { token },
    create: { token, platform, userId: session.userId, appVersion },
    update: { platform, userId: session.userId, appVersion, lastSeenAt: new Date() },
  });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (token) await prisma.deviceToken.deleteMany({ where: { token, userId: session.userId } });
  else await prisma.deviceToken.deleteMany({ where: { userId: session.userId } });
  return Response.json({ ok: true });
}

// Zähler am App-Symbol (beim Öffnen/Zurückkehren in die App abgefragt).
export async function GET(): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return Response.json({ badge: 0 });
  return Response.json({ badge: (await badgeForUser(session.userId)) ?? 0 });
}
