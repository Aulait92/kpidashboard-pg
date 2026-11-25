// BWA nach Rechnungen gegen die Datenbank (Ole, 25.11.2026): mit Ausgangsrechnungen zählt der Umsatz aus Rechnungen
// (netto, Rechnungsdatum) plus HvK-Gutschriften; Entwürfe kommen gar nicht erst in die Tabelle.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadBwa } from "@/lib/bwa";
import { importAusgangsrechnungen } from "@/lib/ausgangsrechnungen";
import { requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);

describe("BWA nach Rechnungen", () => {
  beforeAll(async () => {
    requireTestDb();
    await importAusgangsrechnungen([
      { nummer: `T-${tag}-1`, datum: "2026-03-08", kunde: `Kunde ${tag}`, kundennr: null, land: null, netto: 3000, ust: 570, brutto: 3570, status: "Bezahlt", typ: "Rechnung", notiz: null },
      { nummer: `T-${tag}-2`, datum: "2026-03-20", kunde: `Kunde ${tag}`, kundennr: null, land: null, netto: 500, ust: 0, brutto: 500, status: "Unbezahlt", typ: "Rechnung", notiz: null },
    ]);
    await prisma.hvkInvoice.create({
      data: { invoiceNo: `HVK-${tag}`, periodStart: new Date("2026-03-09"), periodEnd: new Date("2026-03-15"), invoiceDate: new Date("2026-03-16"), netCents: -27000, boughtCount: 6, reklamationCount: 0, lines: [], result: {}, pdf: Buffer.from("%PDF") },
    });
  });
  afterAll(async () => {
    await prisma.ausgangsrechnung.deleteMany({ where: { nummer: { startsWith: `T-${tag}` } } });
    await prisma.hvkInvoice.deleteMany({ where: { invoiceNo: `HVK-${tag}` } });
  });

  it("Umsatz März aus Rechnungen und HvK-Gutschrift", async () => {
    const d = await loadBwa("2026", new Date("2026-11-25T12:00:00Z"));
    const maerz = d.items.filter((i) => i.month === "2026-03" && i.line.startsWith("umsatz:"));
    const summe = (line: string) => maerz.filter((i) => i.line === line && (i.label === `Kunde ${tag}` || i.detail === `HVK-${tag}`)).reduce((s, i) => s + i.net, 0);
    expect(summe("umsatz:rechnungen")).toBe(3500);
    expect(summe("umsatz:hvk")).toBe(270);
    expect(d.items.some((i) => i.line === "umsatz:service" || i.line === "umsatz:ppl")).toBe(false);
  });
});
