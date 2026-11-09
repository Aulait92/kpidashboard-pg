import { getOfferByToken } from "@/lib/offers";
import { renderUrlToPdf } from "@/lib/html-to-png";
import { reportError } from "@/lib/monitoring";

// PDF des Angebots: rendert die Druckansicht (?print=1) per Chromium.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const offer = await getOfferByToken(token);
  if (!offer) return new Response("Nicht gefunden", { status: 404 });
  const port = process.env.PORT ?? "3000";
  try {
    const pdf = await renderUrlToPdf(`http://127.0.0.1:${port}/angebot/${encodeURIComponent(token)}?print=1`);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="Angebot-${offer.number}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    reportError(err, "offer-pdf", { offer: offer.number });
    return new Response("PDF konnte nicht erstellt werden.", { status: 500 });
  }
}
