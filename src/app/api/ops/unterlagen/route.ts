import { audit } from "@/lib/audit";
import { checkLimit } from "@/lib/rate-limit";
import { AUDIENCES, FORMATS, isAudience, isFormat, MAX_BYTES, savePresentation } from "@/lib/vertrieb/praesentationen";
import { prisma } from "@/lib/prisma";
import { uploadAuthorized } from "@/lib/ops-upload";

// Geschützter Upload der Vertriebsunterlagen (Ole, 15.11.2026), damit Claude neue Fassungen der
// Präsentationen ohne Admin-Login hochladen kann. Eng begrenzt: nur die Präsentationen unter
// Admin → Marketing → Unterlagen (je Zielgruppe und Format eine Datei), keine anderen Daten.
// Absicherung: eigener Schlüssel OPS_UPLOAD_TOKEN (≥ 32 Zeichen) im Header X-Ops-Upload-Token,
// getrennt vom Lese-Schlüssel der Diagnose-API. Ohne gesetzten Schlüssel ist die Route aus.
//   GET  /api/ops/unterlagen                                → Übersicht (Dateiname, Größe, Datum, keine Inhalte)
//   POST /api/ops/unterlagen?audience=vertreter|makler&format=pdf|pptx  (Body = Datei, Header X-File-Name)
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!uploadAuthorized(req)) return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  const rows = await prisma.salesPresentation.findMany({ select: { audience: true, format: true, fileName: true, size: true, uploadedAt: true } });
  const slots = AUDIENCES.flatMap((audience) =>
    FORMATS.map((format) => {
      const r = rows.find((x) => x.audience === audience && x.format === format);
      return { audience, format, fileName: r?.fileName ?? null, size: r?.size ?? null, uploadedAt: r?.uploadedAt ?? null };
    }),
  );
  return Response.json({ slots }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
  if (!uploadAuthorized(req)) return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  if (!checkLimit("opsUpload", "ops").ok) return Response.json({ error: "Zu viele Uploads, bitte später." }, { status: 429 });
  const url = new URL(req.url);
  const audience = url.searchParams.get("audience");
  const format = url.searchParams.get("format");
  if (!isAudience(audience) || !isFormat(format)) return Response.json({ error: "Ungültige Auswahl." }, { status: 400 });
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES[format] + 1024 * 1024) {
    return Response.json({ error: `Die Datei ist zu groß (höchstens ${Math.round(MAX_BYTES[format] / 1024 / 1024)} MB).` }, { status: 413 });
  }
  const fileName = decodeURIComponent(req.headers.get("x-file-name") ?? `praesentation.${format}`);
  const data = new Uint8Array(await req.arrayBuffer());
  const res = await savePresentation({ audience, format, fileName, data, uploadedById: null });
  if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
  await audit("presentation.upload", {
    entity: "SalesPresentation",
    entityId: `${audience}:${format}`,
    details: { fileName, size: data.length, via: "ops-upload" },
    actor: { role: "system", email: "ops-upload" },
  });
  return Response.json({ ok: true, audience, format, fileName, size: data.length });
}
