// Schlichte Text-PDFs für E-Mail-Anhänge (Gesprächszusammenfassung, Musterkündigung), ohne Browser:
// pdf-lib mit Helvetica, A4, Zeilenumbruch nach Breite, Seitenumbruch bei Bedarf.

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

export type PdfBlock = { ueberschrift?: string; text: string };

// Zeichen, die Helvetica (WinAnsi) zusätzlich zu Latin-1 kann
const WIN_ANSI_EXTRA = new Set([..."€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"]);

/** Nicht darstellbare Zeichen (z. B. Emojis) ersetzen, statt am Font zu scheitern. */
export function pdfSicher(text: string): string {
  return [...text.replace(/\t/g, "    ").replace(/\r\n?/g, "\n")]
    .map((ch) => {
      const c = ch.codePointAt(0)!;
      if (ch === "\n") return ch;
      if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch)) return ch;
      return c < 0x20 ? "" : "?";
    })
    .join("");
}

/** Text in Zeilen umbrechen, die in `width` passen (lange Wörter werden hart getrennt). */
export function umbrechen(text: string, font: Pick<PDFFont, "widthOfTextAtSize">, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/ +/)) {
      const cand = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(cand, size) <= width) {
        line = cand;
        continue;
      }
      if (line) out.push(line);
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

export async function textPdf(input: { titel: string; kopf?: string[]; bloecke: PdfBlock[]; fuss?: string; autor?: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [W, H] = [595.28, 841.89];
  const margin = 56;
  const width = W - 2 * margin;
  const dark = rgb(0.1, 0.12, 0.16);
  const grey = rgb(0.42, 0.45, 0.5);
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - margin;
  const need = (h: number) => {
    if (y - h < margin + 20) {
      page = doc.addPage([W, H]);
      y = H - margin;
    }
  };
  const write = (text: string, f: PDFFont, size: number, color = dark, gap = 1.45) => {
    for (const line of umbrechen(pdfSicher(text), f, size, width)) {
      need(size * gap);
      if (line) page.drawText(line, { x: margin, y: y - size, size, font: f, color });
      y -= size * gap;
    }
  };

  write(input.titel, bold, 18, dark, 1.3);
  y -= 6;
  for (const k of input.kopf ?? []) write(k, font, 10, grey);
  y -= 10;
  for (const b of input.bloecke) {
    if (b.ueberschrift) {
      need(40);
      write(b.ueberschrift, bold, 12);
      y -= 2;
    }
    write(b.text.trim() || " ", font, 11);
    y -= 12;
  }
  if (input.fuss) {
    y -= 6;
    write(input.fuss, font, 9, grey);
  }
  const total = doc.getPageCount();
  if (total > 1) {
    doc.getPages().forEach((p, i) => {
      const label = `Seite ${i + 1} von ${total}`;
      p.drawText(label, { x: W - margin - font.widthOfTextAtSize(label, 8), y: 28, size: 8, font, color: grey });
    });
  }
  doc.setTitle(pdfSicher(input.titel));
  if (input.autor) doc.setAuthor(pdfSicher(input.autor));
  return doc.save();
}
