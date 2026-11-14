import { getCurrentSession } from "@/lib/auth";
import { publicOrigin } from "@/lib/calendar/oauth-routes";
import { linkedInAuthUrl, linkedInAvailable } from "@/lib/linkedin/api";

// LinkedIn verbinden (nur Admin): weiter zur LinkedIn-Anmeldung, Rücksprung /api/linkedin/callback.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  const origin = publicOrigin(req);
  if (!session || session.role !== "ADMIN") return Response.redirect(new URL("/login", origin), 302);
  if (!linkedInAvailable()) return Response.redirect(new URL("/admin/marketing/linkedin?li=config", origin), 302);
  return Response.redirect(linkedInAuthUrl(session.userId, origin), 302);
}
