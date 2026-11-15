import { renderHtmlToPdf } from "@/lib/html-to-png";
import { reportError } from "@/lib/monitoring";
import { praesentationHtml } from "@/lib/praesentation";
import { loadKundenPraesentation } from "@/lib/termin-vorbereitung-server";

// Kundenlink als PDF (gleicher Stand wie die Seite).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const p = await loadKundenPraesentation(token);
  if (!p) return new Response("Dieser Link ist abgelaufen oder ungültig.", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  try {
    const pdf = await renderHtmlToPdf(praesentationHtml(p.folien.map((f) => ({ ...f, notizen: [] })), p.marke, `Ihre Beratung ${p.name}`));
    const name = `Beratung-${p.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "Kunde"}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (err) {
    reportError(err, "beratung-pdf");
    return new Response("PDF konnte nicht erstellt werden.", { status: 500 });
  }
}
