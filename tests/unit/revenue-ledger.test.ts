import { describe, expect, it } from "vitest";
import {
  activeCustomers,
  addMonths,
  avgMonthlyGrowth,
  buildLedger,
  churnRate,
  cohorts,
  concentration,
  monthKey,
  mrrBridge,
  newCustomers,
  projectionFactor,
  retainerRows,
  retention,
  totalsByMonth,
  type LedgerRow,
} from "@/lib/revenue-ledger";

const row = (month: string, customerId: string, amount: number, stream: LedgerRow["stream"] = "ppl"): LedgerRow => ({ month, customerId, stream, amount, recurring: stream !== "setup" });

describe("Umsatzbuch: Monate", () => {
  it("rechnet Monate in Berliner Zeit", () => {
    expect(monthKey(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11"); // 00:30 in Berlin
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
  it("Hochrechnungsfaktor = Tage im Monat / vergangene Tage", () => {
    expect(projectionFactor(new Date("2026-11-10T12:00:00Z"))).toBe(3);
  });
});

describe("Umsatzbuch: Retainer", () => {
  const now = "2026-11";
  it("tagesanteilig ab Start, voll im laufenden Monat", () => {
    const rows = retainerRows({ customerId: "c", monthly: 900, start: new Date("2026-09-16T10:00:00Z"), end: null, softwareShare: 0, pauses: [] }, ["2026-09", "2026-10", "2026-11"], now);
    expect(rows).toEqual([
      { month: "2026-09", customerId: "c", stream: "service", amount: 450, recurring: true },
      { month: "2026-10", customerId: "c", stream: "service", amount: 900, recurring: true },
      { month: "2026-11", customerId: "c", stream: "service", amount: 900, recurring: true },
    ]);
  });
  it("teilt in Software und Betreuung; Pause zählt nur Software", () => {
    const rows = retainerRows(
      { customerId: "c", monthly: 1000, start: new Date("2026-10-01T00:00:00Z"), end: null, softwareShare: 349, pauses: [{ from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-15T00:00:00Z") }] },
      ["2026-10"],
      now,
    );
    const sw = rows.find((r) => r.stream === "software")!.amount;
    const svc = rows.find((r) => r.stream === "service")!.amount;
    expect(sw).toBe(349);
    expect(svc).toBeCloseTo((651 * 16) / 31, 1); // 16 Tage ohne Pause
  });
  it("Startpreis-Phase und Vertragsende", () => {
    const rows = retainerRows(
      { customerId: "c", monthly: 1000, start: new Date("2026-08-01T00:00:00Z"), end: new Date("2026-10-31T00:00:00Z"), softwareShare: 0, intro: { amount: 500, months: 2 }, pauses: [] },
      ["2026-08", "2026-09", "2026-10", "2026-11"],
      now,
    );
    expect(rows.map((r) => [r.month, r.amount])).toEqual([
      ["2026-08", 500],
      ["2026-09", 500],
      ["2026-10", 1000],
    ]);
  });
});

describe("Umsatzbuch: Zusammenbau", () => {
  it("rechnet nur Pay-per-Lead des laufenden Monats hoch, Einrichtung einmalig", () => {
    const l = buildLedger({
      now: new Date("2026-11-10T12:00:00Z"),
      firstMonth: "2026-06",
      ppl: [
        { customerId: "a", month: "2026-10", amount: 1000 },
        { customerId: "a", month: "2026-11", amount: 400 },
      ],
      retainers: [],
      setups: [{ customerId: "b", month: "2026-11", amount: 990 }],
    });
    expect(l.months.map((m) => m.key)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(l.months.at(-1)!.projected).toBe(true);
    const t = totalsByMonth(l.rows, ["2026-10", "2026-11"]);
    expect(t[1].ppl).toBe(1200); // 400 × 3
    expect(t[1].setup).toBe(990);
    expect(t[1].recurring).toBe(1200); // Einrichtung nicht im MRR
  });
});

describe("Umsatzbuch: Auswertungen", () => {
  const rows: LedgerRow[] = [
    row("2026-08", "a", 100),
    row("2026-09", "a", 150),
    row("2026-09", "b", 200),
    row("2026-09", "c", 50),
    row("2026-10", "a", 200),
    row("2026-10", "b", 150),
    row("2026-10", "d", 300),
    row("2026-10", "d", 99, "setup"),
  ];
  it("MRR-Brücke: neu, Ausbau, verkleinert, gekündigt", () => {
    const b = mrrBridge(rows, "2026-09", "2026-10");
    expect(b).toMatchObject({ start: 400, neu: 300, ausbau: 50, verkleinert: -50, gekuendigt: -50, end: 650 });
    expect(b.counts).toEqual({ neu: 1, ausbau: 1, verkleinert: 1, gekuendigt: 1 });
    expect(b.start + b.neu + b.ausbau + b.verkleinert + b.gekuendigt).toBe(b.end);
  });
  it("Kohorten nach Startmonat", () => {
    const c = cohorts(rows, ["2026-08", "2026-09", "2026-10"]);
    expect(c[0]).toEqual({ start: "2026-08", customers: 1, values: [100, 150, 200] });
    expect(c[1]).toEqual({ start: "2026-09", customers: 2, values: [100, 60] }); // b+c: 250 → 150
  });
  it("Bindung, Kündigungsquote, Neukunden, Abhängigkeit", () => {
    expect(retention(rows, "2026-10", 1)).toEqual({ pct: 88, customers: 3 }); // 350/400
    expect(churnRate(rows, ["2026-08", "2026-09", "2026-10"])).toEqual({ rate: 1 / 4, churned: 1, avgActive: 2 });
    expect(newCustomers(rows, "2026-09")).toBe(2);
    expect(activeCustomers(rows, "2026-10")).toBe(3);
    const c = concentration(rows, "2026-10", 2)!;
    expect(c.topPct).toBe(77); // 46,2 % + 30,8 % ((300+200)/650)
    expect(c.rest).toBe(1);
  });
  it("keine Doppelzählung: Einrichtung zählt nie als Kunde oder MRR", () => {
    expect(activeCustomers([row("2026-10", "x", 990, "setup")], "2026-10")).toBe(0);
    expect(mrrBridge([row("2026-10", "x", 990, "setup")], "2026-09", "2026-10").end).toBe(0);
  });
  it("Durchschnittswachstum", () => {
    expect(avgMonthlyGrowth(100, 400, 2)).toBeCloseTo(1, 5);
    expect(avgMonthlyGrowth(0, 400, 2)).toBeNull();
  });
});
