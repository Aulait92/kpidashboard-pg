// Liste der Unterauftragnehmer als PDF (Ole, 24.11.2026): Anlage 2 des Auftragsverarbeitungsvertrags aus derselben
// Quelle wie /rechtliches/avv und /sicherheit (lib/legal-texts.ts SUBPROCESSORS), mit der vorhandenen PDF-Erzeugung
// (lib/mail/text-pdf.ts, wie Erstinformation und Beratungsdokumentation). Verlinkt auf der Detailseite zum Hinweis
// „KI-Hilfe und gemeinsames Anzeigenlernen“ und in der Anlage 2 der AVV-Seite.

import { LEGAL_VERSION, PROVIDER, SUBPROCESSORS } from "@/lib/legal-texts";
import { textPdf, type PdfBlock } from "@/lib/mail/text-pdf";

export const UNTERAUFTRAGNEHMER_PDF_NAME = "Unterauftragnehmer-performancegrowth.pdf";

/** Inhalt des PDFs (rein, getestet): je Dienstleister Name, Zweck und Ort; Stand wie auf den Rechtsseiten. */
export function unterauftragnehmerInhalt(liste: { name: string; purpose: string; location: string }[] = SUBPROCESSORS): { titel: string; kopf: string[]; bloecke: PdfBlock[]; fuss: string } {
  return {
    titel: "Liste der Unterauftragnehmer",
    kopf: [
      "Anlage 2 zum Auftragsverarbeitungsvertrag nach Art. 28 DSGVO (Unterauftragsverarbeiter)",
      `${PROVIDER.name}, ${PROVIDER.street}, ${PROVIDER.city}`,
      `Stand ${LEGAL_VERSION}`,
    ],
    bloecke: liste.map((s) => ({ ueberschrift: s.name, text: `Zweck: ${s.purpose}\nOrt: ${s.location}` })),
    // Derselbe Satz wie unter der Liste auf /sicherheit
    fuss: "Bei Diensten mit Sitz in den USA stützt sich die Übermittlung auf das EU-US Data Privacy Framework oder die Standardvertragsklauseln der EU-Kommission, wie im Auftragsverarbeitungsvertrag beschrieben.",
  };
}

export async function unterauftragnehmerPdf(): Promise<Uint8Array> {
  return textPdf({ ...unterauftragnehmerInhalt(), autor: PROVIDER.brand });
}
