// Export der Investoren-Kennzahlen (Geld › Auswertung, Plan K4): CSV (Semikolon, deutsche Zahlen, UTF-8 mit BOM,
// Excel-tauglich) und PDF (pdf-lib, A4, ohne Browser). Gleiche Inhalte wie die Seite (darstellung.ts).

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { pdfSicher, umbrechen } from "@/lib/mail/text-pdf";
import { bindungZeilen, DEFINITIONEN, eur, kacheln, monat, pct, signed, standText } from "@/lib/investoren/darstellung";
import { MIN_KOHORTE } from "@/lib/investoren/kennzahlen";
import type { InvestorenDaten } from "@/lib/investoren/server";

type Tabelle = { titel: string; kopf: string[]; zeilen: string[][]; hinweis?: string };

/** Alle Tabellen der Auswertung in Anzeigeform (für CSV und PDF). */
export function tabellen(d: InvestorenDaten): Tabelle[] {
  const k = d.k;
  const out: Tabelle[] = [];
  out.push({
    titel: "Kennzahlen",
    kopf: ["Kennzahl", "Wert", "Hinweis"],
    zeilen: kacheln(d).flatMap((x) => [[x.label, x.wert, x.hinweis], ...x.zeilen.map((z) => [`  ${z.label}`, z.wert, ""])]),
  });
  out.push({
    titel: `Bindung bis ${monat(k.lastComplete)}`,
    kopf: ["Zeitraum", "Basis", "Kunden gehalten", "NRR (netto)", "GRR (brutto)"],
    zeilen: bindungZeilen(k).map((b) => [b.zeitraum, b.basis, b.kunden, b.nrr, b.grr]),
  });
  out.push({
    titel: "MRR-Bewegung",
    kopf: ["Monat", "Neu", "Ausbau", "Reaktiviert", "Weniger", "Gekündigt", "MRR Ende"],
    zeilen: k.bewegung.map((b) => [monat(b.to), signed(b.neu), signed(b.ausbau), signed(b.reaktiviert), signed(b.verkleinert), signed(b.gekuendigt), eur(b.end)]),
    hinweis: k.bewegung.length ? undefined : "Braucht zwei abgeschlossene Monate mit Umsatz.",
  });
  const maxAlter = Math.max(0, ...k.kohorten.gezeigt.map((c) => c.values.length));
  out.push({
    titel: "Kohorten (Umsatz in % des Startmonats)",
    kopf: ["Start", "Kunden", ...Array.from({ length: Math.min(maxAlter, 7) }, (_, i) => `M${i}`)],
    zeilen: k.kohorten.gezeigt.map((c) => [monat(c.start), String(c.customers), ...c.values.slice(0, 7).map((v) => (v == null ? "" : `${v} %`))]),
    hinweis: k.kohorten.gezeigt.length
      ? k.kohorten.ausgeblendet
        ? `${k.kohorten.ausgeblendet} Startmonate mit weniger als ${MIN_KOHORTE} Kunden nicht gezeigt.`
        : undefined
      : `Ab ${MIN_KOHORTE} Kunden je Startmonat.${k.kohorten.groesste ? ` Bisher größter: ${monat(k.kohorten.groesste.start)} mit ${k.kohorten.groesste.kunden}.` : ""}`,
  });
  out.push({
    titel: "Bruttomarge je Monat",
    kopf: ["Monat", "Umsatz", "Direkte Kosten", "davon KI", "Marge"],
    zeilen: k.marge.monate.slice(-6).map((m) => [monat(m.month), eur(m.umsatz), eur(m.direkt), eur(m.ki), pct(m.marge)]),
    hinweis: k.marge.monate.length ? undefined : "Noch kein abgeschlossener Monat mit Umsatz.",
  });
  if (k.stroeme) {
    const s = k.stroeme;
    out.push({
      titel: `Abo und Pay-per-Lead (${monat(s.monat)})`,
      kopf: ["", "MRR", "Kunden", "Marge", "Anteil"],
      zeilen: [
        ["Abo (Betreuung + Software)", eur(s.abo.mrr), String(s.abo.kunden), pct(s.abo.marge), pct(s.abo.anteil)],
        ["Pay-per-Lead", eur(s.ppl.mrr), String(s.ppl.kunden), pct(s.ppl.marge), pct(s.ppl.anteil)],
      ],
    });
  }
  return out;
}

const cell = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function investorenCsv(d: InvestorenDaten): string {
  const lines: string[] = [cell("Investoren-Kennzahlen"), cell(standText(d)), ""];
  for (const t of tabellen(d)) {
    lines.push(cell(t.titel), t.kopf.map(cell).join(";"), ...t.zeilen.map((z) => z.map(cell).join(";")));
    if (t.hinweis) lines.push(cell(t.hinweis));
    lines.push("");
  }
  lines.push(cell("So rechnen wir"), ...DEFINITIONEN.map((x) => [x.name, x.satz].map(cell).join(";")));
  if (d.luecken.length) lines.push("", cell("Datenlage"), ...d.luecken.map((l) => cell(l.text)));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export async function investorenPdf(d: InvestorenDaten): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Investoren-Kennzahlen");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [W, H] = [595.28, 841.89];
  const rand = 48;
  const breite = W - 2 * rand;
  const dunkel = rgb(0.1, 0.12, 0.16);
  const grau = rgb(0.42, 0.45, 0.5);
  const linie = rgb(0.86, 0.88, 0.91);
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - rand;
  const platz = (h: number) => {
    if (y - h < rand) {
      page = doc.addPage([W, H]);
      y = H - rand;
    }
  };
  const text = (t: string, f: PDFFont, size: number, color = dunkel, gap = 1.4) => {
    for (const z of umbrechen(pdfSicher(t), f, size, breite)) {
      platz(size * gap);
      if (z) page.drawText(z, { x: rand, y: y - size, size, font: f, color });
      y -= size * gap;
    }
  };
  // Text auf Spaltenbreite kürzen
  const passt = (t: string, f: PDFFont, size: number, w: number) => {
    let s = pdfSicher(t);
    while (s.length > 1 && f.widthOfTextAtSize(s, size) > w) s = s.slice(0, -1);
    return s;
  };

  text("Investoren-Kennzahlen", bold, 18, dunkel, 1.3);
  text(standText(d), font, 9.5, grau);
  y -= 8;

  // Kacheln: 5 nebeneinander
  const ks = kacheln(d);
  const kb = breite / ks.length;
  platz(52);
  ks.forEach((k, i) => {
    const x = rand + i * kb;
    page.drawRectangle({ x: x + 2, y: y - 50, width: kb - 4, height: 50, borderColor: linie, borderWidth: 0.8 });
    page.drawText(passt(k.label, font, 8, kb - 14), { x: x + 8, y: y - 14, size: 8, font, color: grau });
    page.drawText(passt(k.wert, bold, 14, kb - 14), { x: x + 8, y: y - 31, size: 14, font: bold, color: dunkel });
    page.drawText(passt(k.hinweis, font, 7, kb - 14), { x: x + 8, y: y - 43, size: 7, font, color: grau });
  });
  y -= 64;

  for (const t of tabellen(d).slice(1)) {
    platz(40);
    text(t.titel, bold, 11.5, dunkel, 1.5);
    if (t.zeilen.length) {
      const n = t.kopf.length;
      // Erste Spalte breiter
      const erste = Math.min(170, breite * (n > 5 ? 0.22 : 0.3));
      const rest = (breite - erste) / Math.max(1, n - 1);
      const xs = t.kopf.map((_, i) => (i === 0 ? rand : rand + erste + (i - 1) * rest));
      const ws = t.kopf.map((_, i) => (i === 0 ? erste - 6 : rest - 6));
      const zeile = (cells: string[], f: PDFFont, color = dunkel) => {
        platz(15);
        cells.forEach((c, i) => {
          const s = passt(c, f, 8.5, ws[i]);
          const x = i === 0 ? xs[i] : xs[i] + ws[i] - f.widthOfTextAtSize(s, 8.5);
          page.drawText(s, { x, y: y - 9, size: 8.5, font: f, color });
        });
        y -= 13;
        page.drawLine({ start: { x: rand, y: y + 1 }, end: { x: rand + breite, y: y + 1 }, thickness: 0.4, color: linie });
        y -= 2;
      };
      zeile(t.kopf, bold, grau);
      for (const z of t.zeilen) zeile(z, font);
    }
    if (t.hinweis) text(t.hinweis, font, 8.5, grau);
    y -= 8;
  }

  platz(40);
  text("So rechnen wir", bold, 11.5, dunkel, 1.5);
  for (const x of DEFINITIONEN) text(`${x.name}: ${x.satz}`, font, 8.5, dunkel, 1.35);
  if (d.luecken.length) {
    y -= 6;
    text("Datenlage", bold, 11.5, dunkel, 1.5);
    for (const l of d.luecken) text(`• ${l.text}`, font, 8.5, grau, 1.35);
  }
  return doc.save();
}
