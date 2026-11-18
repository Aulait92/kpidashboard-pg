// Datenminimierung (Rechtsprüfung, Art. 5 Abs. 1 lit. c): an die KI gehen höchstens die ersten Seiten einer PDF
// (Versicherungsschein, Beitragsseite). Lokal mit pdf-lib, nichts gespeichert. Mit Rechteschutz verschlüsselte PDFs
// (häufig bei Versicherern) lassen sich nicht kürzen: dann geht die Datei unverändert. Nicht lesbar: null.

import { PDFDocument } from "pdf-lib";

export const MAX_SEITEN = 4;

export async function ersteSeiten(data: Uint8Array, max = MAX_SEITEN): Promise<Uint8Array | null> {
  try {
    const src = await PDFDocument.load(data, { updateMetadata: false, ignoreEncryption: true });
    const n = src.getPageCount();
    if (n <= max || src.isEncrypted) return data;
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, Array.from({ length: max }, (_, i) => i));
    for (const p of pages) out.addPage(p);
    return await out.save();
  } catch {
    return null;
  }
}
