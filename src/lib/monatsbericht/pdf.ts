// Monatsbericht als PDF zum Herunterladen (Kundenbereich → Zahlen → Monatsberichte).
// Gleiche Abschnitte wie die E-Mail (reportSectionBlocks), schlichtes Text-PDF.

import { textPdf, type PdfBlock } from "@/lib/mail/text-pdf";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import { PROVIDER } from "@/lib/legal-texts";
import { reportSectionBlocks } from "./bericht";
import { fmtValue, monthLabel } from "./shared";
import type { ReportBody } from "./server";

export const berichtPdfName = (month: string) => `monatsbericht-${month}.pdf`;

export function berichtPdfBlocks(body: ReportBody, appUrl: string): PdfBlock[] {
  const blocks: PdfBlock[] = [];
  if (body.paragraphs.length) blocks.push({ text: body.paragraphs.join("\n\n") });
  if (body.version === 2 && body.model) {
    for (const b of reportSectionBlocks(body.model, appUrl)) blocks.push({ ueberschrift: b.title, text: b.lines.join("\n") });
  } else {
    if (body.facts?.length) {
      blocks.push({
        ueberschrift: "Ihre Zahlen",
        text: body.facts.map((f) => `${f.label}: ${fmtValue(f)}${f.previous != null ? ` (Vormonat ${fmtValue({ value: f.previous, unit: f.unit })})` : ""}`).join("\n"),
      });
    }
    if (body.tips.length) blocks.push({ ueberschrift: "Tipps", text: body.tips.map((t) => `• ${t}`).join("\n") });
  }
  return blocks.map((b) => ({ ...b, text: ohneGedankenstriche(b.text) }));
}

export async function berichtPdf(r: { month: string; body: unknown; sentAt: Date | null }, o: { customerName: string; appUrl: string }): Promise<Uint8Array> {
  const body = r.body as ReportBody;
  const kopf = [o.customerName, r.sentAt ? `Gesendet am ${r.sentAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}` : ""].filter(Boolean);
  return textPdf({
    titel: `Monatsbericht ${monthLabel(r.month)}`,
    kopf,
    bloecke: berichtPdfBlocks(body, o.appUrl),
    fuss: `${PROVIDER.brand} · Alle Zahlen jederzeit in der App: ${o.appUrl}/buyer/zahlen`,
    autor: PROVIDER.brand,
  });
}
