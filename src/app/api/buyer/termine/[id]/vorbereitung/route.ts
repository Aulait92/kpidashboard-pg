import { getBuyerContext } from "@/lib/buyer-context";
import { renderHtmlToPdf } from "@/lib/html-to-png";
import { reportError } from "@/lib/monitoring";
import { vorbereitungHtml } from "@/lib/termin-vorbereitung";
import { loadVorbereitung } from "@/lib/termin-vorbereitung-server";

// Terminvorbereitung als PDF im PG-Design (Chromium aus HTML), nur für Termine im eigenen Sichtbereich.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getBuyerContext();
  if (!ctx) return new Response("Nicht gefunden.", { status: 404 });
  const { id } = await params;
  const d = await loadVorbereitung(id, ctx);
  if (!d) return new Response("Nicht gefunden.", { status: 404 });
  try {
    const pdf = await renderHtmlToPdf(vorbereitungHtml(d));
    const name = `Terminvorbereitung-${d.lead.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "Kontakt"}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    reportError(err, "termin-vorbereitung-pdf", { appointment: id });
    return new Response("PDF konnte nicht erstellt werden.", { status: 500 });
  }
}
