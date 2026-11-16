import { getCurrentSession } from "@/lib/auth";
import { publicOrigin } from "@/lib/calendar/oauth-routes";
import { linkedInAuthUrl, linkedInAvailable } from "@/lib/linkedin/api";
import { neuPfadAusReferer, neuRuecksprungCookie } from "@/lib/admin-neu/ruecksprung";

// LinkedIn verbinden (nur Admin): weiter zur LinkedIn-Anmeldung, Rücksprung /api/linkedin/callback.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  const origin = publicOrigin(req);
  if (!session || session.role !== "ADMIN") return Response.redirect(new URL("/login", origin), 302);
  // Aus dem neuen Admin (Marketing, Einstellungen → Anbindungen): Rücksprung dorthin (lib/admin-neu/ruecksprung.ts)
  const neu = neuPfadAusReferer(req.headers.get("referer"));
  if (!linkedInAvailable()) return Response.redirect(new URL(`${neu ?? "/admin/marketing/linkedin"}?li=config`, origin), 302);
  return new Response(null, { status: 302, headers: [["Location", linkedInAuthUrl(session.userId, origin)], ["Set-Cookie", neuRuecksprungCookie(neu)]] });
}
