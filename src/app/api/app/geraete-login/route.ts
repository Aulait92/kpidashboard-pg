import { getCurrentSession } from "@/lib/auth";
import { beendeGeraeteLogin, gibGeraeteLogin } from "@/lib/app-geraete-login";
import { istAppUserAgent } from "@/lib/app-store";
import { hit } from "@/lib/rate-limit";

// Face-ID-Anmeldung der App (lib/app-geraete-login.ts).
// POST: angemeldet und in der App → neuen Geräte-Schlüssel ausgeben (die App legt ihn hinter Face ID ab).
// DELETE: angemeldet → Face-ID-Anmeldung dieses Geräts beenden (Abmelden, in den Einstellungen ausgeschaltet).

const LIMIT = { limit: 20, windowMs: 60 * 60_000 };

export async function POST(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  if (!istAppUserAgent(req.headers.get("user-agent"))) return Response.json({ error: "Nur in der App." }, { status: 403 });
  if (!hit("geraeteLoginGeben", session.userId, LIMIT).ok) return Response.json({ error: "Zu viele Anfragen." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { platform?: unknown } | null;
  const platform = body?.platform === "ios" || body?.platform === "android" ? body.platform : null;
  const g = await gibGeraeteLogin(session.userId, session.sv ?? 0, platform);
  return Response.json({ id: g.id, token: g.token }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (id) await beendeGeraeteLogin(session.userId, id);
  return Response.json({ ok: true });
}
