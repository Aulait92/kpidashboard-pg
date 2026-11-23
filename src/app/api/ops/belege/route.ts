import { audit } from "@/lib/audit";
import { checkLimit } from "@/lib/rate-limit";
import { uploadAuthorized } from "@/lib/ops-upload";
import { OPS_ACTOR } from "@/lib/ops-aktionen";

// Beleg hochladen (Ole, 22.11.2026: eigene Ablage statt GetMyInvoices), damit Claude Originalbelege (PDF, Bild, ZIP) ohne
// Admin-Login ablegen kann. Nur anlegen, nie lesen oder löschen. Schlüssel wie /api/ops/unterlagen (lib/ops-upload.ts).
//   POST /api/ops/belege   Body = Datei, Header X-File-Name
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  if (!uploadAuthorized(req)) return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  if (!checkLimit("opsUpload", "ops").ok) return Response.json({ error: "Zu viele Uploads, bitte später." }, { status: 429 });
  const name = decodeURIComponent(req.headers.get("x-file-name") ?? "beleg").slice(0, 200);
  const daten = new Uint8Array(await req.arrayBuffer());
  if (!daten.length) return Response.json({ error: "Leere Datei." }, { status: 400 });
  const { belegAblegen, zaehle } = await import("@/lib/belege/ablage");
  const e = await belegAblegen({ daten, name, quelle: "upload", absender: "ops (Claude)" });
  const { belegeAbgleichen } = await import("@/lib/belege/server");
  const zugeordnet = e.some((x) => x.ergebnis === "neu") ? await belegeAbgleichen().catch(() => 0) : 0;
  await audit("belege.upload", { details: { name, ...zaehle(e), zugeordnet }, actor: OPS_ACTOR });
  return Response.json({ ok: true, ...zaehle(e), zugeordnet, belege: e.map((x) => ({ name: x.name, ergebnis: x.ergebnis, firma: x.daten?.firma ?? null, datum: x.daten?.datum ?? null, brutto: x.daten?.brutto ?? null, waehrung: x.daten?.waehrung ?? null })) });
}
