import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { logLeadHistory } from "@/lib/lead-history";
import { FILE_KIND_LABEL, isFileKind, pruefeLeadFileNach, wartetAufPruefung } from "@/lib/lead-files";
import { prisma } from "@/lib/prisma";
import { leadScope } from "@/lib/team";

// Dokument zum Lead ansehen (PDF/Bilder im Browser, sonst Download) oder löschen.
// Hochgeladene Police mit ausstehender Virenprüfung: erst prüfen (lib/lead-files.ts pruefeLeadFileNach), sonst Hinweis.
export const dynamic = "force-dynamic";

async function find(leadId: string, fileId: string) {
  const ctx = await getBuyerContext();
  if (!ctx) return null;
  const lead = await prisma.lead.findFirst({ where: { id: leadId, ...leadScope(ctx) }, select: { id: true } });
  if (!lead) return null;
  return prisma.leadFile.findFirst({ where: { id: fileId, leadId: lead.id } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }): Promise<Response> {
  const { id, fileId } = await params;
  const file = await find(id, fileId);
  if (!file) return new Response("Nicht gefunden.", { status: 404 });
  if (wartetAufPruefung(file)) {
    const r = await pruefeLeadFileNach(file);
    if (r !== "sauber") {
      const text = r === "befund" ? "Diese Datei wurde bei der Virenprüfung abgelehnt und gelöscht." : "Diese Datei wird noch auf Viren geprüft. Bitte versuchen Sie es in ein paar Minuten noch einmal.";
      return new Response(text, { status: r === "befund" ? 410 : 409, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
    }
  }
  const inline = file.contentType === "application/pdf" || file.contentType.startsWith("image/");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }): Promise<Response> {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host && origin !== process.env.APP_URL?.replace(/\/$/, "")) {
    return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  }
  const { id, fileId } = await params;
  const customerId = await writableCustomerId(id);
  if (!customerId) return Response.json({ error: "In der Vorschau nur mit Demo-Leads möglich." }, { status: 403 });
  const file = await find(id, fileId);
  if (!file) return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  await prisma.leadFile.delete({ where: { id: file.id } });
  await logLeadHistory(id, "dokument", `${FILE_KIND_LABEL[isFileKind(file.kind) ? file.kind : "sonstiges"]} gelöscht: ${file.fileName}`, { customerId });
  return Response.json({ ok: true });
}
