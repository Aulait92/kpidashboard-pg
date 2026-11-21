import { checkLimit } from "@/lib/rate-limit";
import { AKTIONEN, aktionAuthorized, fuehreAktionAus } from "@/lib/ops-aktionen";

// Schreib-Schnittstelle für Claude (Ole, 21.11.2026), siehe lib/ops-aktionen.ts.
//   GET  /api/ops/aktion                         → erlaubte Aktionen mit Feldern
//   POST /api/ops/aktion  { "aktion": "...", ...Felder }  → Ergebnis
// Schlüssel OPS_ACTION_TOKEN (Bearer, X-Ops-Token); ohne gesetzten Schlüssel ist die Schnittstelle aus.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!aktionAuthorized(req)) return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  return Response.json({ aktionen: Object.fromEntries(Object.entries(AKTIONEN).map(([k, a]) => [k, { beschreibung: a.beschreibung, felder: a.felder }])) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
  if (!aktionAuthorized(req)) return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  if (!checkLimit("opsAktion", "ops").ok) return Response.json({ error: "Zu viele Aktionen, bitte später." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.aktion !== "string") return Response.json({ error: "JSON mit „aktion“ erwartet." }, { status: 400 });
  const { aktion, ...params } = body;
  const r = await fuehreAktionAus(aktion, params);
  return Response.json(r, { status: r.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
}
