import { describe, expect, it } from "vitest";
import { costsForSicht, parseSicht, pilotEnded, pilotLabel, rowsForSicht } from "@/lib/zahlen-sicht";
import { activeCustomers, totalsByMonth, type LedgerRow } from "@/lib/revenue-ledger";

const rows: LedgerRow[] = [
  { month: "2026-10", customerId: "a", stream: "ppl", amount: 200, recurring: true },
  { month: "2026-10", customerId: "b", stream: "service", amount: 651, recurring: true },
  { month: "2026-10", customerId: "b", stream: "software", amount: 349, recurring: true },
  { month: "2026-10", customerId: "b", stream: "setup", amount: 990, recurring: false },
];

describe("Sicht Kerngeschäft / Gesamt", () => {
  it("parseSicht: nur „kern“ ist Kerngeschäft, alles andere Gesamt", () => {
    expect(parseSicht("kern")).toBe("kern");
    expect(parseSicht("gesamt")).toBe("gesamt");
    expect(parseSicht(undefined)).toBe("gesamt");
    expect(parseSicht("x")).toBe("gesamt");
  });

  it("Umsatzbuch: Kerngeschäft ohne Pay-per-Lead, Einrichtung bleibt", () => {
    const kern = rowsForSicht(rows, "kern");
    expect(kern.map((r) => r.stream)).toEqual(["service", "software", "setup"]);
    expect(rowsForSicht(rows, "gesamt")).toBe(rows);
    const t = totalsByMonth(kern, ["2026-10"])[0];
    expect(t).toMatchObject({ ppl: 0, recurring: 1000, setup: 990 });
    expect(activeCustomers(kern, "2026-10")).toBe(1);
    expect(activeCustomers(rows, "2026-10")).toBe(2);
  });

  it("Kosten: Kerngeschäft ohne direkte Pay-per-Lead-Kosten (Marge unverzerrt)", () => {
    const costs = [{ month: "2026-10", ppl: 80, metaPpl: 80, software: 50, akquise: 30, betrieb: 100, metaAkquise: 30, whatsapp: 5 }];
    const kern = costsForSicht(costs, "kern")[0];
    expect(kern).toMatchObject({ ppl: 0, metaPpl: 0, software: 50, akquise: 30, betrieb: 100 });
    const rev = totalsByMonth(rowsForSicht(rows, "kern"), ["2026-10"])[0].recurring;
    expect((rev - kern.ppl - kern.software) / rev).toBeCloseTo(0.95);
    expect(costsForSicht(costs, "gesamt")[0].ppl).toBe(80);
  });

  it("Pilot-Beschriftung", () => {
    expect(pilotLabel("2026-06", "2026-11")).toBe("Juni–November 2026");
    expect(pilotLabel("2026-06", "2027-01")).toBe("Juni 2026–Januar 2027");
    expect(pilotLabel("2026-06", null)).toBe("seit Juni 2026");
    expect(pilotEnded("2026-11", "2026-12")).toBe(true);
    expect(pilotEnded("2026-11", "2026-11")).toBe(false);
    expect(pilotEnded(null, "2026-12")).toBe(false);
  });
});
