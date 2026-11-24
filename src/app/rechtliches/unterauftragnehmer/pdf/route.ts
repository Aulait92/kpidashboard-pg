import { UNTERAUFTRAGNEHMER_PDF_NAME, unterauftragnehmerPdf } from "@/lib/unterauftragnehmer-pdf";
import { reportError } from "@/lib/monitoring";

// Liste der Unterauftragnehmer (AVV Anlage 2) als PDF. Öffentlich wie /rechtliches/avv (keine personenbezogenen
// Daten); erzeugt aus lib/legal-texts.ts SUBPROCESSORS, also immer der aktuelle Stand.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const bytes = await unterauftragnehmerPdf();
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${UNTERAUFTRAGNEHMER_PDF_NAME}"`,
        "cache-control": "public, max-age=300",
        "x-robots-tag": "noindex",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    reportError(err, "unterauftragnehmer-pdf");
    return new Response("PDF konnte nicht erstellt werden.", { status: 500 });
  }
}
