// Stripe-Rechnungen als Ausgangsrechnungen für die BWA (Ole, 25.11.2026: Software-Umsatz läuft über Stripe).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
const ts = (iso: string) => Math.floor(Date.parse(`${iso}T10:00:00Z`) / 1000);
let rechnungen: unknown[] = [];
let gutschriften: unknown[] = [];
const liste = (xs: () => unknown[]) => ({ async *[Symbol.asyncIterator]() { yield* xs(); } });

vi.mock("@/lib/billing", () => ({
  stripeClient: () => ({ invoices: { list: () => liste(() => rechnungen) }, creditNotes: { list: () => liste(() => gutschriften) } }),
}));

const inv = (nr: string, status: string, total: number, steuer: number) => ({
  id: `in_${tag}_${nr}`, number: `S-${tag}-${nr}`, status, total, total_taxes: [{ amount: steuer }], currency: "eur",
  customer_name: `Stripe Kunde ${tag}`, created: ts("2026-11-17"), status_transitions: { finalized_at: ts("2026-11-17") }, invoice_pdf: null,
});

describe("Stripe-Rechnungen in die Ausgangsrechnungen", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    await prisma.ausgangsrechnung.deleteMany({ where: { nummer: { startsWith: `S-${tag}` } } });
    await prisma.beleg.deleteMany({ where: { hash: { startsWith: `stripe:in_${tag}` } } });
    await prisma.beleg.deleteMany({ where: { hash: { startsWith: `stripe:cn_${tag}` } } });
  });

  it("übernimmt Rechnungen und Gutschriften netto, Stornos fallen raus, gesetzter Bereich bleibt", async () => {
    const { syncStripeBelege } = await import("@/lib/belege/stripe");
    rechnungen = [inv("1", "paid", 83300, 13300), inv("2", "open", 11900, 1900)];
    gutschriften = [{ id: `cn_${tag}`, number: `S-${tag}-G1`, status: "issued", total: 11900, total_taxes: [{ amount: 1900 }], currency: "eur", created: ts("2026-11-20"), customer: { name: `Stripe Kunde ${tag}` }, pdf: null }];
    await syncStripeBelege("2026-01-01");
    const rows = await prisma.ausgangsrechnung.findMany({ where: { nummer: { startsWith: `S-${tag}` } }, orderBy: { nummer: "asc" } });
    expect(rows.map((r) => [r.nummer, Number(r.netto), r.quelle, r.typ])).toEqual([
      [`S-${tag}-1`, 700, "stripe", "Rechnung"],
      [`S-${tag}-2`, 100, "stripe", "Rechnung"],
      [`S-${tag}-G1`, -100, "stripe", "Gutschrift"],
    ]);

    await prisma.ausgangsrechnung.update({ where: { nummer: `S-${tag}-1` }, data: { bereich: "software" } });
    rechnungen = [inv("1", "paid", 83300, 13300), inv("2", "void", 11900, 1900)];
    await syncStripeBelege("2026-01-01");
    const nachher = await prisma.ausgangsrechnung.findMany({ where: { nummer: { startsWith: `S-${tag}` } }, orderBy: { nummer: "asc" } });
    expect(nachher.map((r) => r.nummer)).toEqual([`S-${tag}-1`, `S-${tag}-G1`]);
    expect(nachher[0].bereich).toBe("software");
  });

  it("überschreibt keine Papierkram-Rechnung mit gleicher Nummer", async () => {
    const { syncStripeBelege } = await import("@/lib/belege/stripe");
    await prisma.ausgangsrechnung.create({ data: { nummer: `S-${tag}-P`, datum: new Date("2026-06-01"), kunde: "Papierkram Kunde", netto: 3000, ust: 570, brutto: 3570, status: "Bezahlt", typ: "Rechnung" } });
    rechnungen = [{ ...inv("P", "paid", 100, 0), number: `S-${tag}-P` }];
    gutschriften = [];
    await syncStripeBelege("2026-01-01");
    const r = await prisma.ausgangsrechnung.findUnique({ where: { nummer: `S-${tag}-P` } });
    expect([r?.kunde, Number(r?.netto), r?.quelle]).toEqual(["Papierkram Kunde", 3000, "papierkram"]);
  });
});
