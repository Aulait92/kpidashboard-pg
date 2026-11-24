import { audit } from "@/lib/audit";
import { checkLimit } from "@/lib/rate-limit";
import { uploadAuthorized } from "@/lib/ops-upload";
import { OPS_ACTOR } from "@/lib/ops-aktionen";

// Beleg von Hand zuordnen (Ole, 24.11.2026), damit Claude Fälle löst, die der automatische Abgleich offen lässt
// (lib/belege/zuordnen.ts). Schlüssel wie der Beleg-Upload (OPS_UPLOAD_TOKEN), IDs aus der Diagnose
// (GET /api/ops/diagnose?q=belege&anbieter=… bzw. &liste=offen / &liste=belege).
//   POST /api/ops/belege/zuordnen  { "belegId": "…", "umsatzIds": ["…", "…"] }   erste/größte Abbuchung + Teilzahlungen
//   POST /api/ops/belege/zuordnen  { "belegId": "…", "loesen": true }             Zuordnung lösen
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!uploadAuthorized(req)) return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  if (!checkLimit("opsAktion", "ops").ok) return Response.json({ error: "Zu viele Anfragen, bitte später." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { belegId?: unknown; umsatzIds?: unknown; loesen?: unknown } | null;
  const belegId = typeof body?.belegId === "string" ? body.belegId : "";
  if (!belegId) return Response.json({ error: "belegId fehlt." }, { status: 400 });
  const z = await import("@/lib/belege/zuordnen");
  if (body?.loesen === true) {
    const r = await z.belegZuordnungLoesen(belegId);
    if (r.ok) await audit("belege.zuordnung_geloest", { entity: "Beleg", entityId: belegId, actor: OPS_ACTOR });
    return Response.json(r, { status: r.ok ? 200 : 400 });
  }
  const fehler = z.zuordnungPruefen(body?.umsatzIds);
  if (fehler) return Response.json({ ok: false, error: fehler }, { status: 400 });
  const r = await z.belegVonHandZuordnen(belegId, body!.umsatzIds as string[]);
  if (r.ok) await audit("belege.zuordnung_hand", { entity: "Beleg", entityId: belegId, details: { umsatzIds: body!.umsatzIds, differenz: r.differenz }, actor: OPS_ACTOR });
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
