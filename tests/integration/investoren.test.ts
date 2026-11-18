import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { gegenprobe } from "@/lib/investoren/kennzahlen";
import { investorenCsv, investorenPdf } from "@/lib/investoren/export";
import { loadInvestoren } from "@/lib/investoren/server";
import { investorenDiagnose } from "@/lib/ops/investoren";
import { loadZahlen } from "@/lib/zahlen";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

// Geld › Auswertung gegen die Datenbank (K5): gleiche Zahlen wie die Übersicht (zahlen.ts) in beiden Sichten,
// KI-Kosten aus Bank & Karten, Export als CSV und PDF, Diagnose q=investoren.
const NOW = new Date("2026-11-10T12:00:00Z");
const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe("Investoren-Kennzahlen aus der Datenbank", () => {
  const ids: string[] = [];
  const txIds: string[] = [];
  let recurringId = "";

  beforeAll(async () => {
    requireTestDb();
    const a = await makeCustomer({ retainerMonthly: 900, retainerStart: d("2026-07-01") });
    const b = await makeCustomer({ retainerMonthly: 600, retainerStart: d("2026-08-01") });
    const p = await makeCustomer();
    ids.push(a.id, b.id, p.id);
    for (const at of ["2026-08-05", "2026-09-05", "2026-09-06", "2026-10-05"]) await prisma.revenue.create({ data: { customerId: p.id, amount: 60, occurredAt: d(at) } });
    recurringId = (await prisma.recurringCost.create({ data: { name: "Gewinnung Test", monthlyAmount: 150, purpose: "akquise", startsAt: d("2026-07-01") } })).id;
    const tx = await prisma.bankTransaction.create({
      data: { accountKey: "csv:investoren-test", externalId: `inv-${Date.now()}`, source: "csv", bookingDate: d("2026-10-12"), amount: -238, counterparty: "Anthropic, PBC", status: "zugeordnet", costPurpose: "ki" },
    });
    txIds.push(tx.id);
  });

  afterAll(async () => {
    await prisma.bankTransaction.deleteMany({ where: { id: { in: txIds } } });
    await prisma.recurringCost.deleteMany({ where: { id: recurringId } });
    for (const id of ids) await cleanupCustomer(id);
  });

  it("Gegenprobe: gleiche Zahlen wie die Übersicht in beiden Sichten", async () => {
    for (const sicht of ["kern", "gesamt"] as const) {
      const [inv, z] = await Promise.all([loadInvestoren(NOW, sicht), loadZahlen(NOW, sicht)]);
      expect(gegenprobe(inv.k, z).filter((x) => !x.gleich), sicht).toEqual([]);
    }
  });

  it("KI-Kosten aus Bank & Karten zählen in die Software-Kosten und stehen eigens da", async () => {
    const inv = await loadInvestoren(NOW, "kern");
    expect(inv.kiJeMonat.find((m) => m.month === "2026-10")?.ki).toBeGreaterThanOrEqual(238);
    const okt = inv.k.marge.monate.find((m) => m.month === "2026-10")!;
    expect(okt.ki).toBeGreaterThanOrEqual(238);
    expect(okt.direkt).toBeGreaterThanOrEqual(okt.ki);
    expect(inv.luecken.some((l) => l.key === "ki-fehlt")).toBe(false);
  });

  it("Export: CSV mit allen Abschnitten, PDF gültig", async () => {
    const inv = await loadInvestoren(NOW, "gesamt");
    const csv = investorenCsv(inv);
    for (const t of ["Kennzahlen", "Bindung bis", "MRR-Bewegung", "Kohorten", "Bruttomarge je Monat", "Abo und Pay-per-Lead", "So rechnen wir"]) expect(csv).toContain(t);
    const pdf = await investorenPdf(inv);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it("Diagnose q=investoren: Gegenprobe stimmt, nur Anzahlen", async () => {
    const r = await investorenDiagnose(new URLSearchParams("sicht=gesamt"));
    expect(r.gegenprobe.stimmt).toBe(true);
    expect(r.sicht).toBe("gesamt");
    expect(JSON.stringify(r)).not.toMatch(/Anthropic/);
  });
});
