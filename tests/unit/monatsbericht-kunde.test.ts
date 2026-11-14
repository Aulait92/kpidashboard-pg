// Monatsberichte im Kundenbereich (Ole, 14.11.2026): Platzhalter-Monat, PDF je Bericht,
// Link „Alle Berichte ansehen“ in der Mail; Admin: neue Buchungen seit dem letzten Besuch.
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { berichteUrl, reportSectionsHtml, reportSectionsText, SECTION_TITLES, type ReportModel } from "@/lib/monatsbericht/bericht";
import { berichtPdf, berichtPdfBlocks, berichtPdfName } from "@/lib/monatsbericht/pdf";
import { pdfSicher } from "@/lib/mail/text-pdf";
import { ersterBerichtMonat } from "@/components/monatsberichte-kunde";
import { neueBuchungenSeit } from "@/lib/admin-buchungen-neu";

const APP = "https://app.test";
const model: ReportModel = {
  version: 2,
  month: "2026-10",
  makler: false,
  closings: 3,
  funnel: { steps: [{ key: "leads", label: "Leads", value: 80, rate: null, rateLabel: null, previous: 72 }] },
  result: { lines: [{ key: "leadkosten", label: "Lead-Kosten", amount: 800, sign: "-" }], gewinn: 489.8 },
  bestand: null,
  empfehlungen: null,
  bestandskampagnen: null,
  measures: ["Neue Anzeigenmotive gestartet"],
  tips: [],
  links: { zahlen: `${APP}/buyer/zahlen?monat=2026-10` },
} as unknown as ReportModel;

describe("Monatsberichte im Kundenbereich", () => {
  it("erster Bericht kommt Anfang des nächsten Monats (deutsche Zeit)", () => {
    expect(ersterBerichtMonat(new Date("2026-11-14T10:00:00Z"))).toBe("2026-12");
    expect(ersterBerichtMonat(new Date("2026-12-31T23:30:00Z"))).toBe("2027-02"); // 1.1. 00:30 in Berlin
  });

  it("Mail enthält „Alle Berichte ansehen“ mit Sprung zu den Monatsberichten", () => {
    expect(berichteUrl(`${APP}/buyer/zahlen?monat=2026-10`)).toBe(`${APP}/buyer/zahlen?monat=2026-10#monatsberichte`);
    expect(reportSectionsHtml(model, APP)).toContain(`href="${APP}/buyer/zahlen?monat=2026-10#monatsberichte"`);
    expect(reportSectionsHtml(model, APP)).toContain("Alle Berichte ansehen");
    expect(reportSectionsText(model, APP).join("\n")).toContain(`Alle Berichte ansehen: ${APP}/buyer/zahlen?monat=2026-10#monatsberichte`);
  });

  it("PDF hat Einstieg und alle Abschnitte mit Daten, ohne Gedankenstriche", async () => {
    const blocks = berichtPdfBlocks({ version: 2, paragraphs: ["Guter Monat — weiter so."], tips: [], model }, APP);
    expect(blocks[0].text).not.toMatch(/[–—]/);
    expect(blocks.map((b) => b.ueberschrift).filter(Boolean)).toEqual([SECTION_TITLES.funnel, SECTION_TITLES.result, SECTION_TITLES.measures]);
    const bytes = await berichtPdf({ month: "2026-10", body: { version: 2, paragraphs: ["Hallo"], tips: [], model }, sentAt: new Date() }, { customerName: "Agentur Test", appUrl: APP });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe("Monatsbericht Oktober 2026");
    expect(berichtPdfName("2026-10")).toBe("monatsbericht-2026-10.pdf");
  });

  it("Minuszeichen erscheint im PDF als Minus, nicht als Fragezeichen", () => {
    expect(pdfSicher("\u2212 800,00 €")).toBe("- 800,00 €");
  });

  it("alte Berichte (ohne Modell) ergeben ebenfalls ein PDF", () => {
    const blocks = berichtPdfBlocks({ paragraphs: ["Text"], tips: ["Tipp eins"], facts: [{ key: "leads", label: "Leads", value: 5, unit: "", previous: 3 }] } as never, APP);
    expect(blocks.map((b) => b.ueberschrift)).toEqual([undefined, "Ihre Zahlen", "Tipps"]);
    expect(blocks[1].text).toBe("Leads: 5 (Vormonat 3)");
  });
});

describe("Admin: neue Buchungen seit dem letzten Besuch", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  const rows = [new Date("2026-11-14T11:00:00Z"), new Date("2026-11-10T11:00:00Z"), new Date("2026-11-20T00:00:00Z"), new Date("2026-10-01T00:00:00Z")].map((at) => ({ at }));
  it("zählt nur nach dem letzten Besuch und nichts in der Zukunft", () => {
    expect(neueBuchungenSeit(rows, new Date("2026-11-12T00:00:00Z"), now)).toBe(1);
    expect(neueBuchungenSeit(rows, new Date("2026-11-14T11:30:00Z"), now)).toBe(0);
  });
  it("ohne Besuch: letzte 7 Tage", () => {
    expect(neueBuchungenSeit(rows, null, now)).toBe(2);
  });
});
