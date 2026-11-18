// Maklervollmacht als PDF (pdf-lib, Helvetica, A4): jeder Abschnitt auf eigener Seite, Unterschrift als Bild unter den
// Abschnitten mit unterschrift: true, Fußzeile mit Dokument-ID. Texte: lib/maklervollmacht/texte.ts.

import { createHash } from "node:crypto";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { pdfSicher, umbrechen } from "@/lib/mail/text-pdf";
import type { VvAbschnitt } from "@/lib/maklervollmacht/texte";

export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export async function vollmachtPdf(input: { titel: string; abschnitte: VvAbschnitt[]; signaturPng: Uint8Array | null; dokumentId: string; autor?: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const sig = input.signaturPng ? await doc.embedPng(input.signaturPng) : null;
  const [W, H] = [595.28, 841.89];
  const margin = 56;
  const width = W - 2 * margin;
  const dark = rgb(0.1, 0.12, 0.16);
  const grey = rgb(0.42, 0.45, 0.5);
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - margin;
  const neueSeite = () => {
    page = doc.addPage([W, H]);
    y = H - margin;
  };
  const need = (h: number) => {
    if (y - h < margin + 24) neueSeite();
  };
  const write = (text: string, f: PDFFont, size: number, color = dark, gap = 1.42) => {
    for (const line of umbrechen(pdfSicher(text), f, size, width)) {
      need(size * gap);
      if (line) page.drawText(line, { x: margin, y: y - size, size, font: f, color });
      y -= size * gap;
    }
  };

  input.abschnitte.forEach((ab, i) => {
    if (i > 0) neueSeite();
    write(ab.titel, bold, 16, dark, 1.3);
    y -= 8;
    for (const p of ab.absaetze) {
      write(p, font, 10.5);
      y -= 5;
    }
    if (ab.unterschrift && sig) {
      const w = 180;
      const h = Math.min(80, (sig.height / sig.width) * w);
      need(h + 30);
      y -= 6;
      page.drawImage(sig, { x: margin, y: y - h, width: w, height: h });
      y -= h + 2;
      page.drawLine({ start: { x: margin, y }, end: { x: margin + 220, y }, thickness: 0.6, color: grey });
      y -= 12;
      write("Unterschrift (elektronisch)", font, 8.5, grey);
    }
  });

  const total = doc.getPageCount();
  doc.getPages().forEach((p, i) => {
    const links = pdfSicher(`Dokument-ID ${input.dokumentId}`);
    const rechts = `Seite ${i + 1} von ${total}`;
    p.drawText(links, { x: margin, y: 28, size: 8, font, color: grey });
    p.drawText(rechts, { x: W - margin - font.widthOfTextAtSize(rechts, 8), y: 28, size: 8, font, color: grey });
  });
  doc.setTitle(pdfSicher(input.titel));
  if (input.autor) doc.setAuthor(pdfSicher(input.autor));
  // Feste Zeitstempel: gleiche Eingabe ergibt gleiche Bytes (Prüfsumme im Protokoll bleibt nachrechenbar)
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));
  return doc.save();
}
