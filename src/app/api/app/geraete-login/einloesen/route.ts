import { sessionPayloadFor, setSessionCookie } from "@/lib/auth";
import { loeseGeraeteLoginEin } from "@/lib/app-geraete-login";
import { loginTargetFor } from "@/lib/login-ziel-server";
import { clientIp, hit } from "@/lib/rate-limit";

// Face-ID-Anmeldung der App beim Öffnen (lib/app-geraete-login.ts): Die App hat den Geräte-Schlüssel nach Face ID aus
// dem Schlüsselbund geholt. Einlösen → Sitzungs-Cookie setzen und einen neuen Schlüssel zurückgeben, den die App
// wieder ablegt. Ohne Sitzung erreichbar (middleware.ts, PUBLIC_PREFIXES). Nichts protokollieren, was den Schlüssel verrät.

const LIMIT = { limit: 30, windowMs: 15 * 60_000 };

export async function POST(req: Request): Promise<Response> {
  if (!hit("geraeteLoginEinloesen", clientIp(req.headers), LIMIT).ok) {
    return Response.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { token?: unknown; next?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const got = await loeseGeraeteLoginEin(token);
  if (!got) return Response.json({ error: "Bitte neu anmelden." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const payload = sessionPayloadFor(got.user);
  await setSessionCookie(payload);
  const { audit } = await import("@/lib/audit");
  await audit("login", {
    entity: "User",
    entityId: got.user.id,
    customerId: got.user.customerId,
    actor: { id: got.user.id, email: got.user.email, role: got.user.role },
    details: { method: "app-face-id" },
  });
  const ziel = await loginTargetFor(payload, typeof body?.next === "string" ? body.next : null);
  return Response.json({ id: got.neu.id, token: got.neu.token, ziel }, { headers: { "Cache-Control": "no-store" } });
}
