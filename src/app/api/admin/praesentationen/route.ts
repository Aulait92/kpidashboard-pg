import { getCurrentSession } from "@/lib/auth";
import { deletePresentation, isAudience, isFormat, MAX_BYTES, savePresentation } from "@/lib/vertrieb/praesentationen";

// Upload der Vertriebsunterlagen (PPTX kann größer sein als das Server-Action-Limit von 16 MB).
// Anmeldung wird vor dem Lesen des Inhalts geprüft.
export const dynamic = "force-dynamic";

/** Nur Admins, und nur von der eigenen Seite aus (kein Upload von fremden Seiten mit gültigem Login). */
async function admin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host && origin !== process.env.APP_URL?.replace(/\/$/, "")) return null;
  const s = await getCurrentSession();
  return s && s.role === "ADMIN" ? s : null;
}

export async function POST(req: Request): Promise<Response> {
  const session = await admin(req);
  if (!session) return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
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
  const res = await savePresentation({ audience, format, fileName, data, uploadedById: session.userId ?? null });
  return res.ok ? Response.json({ ok: true }) : Response.json({ error: res.error }, { status: 400 });
}

export async function DELETE(req: Request): Promise<Response> {
  if (!(await admin(req))) return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  const url = new URL(req.url);
  const audience = url.searchParams.get("audience");
  const format = url.searchParams.get("format");
  if (!isAudience(audience) || !isFormat(format)) return Response.json({ error: "Ungültige Auswahl." }, { status: 400 });
  await deletePresentation(audience, format);
  return Response.json({ ok: true });
}
