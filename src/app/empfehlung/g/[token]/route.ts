import { googleRedirect } from "@/lib/empfehlung/requests";
import { clientIp, limitResponse } from "@/lib/rate-limit";

// Google-Bewertungslink aus der Nachfrage: Klick zählen, dann zum Google-Profil.
// Alle Angeschriebenen bekommen denselben Link (kein Gating).
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = limitResponse("publicApi", `google:${clientIp(req.headers)}`);
  if (limited) return limited;
  const { token } = await params;
  const url = /^[\w-]{10,64}$/.test(token) ? await googleRedirect(token).catch(() => null) : null;
  if (!url) return new Response("Dieser Link ist nicht (mehr) gültig.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return Response.redirect(url, 302);
}
