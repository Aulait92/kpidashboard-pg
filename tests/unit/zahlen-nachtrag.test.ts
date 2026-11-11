import { describe, expect, it } from "vitest";
import {
  breakdown,
  buildLedger,
  duplicateGroups,
  manualSetups,
  normalizeName,
  oneTimeByMonth,
  retentionBreakdown,
  totalsByMonth,
  type LedgerRow,
  type ManualEntry,
} from "@/lib/revenue-ledger";

const NOW = new Date("2026-11-10T12:00:00Z");
const manual: ManualEntry[] = [
  { id: "m1", month: "2026-09", customerId: "a", amount: 990, kind: "setup" },
  { id: "m2", month: "2026-10", customerId: null, amount: 500, kind: "other" },
  { id: "m3", month: "2026-10", customerId: "b", amount: 0, kind: "setup" }, // ohne Betrag: ignoriert
];

describe("Nachgetragene Einmal-Umsätze im Umsatzbuch", () => {
  it("zählen als Einrichtung, nie im MRR, ohne Kunde unter eigenem Schlüssel", () => {
    const setups = manualSetups(manual);
    expect(setups).toEqual([
      { customerId: "a", month: "2026-09", amount: 990 },
      { customerId: "nachtrag:m2", month: "2026-10", amount: 500 },
    ]);
    const ledger = buildLedger({ now: NOW, firstMonth: "2026-06", ppl: [{ customerId: "a", month: "2026-10", amount: 100 }], retainers: [], setups });
    const t = totalsByMonth(ledger.rows, ["2026-09", "2026-10"]);
    expect(t[0]).toMatchObject({ setup: 990, recurring: 0 });
    expect(t[1]).toMatchObject({ setup: 500, recurring: 100, ppl: 100 });
    expect(ledger.rows.filter((r) => r.stream === "setup").every((r) => !r.recurring)).toBe(true);
  });

  it("Einmal-Umsätze je Monat getrennt nach Herkunft", () => {
    const m = oneTimeByMonth([{ month: "2026-10", amount: 1490 }], manual, ["2026-09", "2026-10", "2026-11"]);
    expect(m[0]).toEqual({ month: "2026-09", offers: 0, manualSetup: 990, other: 0, total: 990 });
    expect(m[1]).toEqual({ month: "2026-10", offers: 1490, manualSetup: 0, other: 500, total: 1990 });
    expect(m[2].total).toBe(0);
  });
});

describe("Woraus besteht das?", () => {
  const row = (month: string, customerId: string, amount: number, stream: LedgerRow["stream"] = "ppl"): LedgerRow => ({ month, customerId, stream, amount, recurring: stream !== "setup" });
  const rows = [
    row("2026-10", "a", 200),
    row("2026-10", "a", 349, "software"),
    row("2026-10", "a", 651, "service"),
    row("2026-10", "b", 50),
    row("2026-10", "b", 990, "setup"),
    row("2026-07", "a", 100),
    row("2026-07", "c", 80),
  ];

  it("je Kunde und Strom, größter zuerst, Einrichtung nur auf Wunsch", () => {
    const b = breakdown(rows, "2026-10");
    expect(b.map((x) => x.customerId)).toEqual(["a", "b"]);
    expect(b[0].total).toBe(1200);
    expect(b[0].streams.map((s) => s.stream).sort()).toEqual(["ppl", "service", "software"]);
    expect(b[1].total).toBe(50);
    expect(breakdown(rows, "2026-10", false).find((x) => x.customerId === "b")?.total).toBe(1040);
  });

  it("Umsatzbindung je Kunde: damals und heute", () => {
    expect(retentionBreakdown(rows, "2026-10", 3)).toEqual([
      { customerId: "a", then: 100, now: 1200 },
      { customerId: "c", then: 80, now: 0 },
    ]);
  });

  it("findet mögliche Dubletten über Name und E-Mail", () => {
    expect(normalizeName("Müller Versicherungen GmbH (PKV)")).toBe("muellerversicherungen");
    const d = duplicateGroups([
      { id: "1", name: "Agentur Müller", emails: ["info@mueller.de"] },
      { id: "2", name: "Agentur Müller (Kinderwunsch)", emails: [] },
      { id: "3", name: "Schmidt", emails: ["INFO@schmidt.de"] },
      { id: "4", name: "Schmidt & Partner", emails: ["info@schmidt.de"] },
      { id: "5", name: "Weber", emails: [] },
    ]);
    expect(d.get("1")).toEqual(["2"]);
    expect(d.get("3")).toEqual(["4"]);
    expect(d.get("4")).toEqual(["3"]);
    expect(d.has("5")).toBe(false);
  });
});
