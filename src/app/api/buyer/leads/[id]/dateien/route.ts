import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { isFileKind, MAX_FILE_BYTES, saveLeadFile } from "@/lib/lead-files";
import { prisma } from "@/lib/prisma";
import { leadScope } from "@/lib/team";

// Dokument zum Lead hochladen (Angebot, Police, Sonstiges). Rohdaten im Body, Name im Kopf „x-file-name“.
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host && origin !== process.env.APP_URL?.replace(/\/$/, "")) {
    return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  }
  const { id } = await params;
  const ctx = await getBuyerContext();
  if (!ctx) return Response.json({ error: "Bitte neu anmelden." }, { status: 401 });
  const customerId = await writableCustomerId(id);
  if (!customerId) return Response.json({ error: "In der Vorschau nur mit Demo-Leads möglich." }, { status: 403 });
  const lead = await prisma.lead.findFirst({ where: { id, ...leadScope(ctx) }, select: { id: true, erasedAt: true } });
  if (!lead || lead.erasedAt) return Response.json({ error: "Lead nicht gefunden." }, { status: 404 });
  const kind = new URL(req.url).searchParams.get("kind");
  if (!isFileKind(kind)) return Response.json({ error: "Ungültige Art." }, { status: 400 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_FILE_BYTES + 1024 * 1024) {
    return Response.json({ error: "Die Datei ist zu groß (höchstens 15 MB)." }, { status: 413 });
  }
  const fileName = decodeURIComponent(req.headers.get("x-file-name") ?? "dokument.pdf");
  const data = new Uint8Array(await req.arrayBuffer());
  const res = await saveLeadFile({ leadId: lead.id, customerId, kind, fileName, data, userId: ctx.userId });
  return res.ok ? Response.json({ ok: true }) : Response.json({ error: res.error }, { status: 400 });
}
