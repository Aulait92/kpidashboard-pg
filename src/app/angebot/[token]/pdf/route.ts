import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { getOfferByToken } from "@/lib/offers";
import { renderUrlToPdf } from "@/lib/html-to-png";
import { reportError } from "@/lib/monitoring";
import { PROVIDER_FOOTER } from "@/components/offer-document";

// PDF des Angebots: Deckblatt (randlos) und Inhalt (mit Rändern) werden
// getrennt per Chromium gerendert, zusammengefügt und mit einer Fußzeile
// „Seite X von Y“ versehen.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const offer = await getOfferByToken(token);
  if (!offer) return new Response("Nicht gefunden", { status: 404 });
  const base = `http://127.0.0.1:${process.env.PORT ?? "3000"}/angebot/${encodeURIComponent(token)}`;
  try {
    const [cover, body] = await Promise.all([
      renderUrlToPdf(`${base}?print=cover`),
      renderUrlToPdf(`${base}?print=body`),
    ]);
    const out = await PDFDocument.create();
    for (const src of [cover, body]) {
      const doc = await PDFDocument.load(src);
      const pages = await out.copyPages(doc, doc.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    }
    // Fußzeile auf allen Seiten außer dem Deckblatt (Helvetica kann die
    // deutschen Umlaute und „·“ darstellen).
    const font = await out.embedFont(StandardFonts.Helvetica);
    const total = out.getPageCount();
    const grey = rgb(0.61, 0.64, 0.69);
    out.getPages().forEach((page, i) => {
      if (i === 0) return;
      const { width } = page.getSize();
      const margin = 51; // ≈ 18 mm
      page.drawText(PROVIDER_FOOTER, { x: margin, y: 28, size: 7.5, font, color: grey });
      const label = `Seite ${i + 1} von ${total}`;
      page.drawText(label, { x: width - margin - font.widthOfTextAtSize(label, 7.5), y: 28, size: 7.5, font, color: grey });
    });
    out.setTitle(`Angebot ${offer.number}`);
    out.setAuthor("performancegrowth");
    const bytes = await out.save();
    return new Response(new Uint8Array(bytes), {
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
