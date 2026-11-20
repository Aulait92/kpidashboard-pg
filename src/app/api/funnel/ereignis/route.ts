import type { NextRequest } from "next/server";
import { clientIp, limitResponse } from "@/lib/rate-limit";
import { BESUCH_COOKIE, gueltigeBesuchId } from "@/lib/funnel/host";
import { ereignisMerken } from "@/lib/funnel/server";

// Messung je Schritt der eigenen Funnels (lib/funnel): angesehen, beantwortet, Abbruch mit Grund. Öffentlich, ohne
// Personendaten (nur Besucher-ID aus dem Erstanbieter-Cookie, Schritt, Art, ggf. Herkunft aus der URL).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limited = limitResponse("funnelEreignis", clientIp(req.headers));
  if (limited) return limited;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const besuchId = gueltigeBesuchId(req.cookies.get(BESUCH_COOKIE)?.value) ?? gueltigeBesuchId(typeof body.besuch === "string" ? body.besuch : null);
  if (!besuchId) return Response.json({ ok: false }, { status: 400 });
  const r = await ereignisMerken({
    funnel: String(body.funnel ?? ""),
    besuchId,
    schritt: String(body.schritt ?? ""),
    art: String(body.art ?? ""),
    grund: typeof body.grund === "string" ? body.grund : null,
    quelle: body.quelle,
  });
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
