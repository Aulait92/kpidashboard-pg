// Lead als PDF (Lieferweg „Kundenbereich + PDF per Mail“), Nachbau des PDFs aus dem alten Auslieferungs-Zap
// (Code-Step „Lead-PDF füllen“, damals per PDF.co HTML→PDF): dunkler Kopf mit „Lead-Übermittlung“, Produkt,
// „Übermittelt am“, Referenz (Lead-ID), Kontakt, Angaben je Kategorie (PKV, Tier, Futter, Sterbegeld, KSP,
// Zahnzusatz), Einwilligung mit Text und Zeitpunkt, Fuß mit Firmenangaben.
//
// Gerendert mit Chromium (renderHtmlToPdf, im Docker-Image vorhanden, wie Angebot und Beratung). Schlägt das
// fehl, entsteht dasselbe Layout schlicht mit pdf-lib, damit die Lieferung nicht am PDF hängt.
// Abzeichen „SMS-verifiziert“ nur bei echtem Signal (PoolLead.smsVerified), sonst kein Abzeichen.

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { formatPhone } from "@/lib/format";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import { PROVIDER } from "@/lib/legal-texts";
import { pdfSicher, umbrechen } from "@/lib/mail/text-pdf";
import { isContactLabel } from "@/lib/ppl/lead-mail";
import { categoryOf, type Category } from "@/lib/ppl/perspective";

export type PdfLead = {
  id: string;
  product: string;
  name: string | null;
  /** international ohne +, z. B. 4915112345678 */
  phone: string | null;
  email: string | null;
  answers: { label: string; value: string }[];
  /** Übermittlung (Lieferzeitpunkt) */
  date: Date;
  /** Eingang des Funnel-Formulars (Zeitpunkt der Einwilligung) */
  consentAt?: Date | null;
  /** Einwilligungstext: Nachweis am Lead (eigener Funnel, L3) bzw. LeadSubscription.consentText */
  consentText?: string | null;
  /** Fassung und Kanäle des Nachweises, z. B. „Fassung pkv-beitrag-2026-11-20 · Kanäle: Telefon, E-Mail, WhatsApp“ */
  consentDetail?: string | null;
  smsVerified?: boolean;
  test?: boolean;
};

export type PdfCell = { k: string; v: string; big?: boolean };
export type LeadPdfData = {
  produkt: string;
  uebermitteltAm: string;
  referenz: string;
  badge: string | null;
  test: boolean;
  name: string;
  kontakt: PdfCell[];
  angabenLabel: string;
  angaben: PdfCell[];
  /** wörtlicher Einwilligungstext (in Anführungszeichen) oder Hinweis ohne Zitat */
  einwilligung: { text: string; zitat: boolean; am: string | null };
  fuss: string;
};

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
const clean = (s: string | null | undefined) => ohneGedankenstriche((s ?? "").trim());

/** Datum und Uhrzeit (Berlin), z. B. „16.11.2026, 11:00“. */
export function pdfDate(d: Date): string {
  return d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** TT.MM.JJJJ aus ISO, sonst unverändert. */
const deDatum = (v: string) => v.replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, "$3.$2.$1");
/** „850“ → „850 €“ (nur bei reiner Zahl). */
const euro = (v: string) => (/^\d+([.,]\d+)?$/.test(v) ? `${v.replace(".", ",")} €` : v);

const PLZ = new Set(["plz", "postleitzahl", "zip", "zipcode", "postalcode"]);
const ORT = new Set(["ort", "stadt", "city", "wohnort"]);
/** Intern, nicht für den Abnehmer (wie im alten Zap). */
const INTERN = new Set(["source", "qualifiziertzahnzusatz", "disqualifikationsgrundzahnzusatz"]);

type Field = { k: string; from: string[]; big?: boolean; fmt?: (v: string) => string };

/** Angaben je Kategorie: Bezeichnung im PDF ← Feldnamen aus perspective.ts (bzw. Airtable). */
const ANGABEN: Record<Category, { label: string; fields: Field[] }> = {
  pkv: {
    label: "Angaben zum Interessenten",
    fields: [
      { k: "Aktueller Versicherer", from: ["Aktuelle Versicherung"] },
      { k: "Versicherungsdauer", from: ["Wie lange in PKV?"] },
      { k: "Monatsbeitrag", from: ["Monatlicher Beitrag"], fmt: euro },
      { k: "Situation", from: ["Situation"] },
      { k: "Geburtsdatum", from: ["Geburtsdatum"], fmt: deDatum },
    ],
  },
  tier: {
    label: "Angaben zum Tier",
    fields: [
      { k: "Tierart", from: ["Tierart"] },
      { k: "Name", from: ["Tiername"], big: true },
      { k: "Geschlecht", from: ["Geschlecht (Tier)"] },
      { k: "Rasse", from: ["Rasse (Tier)"] },
      { k: "Geboren", from: ["Geburtsmonat (Tier)", "Geburtsjahr (Tier)"] },
      { k: "Kastriert / sterilisiert", from: ["Kastriert (Tier)"] },
      { k: "Haltung", from: ["Haltung (Tier)"] },
      { k: "Anzahl Tiere", from: ["Anzahl Tiere"] },
    ],
  },
  futter: {
    label: "Angaben zum Hund (Futterberatung)",
    fields: [
      { k: "Name", from: ["Tiername"], big: true },
      { k: "Geschlecht", from: ["Geschlecht (Tier)"] },
      { k: "Rasse", from: ["Rasse (Tier)"] },
      { k: "Alter", from: ["Alter (Futter)"] },
      { k: "Gewicht", from: ["Gewicht (Futter)"], fmt: (v) => (/^\d+([.,]\d+)?$/.test(v) ? `${v} kg` : v) },
      { k: "Kastriert", from: ["Kastriert (Tier)"] },
      { k: "Aktivitätslevel", from: ["Aktivitätslevel (Futter)"] },
      { k: "Gesundheitliche Probleme", from: ["Gesundheitliche Probleme (Futter)"] },
      { k: "Details zur Gesundheit", from: ["Gesundheit-Detail (Futter)"] },
      { k: "Allergien / Unverträglichkeiten", from: ["Allergien (Futter)"] },
      { k: "Details zu Allergien", from: ["Allergie-Detail (Futter)"] },
      { k: "Aktuelles Futter", from: ["Aktuelles Futter (Futter)"] },
    ],
  },
  sterbegeld: {
    label: "Angaben zur Sterbegeldvorsorge",
    fields: [
      { k: "Interesse", from: ["Interesse (Sterbegeld)"] },
      { k: "Altersklasse", from: ["Altersklasse (Sterbegeld)"] },
      { k: "Gewünschte Absicherungshöhe", from: ["Absicherungshöhe (Sterbegeld)"], big: true },
    ],
  },
  ksp: {
    label: "Angaben zum Kindersparplan",
    fields: [
      { k: "Anzahl Kinder", from: ["Anzahl Kinder (KSP)"] },
      { k: "Alter der Kinder", from: ["Alter der Kinder (KSP)"] },
      { k: "Zielbetrag zum 18.", from: ["Zielbetrag (KSP)"], big: true },
      { k: "Monatliche Sparrate", from: ["Monatliche Sparrate (KSP)"] },
      { k: "Zeithorizont", from: ["Zeithorizont (KSP)"] },
    ],
  },
  zahnzusatz: {
    label: "Angaben zur Zahnzusatzversicherung",
    fields: [
      { k: "Geburtsdatum", from: ["Geburtsdatum"], big: true, fmt: deDatum },
      { k: "Fehlende Zähne", from: ["Fehlende Zähne (Zahnzusatz)"] },
      { k: "Laufende/angeratene Behandlung", from: ["Behandlung laufend/angeraten (Zahnzusatz)"] },
      { k: "Bestehende Zahnzusatzversicherung", from: ["Bestehende Zahnzusatzversicherung (Zahnzusatz)"] },
      { k: "GKV / Heilfürsorge", from: ["GKV/Heilfürsorge (Zahnzusatz)"] },
    ],
  },
};

/** Kategorie aus den Feldnamen (Suffixe wie „(Tier)“), sonst aus dem Produkt. */
export function pdfCategory(product: string, labels: string[]): Category {
  const has = (re: RegExp) => labels.some((l) => re.test(l));
  if (has(/\(Futter\)/)) return "futter";
  if (has(/\(Tier\)|^Tierart$|^Anzahl Tiere$/)) return "tier";
  if (has(/\(Sterbegeld\)/)) return "sterbegeld";
  if (has(/\(KSP\)/)) return "ksp";
  if (has(/\(Zahnzusatz\)/)) return "zahnzusatz";
  return categoryOf(product.toLowerCase().replace(/\s+/g, "-"));
}

/** Inhalt des PDFs (rein, getestet). */
export function leadPdfData(l: PdfLead): LeadPdfData {
  const answers = l.answers.filter((a) => a?.label?.trim() && a?.value?.trim());
  const byLabel = new Map(answers.map((a) => [norm(a.label), clean(a.value)]));
  const get = (label: string) => byLabel.get(norm(label)) ?? "";
  const used = new Set<string>();
  const cat = pdfCategory(l.product, answers.map((a) => a.label));
  const def = ANGABEN[cat];
  const cells: PdfCell[] = [];
  for (const f of def.fields) {
    const v = f.from.map(get).filter(Boolean).join(" ");
    f.from.forEach((x) => used.add(norm(x)));
    if (v) cells.push({ k: f.k, v: f.fmt ? f.fmt(v) : v, ...(f.big ? { big: true } : {}) });
  }
  // Alles Übrige (z. B. „Gesetzlich oder privat?“ oder unbekannte Produkte) nicht verlieren
  for (const a of answers) {
    const n = norm(a.label);
    if (used.has(n) || isContactLabel(a.label) || PLZ.has(n) || ORT.has(n) || INTERN.has(n)) continue;
    used.add(n);
    cells.push({ k: clean(a.label), v: clean(a.value) });
  }
  const plz = answers.find((a) => PLZ.has(norm(a.label)))?.value ?? "";
  const ort = answers.find((a) => ORT.has(norm(a.label)))?.value ?? "";
  const kontakt: PdfCell[] = [
    { k: "Telefon", v: l.phone ? formatPhone(l.phone) : "", big: true },
    { k: "E-Mail", v: clean(l.email) },
    { k: "PLZ", v: clean(plz) },
    { k: "Ort", v: clean(ort) },
  ].filter((c) => c.v);
  const consent = clean(l.consentText);
  const am = [l.consentAt ? pdfDate(l.consentAt) : null, clean(l.consentDetail) || null].filter(Boolean).join(" · ") || null;
  return {
    produkt: clean(l.product) || "Pay-per-Lead",
    uebermitteltAm: pdfDate(l.date),
    referenz: l.id,
    badge: l.test ? "TEST" : l.smsVerified ? "SMS-verifiziert" : null,
    test: !!l.test,
    name: clean(l.name) || "Interessent",
    kontakt,
    angabenLabel: def.label,
    angaben: cells,
    einwilligung: consent
      ? { text: consent, zitat: true, am }
      : { text: "Der Interessent hat im Formular der Weitergabe seiner Angaben und einer Kontaktaufnahme zugestimmt.", zitat: false, am },
    fuss: `${PROVIDER.name} · ${PROVIDER.street} · ${PROVIDER.city}`,
  };
}

/** Dateiname des Anhangs, z. B. „Lead_Erika_Mustermann_cm123.pdf“. */
export function leadPdfName(l: Pick<PdfLead, "id" | "name">): string {
  const safe = (s: string) => s.replace(/ß/g, "ss").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9-]+/g, "_").replace(/^_+|_+$/g, "");
  return `Lead_${safe(l.name ?? "") || "Interessent"}_${safe(l.id)}.pdf`;
}

export const escHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const kv = (c: PdfCell) => `<div class="kv"><span class="k">${escHtml(c.k)}</span><span class="${c.big ? "v big" : "v"}">${escHtml(c.v)}</span></div>`;

const CSS = `:root{--dark-bg:#0B1524;--dark-text:#FFFFFF;--dark-muted:#B7C0CC;--light-text:#0B1524;--light-body:#333E4E;--light-muted:#7A8596;--light-divider:#E3E8EF;--light-box:#F7F9FC;--brand-blue:#1B6BFA;--brand-blue-soft:#6CA0FB}
*{margin:0;padding:0;box-sizing:border-box}@page{size:A4;margin:0}
html,body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:var(--light-body);font-size:12px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.header{background:var(--dark-bg);color:var(--dark-text);padding:28px 40px 24px}
.brand{display:flex;align-items:center;gap:9px;margin-bottom:22px}
.brand-icon{width:26px;height:26px;background:var(--brand-blue);border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px;line-height:1}
.brand-name{font-size:15px;font-weight:700}.brand-name .accent{color:var(--brand-blue-soft)}
.header-row{display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
.eyebrow{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--brand-blue-soft);margin-bottom:6px}
.h-title{font-size:22px;font-weight:700}
.h-meta{text-align:right;font-size:11px;color:var(--dark-muted);line-height:1.7;white-space:nowrap}.h-meta strong{color:var(--dark-text);font-weight:600}
.badge{display:inline-block;background:rgba(14,159,110,.15);color:#34D399;border:1px solid rgba(14,159,110,.5);border-radius:5px;padding:2px 9px;font-size:10px;font-weight:700;letter-spacing:.5px}
.badge.test{background:rgba(245,158,11,.15);color:#FBBF24;border-color:rgba(245,158,11,.6)}
.body{padding:28px 40px 70px}
.testnote{background:#FFF7ED;border:1px solid #F59E0B;color:#9A3412;border-radius:8px;padding:10px 14px;font-weight:700;margin-bottom:20px}
.section{margin-bottom:24px;break-inside:avoid}
.section-label{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--brand-blue);margin-bottom:10px;border-bottom:1px solid var(--light-divider);padding-bottom:6px}
.name-line{font-size:20px;font-weight:700;color:var(--light-text);margin-bottom:12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 32px}
.kv{display:flex;flex-direction:column}
.kv .k{font-size:10px;color:var(--light-muted);text-transform:uppercase;letter-spacing:.5px}
.kv .v{font-size:13px;color:var(--light-text);font-weight:600;word-break:break-word}.kv .v.big{font-size:15px}
.consent-box{background:var(--light-box);border:1px solid var(--light-divider);border-radius:8px;padding:14px 16px}
.consent-text{font-size:11.5px;color:var(--light-body);font-style:italic}
.consent-meta{font-size:10.5px;color:var(--light-muted);margin-top:8px}
.footer{padding:16px 40px;border-top:1px solid var(--light-divider);font-size:10px;color:var(--light-muted);display:flex;justify-content:space-between;position:fixed;bottom:0;left:0;right:0;background:#fff}`;

/** HTML wie im alten Zap (rein, getestet). */
export function leadPdfHtml(d: LeadPdfData): string {
  const angaben = d.angaben.length
    ? `<div class="section"><div class="section-label">${escHtml(d.angabenLabel)}</div><div class="grid">${d.angaben.map(kv).join("")}</div></div>`
    : "";
  const consent = d.einwilligung.zitat ? `„${escHtml(d.einwilligung.text)}“` : escHtml(d.einwilligung.text);
  const badge = d.badge ? `<br><span class="badge${d.test ? " test" : ""}">${escHtml(d.badge)}</span>` : "";
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>${escHtml(`${d.test ? "TEST " : ""}Lead-Übermittlung ${d.produkt} (${d.referenz})`)}</title><style>${CSS}</style></head><body>
<div class="header"><div class="brand"><div class="brand-icon">&#8599;</div><div class="brand-name">performance<span class="accent">growth</span></div></div>
<div class="header-row"><div><div class="eyebrow">Lead-Übermittlung</div><div class="h-title">${escHtml(d.produkt)}</div></div>
<div class="h-meta">Übermittelt am <strong>${escHtml(d.uebermitteltAm)}</strong><br>Referenz <strong>${escHtml(d.referenz)}</strong>${badge}</div></div></div>
<div class="body">${d.test ? `<div class="testnote">TEST: Dies ist ein Testdatensatz, bitte nicht bearbeiten.</div>` : ""}
<div class="section"><div class="section-label">Kontakt</div><div class="name-line">${escHtml(d.name)}</div><div class="grid">${d.kontakt.map(kv).join("")}</div></div>
${angaben}
<div class="section"><div class="section-label">Einwilligung</div><div class="consent-box"><div class="consent-text">${consent}</div>${d.einwilligung.am ? `<div class="consent-meta">Erteilt am ${escHtml(d.einwilligung.am)}</div>` : ""}</div></div></div>
<div class="footer"><span>${escHtml(d.fuss)}</span><span>Lead-Referenz ${escHtml(d.referenz)}</span></div>
</body></html>`;
}

/** Ersatz ohne Browser: gleiche Abschnitte, schlicht mit pdf-lib. */
export async function leadPdfFallback(d: LeadPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [W, H] = [595.28, 841.89];
  const mx = 40;
  const width = W - 2 * mx;
  const ink = rgb(0.043, 0.082, 0.141);
  const muted = rgb(0.478, 0.522, 0.588);
  const divider = rgb(0.89, 0.91, 0.937);
  const blue = rgb(0.106, 0.42, 0.98);
  const blueSoft = rgb(0.424, 0.627, 0.984);
  const headMuted = rgb(0.718, 0.753, 0.8);
  const T = (p: PDFPage, s: string, x: number, y: number, f: PDFFont, size: number, color = ink) => p.drawText(pdfSicher(s), { x, y, size, font: f, color });
  const right = (p: PDFPage, s: string, y: number, f: PDFFont, size: number, color = ink) => T(p, s, W - mx - f.widthOfTextAtSize(pdfSicher(s), size), y, f, size, color);

  let page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: H - 150, width: W, height: 150, color: ink });
  page.drawRectangle({ x: mx, y: H - 54, width: 22, height: 22, color: blue });
  T(page, "performance", mx + 30, H - 48, bold, 14, rgb(1, 1, 1));
  T(page, "growth", mx + 30 + bold.widthOfTextAtSize("performance", 14), H - 48, bold, 14, blueSoft);
  T(page, "LEAD-ÜBERMITTLUNG", mx, H - 92, bold, 9, blueSoft);
  T(page, umbrechen(pdfSicher(d.produkt), bold, 20, width - 200)[0] ?? "", mx, H - 118, bold, 20, rgb(1, 1, 1));
  right(page, `Übermittelt am ${d.uebermitteltAm}`, H - 96, font, 9.5, headMuted);
  right(page, `Referenz ${d.referenz}`, H - 111, font, 9.5, headMuted);
  if (d.badge) right(page, d.badge, H - 128, bold, 9, d.test ? rgb(0.98, 0.75, 0.14) : rgb(0.2, 0.83, 0.6));

  let y = H - 180;
  const need = (h: number) => {
    if (y - h < 70) {
      page = doc.addPage([W, H]);
      y = H - 50;
    }
  };
  const label = (s: string) => {
    need(40);
    T(page, s.toUpperCase(), mx, y - 9, bold, 9, blue);
    y -= 15;
    page.drawLine({ start: { x: mx, y }, end: { x: W - mx, y }, thickness: 0.8, color: divider });
    y -= 12;
  };
  const colW = (width - 32) / 2;
  const grid = (cells: PdfCell[]) => {
    for (let i = 0; i < cells.length; i += 2) {
      const pair = cells.slice(i, i + 2).map((c) => ({ c, size: c.big ? 13 : 11, lines: umbrechen(pdfSicher(c.v), bold, c.big ? 13 : 11, colW) }));
      const h = 12 + Math.max(...pair.map((p) => p.lines.length * (p.size + 3))) + 8;
      need(h);
      pair.forEach((p, j) => {
        const x = mx + j * (colW + 32);
        T(page, p.c.k.toUpperCase(), x, y - 8, font, 8, muted);
        p.lines.forEach((t, n) => T(page, t, x, y - 22 - n * (p.size + 3), bold, p.size));
      });
      y -= h;
    }
    y -= 10;
  };

  if (d.test) {
    page.drawRectangle({ x: mx, y: y - 26, width, height: 26, color: rgb(1, 0.969, 0.929), borderColor: rgb(0.96, 0.62, 0.04), borderWidth: 1 });
    T(page, "TEST: Dies ist ein Testdatensatz, bitte nicht bearbeiten.", mx + 12, y - 17, bold, 10.5, rgb(0.6, 0.2, 0.07));
    y -= 42;
  }
  label("Kontakt");
  T(page, d.name, mx, y - 16, bold, 18);
  y -= 30;
  grid(d.kontakt);
  if (d.angaben.length) {
    label(d.angabenLabel);
    grid(d.angaben);
  }
  label("Einwilligung");
  const lines = umbrechen(pdfSicher(d.einwilligung.zitat ? `„${d.einwilligung.text}“` : d.einwilligung.text), font, 10, width - 28);
  const boxH = lines.length * 14 + (d.einwilligung.am ? 18 : 0) + 20;
  need(boxH);
  page.drawRectangle({ x: mx, y: y - boxH, width, height: boxH, color: rgb(0.969, 0.976, 0.988), borderColor: divider, borderWidth: 1 });
  lines.forEach((t, n) => T(page, t, mx + 14, y - 20 - n * 14, font, 10, rgb(0.2, 0.243, 0.306)));
  if (d.einwilligung.am) T(page, `Erteilt am ${d.einwilligung.am}`, mx + 14, y - boxH + 12, font, 9, muted);

  for (const p of doc.getPages()) {
    p.drawLine({ start: { x: 0, y: 46 }, end: { x: W, y: 46 }, thickness: 0.8, color: divider });
    T(p, d.fuss, mx, 26, font, 8.5, muted);
    right(p, `Lead-Referenz ${d.referenz}`, 26, font, 8.5, muted);
  }
  doc.setTitle(pdfSicher(`${d.test ? "TEST " : ""}Lead-Übermittlung ${d.produkt} (${d.referenz})`));
  doc.setAuthor(PROVIDER.brand);
  return doc.save();
}

export type LeadPdfMail = { subject: string; greeting: string; paragraphs: string[]; list: string[]; textBlocks: string[]; html: string };

/** Begleitmail zum PDF wie im alten Zap, ohne Gedankenstriche (rein, getestet). */
export function leadPdfMail(l: Pick<PdfLead, "id" | "product" | "name" | "phone" | "test">): LeadPdfMail {
  const product = clean(l.product) || "Pay-per-Lead";
  const name = clean(l.name) || "Interessent";
  const closing = [
    "Alle weiteren Angaben sowie der dokumentierte Einwilligungsnachweis befinden sich im beigefügten PDF. Der Interessent hat einer telefonischen Kontaktaufnahme ausdrücklich zugestimmt. Für eine hohe Abschlussquote empfehlen wir eine zeitnahe Kontaktaufnahme.",
    l.test ? "Dieser Test erscheint nicht in Ihrem Kundenbereich." : "Den Lead finden Sie auch in Ihrem Kundenbereich.",
  ];
  return {
    subject: `${l.test ? "[TEST] " : ""}Neuer Lead: ${product}: ${name}`,
    greeting: "Guten Tag,",
    paragraphs: [
      ...(l.test ? ["TEST: Dies ist ein Testdatensatz, bitte nicht bearbeiten."] : []),
      `anbei erhalten Sie exklusiv einen neuen qualifizierten Lead aus dem Bereich ${product}.`,
    ],
    list: [`Interessent: ${name}`, `Telefon: ${l.phone ? formatPhone(l.phone) : "nicht angegeben"}`, `Referenz: ${l.id}`],
    textBlocks: closing,
    html: closing.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${escHtml(p)}</p>`).join(""),
  };
}

/** PDF des Leads: Chromium (Layout wie im alten Zap), bei Fehler pdf-lib. */
export async function leadPdf(l: PdfLead): Promise<Uint8Array> {
  const d = leadPdfData(l);
  try {
    const { renderHtmlToPdf } = await import("@/lib/html-to-png");
    return new Uint8Array(await renderHtmlToPdf(leadPdfHtml(d)));
  } catch (err) {
    console.warn("[lead-pdf] Chromium nicht verfügbar, schlichtes PDF:", err instanceof Error ? err.message : err);
    return leadPdfFallback(d);
  }
}
