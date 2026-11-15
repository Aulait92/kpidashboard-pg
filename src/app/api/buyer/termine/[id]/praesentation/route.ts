import { getBuyerContext } from "@/lib/buyer-context";
import { renderHtmlToPdf } from "@/lib/html-to-png";
import { reportError } from "@/lib/monitoring";
import { praesentationHtml } from "@/lib/praesentation";
import { loadPraesentation } from "@/lib/termin-vorbereitung-server";

// Präsentation als PDF (Querformat, eine Folie je Seite), z. B. zum Nachschicken an den Kunden.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getBuyerContext();
  if (!ctx) return new Response("Nicht gefunden.", { status: 404 });
  const { id } = await params;
  const p = await loadPraesentation(id, ctx);
  if (!p) return new Response("Nicht gefunden.", { status: 404 });
  try {
    const pdf = await renderHtmlToPdf(praesentationHtml(p.folien, p.marke, `Ihre Beratung ${p.d.lead.name}`));
    const name = `Beratung-${p.d.lead.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "Kunde"}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    reportError(err, "praesentation-pdf", { appointment: id });
    return new Response("PDF konnte nicht erstellt werden.", { status: 500 });
  }
}
