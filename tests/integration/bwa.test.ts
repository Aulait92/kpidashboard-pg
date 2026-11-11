import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadBwa } from "@/lib/bwa";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

// BWA gegen die Datenbank: Umsatz (Pay-per-Lead ohne Hochrechnung), Bankbuchungen
// (netto, gruppiert), laufende Kosten. Gemeinsame Test-DB → nur eigene Posten prüfen.
const NOW = new Date("2026-11-10T12:00:00Z");
const d = (s: string) => new Date(`${s}T12:00:00Z`);
const tag = Math.random().toString(36).slice(2, 8);

describe("BWA aus der Datenbank", () => {
  let customer = "";
  let ruleId = "";
  let recurringId = "";
  const acct = `csv:test-${tag}`;

  beforeAll(async () => {
    requireTestDb();
    customer = (await makeCustomer({ name: `BWA Kunde ${tag}` })).id;
    for (let i = 0; i < 3; i++) await prisma.revenue.create({ data: { customerId: customer, amount: 40, occurredAt: d(`2026-11-0${i + 1}`) } });
    await prisma.revenue.create({ data: { customerId: customer, amount: 40, occurredAt: d("2026-10-15") } });
    ruleId = (await prisma.costRule.create({ data: { pattern: `bwa-stb-${tag}`, action: "betrieb", vatIncluded: true, label: `Steuerberater ${tag} (Kanzlei)` } })).id;
    await prisma.bankTransaction.createMany({
      data: [
        { accountKey: acct, externalId: "1", source: "csv", bookingDate: d("2026-10-15"), amount: -297.5, counterparty: `GC RE ${tag}`, status: "zugeordnet", costPurpose: "betrieb", vatIncluded: true, ruleId },
        { accountKey: acct, externalId: "2", source: "csv", bookingDate: d("2026-11-04"), amount: -8.1, counterparty: `Google Cloud ${tag}`, status: "zugeordnet", costPurpose: "software", vatIncluded: false },
        { accountKey: acct, externalId: "3", source: "csv", bookingDate: d("2026-11-05"), amount: -50, counterparty: `Offen ${tag}`, status: "neu" },
      ],
    });
    recurringId = (await prisma.recurringCost.create({ data: { name: `Laufend ${tag}`, monthlyAmount: 300, purpose: "akquise", startsAt: d("2026-10-01") } })).id;
  });

  afterAll(async () => {
    await prisma.bankTransaction.deleteMany({ where: { accountKey: acct } });
    await prisma.costRule.deleteMany({ where: { id: ruleId } });
    await prisma.recurringCost.deleteMany({ where: { id: recurringId } });
    await cleanupCustomer(customer);
  });

  it("liefert Posten je Zeile und Monat (netto, ohne Hochrechnung)", async () => {
    const b = await loadBwa(undefined, NOW);
    expect(b.range).toBe("2026");
    expect(b.bwa.months[b.bwa.months.length - 1]).toBe("2026-11");
    const mine = (line: string, month: string) => b.items.filter((i) => i.line === line && i.month === month && i.label.includes(tag)).reduce((s, i) => s + i.net, 0);
    // laufender Monat: tatsächlich 3 × 40 €, nicht hochgerechnet
    expect(mine("umsatz:ppl", "2026-11")).toBe(120);
    expect(mine("umsatz:ppl", "2026-10")).toBe(40);
    // Steuerberater: 297,50 brutto inkl. 19 % → 250 netto, Gruppe = Regel-Bezeichnung ohne Klammer
    // (in der gemeinsamen Test-DB ggf. unter „Sonstiges“ zusammengefasst)
    const stb = b.items.find((i) => i.label === `GC RE ${tag}`)!;
    expect([`betrieb:Steuerberater ${tag}`, "betrieb:Sonstiges"]).toContain(stb.line);
    expect(stb).toMatchObject({ month: "2026-10", net: 250, gross: 297.5, href: "/admin/einstellungen/bank/zuordnen" });
    if (stb.line === "betrieb:Sonstiges") expect(stb.detail).toContain(`Steuerberater ${tag}`);
    expect(mine("direkt:software", "2026-11")).toBe(8.1);
    expect(mine("akquise:tools", "2026-11")).toBe(300);
    // offene Buchung zählt nicht, aber im Hinweis
    expect(b.items.some((i) => i.label === `Offen ${tag}`)).toBe(false);
    expect(b.hints.openExpenses).toBeGreaterThanOrEqual(1);
    // Zeilen der Tabelle enthalten die Posten
    const row = b.bwa.rows.find((r) => r.key === `betrieb:Steuerberater ${tag}` || r.key === "betrieb:Sonstiges");
    expect(row).toBeTruthy();
    expect(b.ranges.map((r) => r.key)).toContain("12m");
  });
});
