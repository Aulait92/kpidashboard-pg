import { describe, expect, it } from "vitest";
import { aggregateProducts, produktRange, type ProductLead } from "@/lib/produkte";

const lead = (customerId: string, source: string | null, status: string | null = null, extra: Partial<ProductLead> = {}): ProductLead => ({
  customerId,
  source,
  status,
  closeValue: null,
  hasAppointment: false,
  ...extra,
});

describe("Produkte: Aggregation über alle Vertreter", () => {
  // 12 Privatschutz-Leads (A 8, B 4), 3 PKV-Wechsel-Leads (A), 1 ohne Produkt
  const leads: ProductLead[] = [
    ...Array.from({ length: 8 }, (_, i) => lead("A", "Allianz Privatschutz", i < 2 ? "Abschluss" : i < 4 ? "Termin vereinbart" : "Neuer Lead", i === 0 ? { closeValue: 800 } : {})),
    ...Array.from({ length: 4 }, (_, i) => lead("B", "Allianz Privatschutz", i === 0 ? "Abschluss" : null, { hasAppointment: i < 2 })),
    lead("A", "PKV Wechsel", "Abschluss", { closeValue: 300 }),
    lead("A", "PKV Wechsel"),
    lead("A", "Tarifoptimierung"),
    lead("B", null),
  ];
  const r = aggregateProducts({
    leads,
    costs: [
      { customerId: null, product: "Allianz Privatschutz", amount: 240 }, // Pool, wird nach Leads verteilt
      { customerId: "B", product: "Allianz Privatschutz", amount: 60 }, // direkt bei B
      { customerId: null, product: "Wechsel", amount: 90 },
      { customerId: null, product: null, amount: 999 }, // ohne Produkt: nicht zuordenbar
    ],
    revenues: [
      { customerId: "A", source: "PKV Wechsel", amount: 50 },
      { customerId: "B", source: "Allianz Privatschutz", amount: 40 },
      { customerId: "B", source: null, amount: 10 },
    ],
    names: new Map([["A", "Agentur A"], ["B", "Agentur B"]]),
  });
  const ps = r.products.find((p) => p.key === "Allianz Privatschutz")!;
  const pkv = r.products.find((p) => p.key === "Wechsel")!;

  it("zählt Leads, Termine, Abschlüsse und Quoten je Produkt", () => {
    expect(ps.leads).toBe(12);
    expect(ps.appointments).toBe(4); // 2 Status + 2 Kalender
    expect(ps.closes).toBe(3);
    expect(ps.closeRate).toBeCloseTo(0.25, 5);
    expect(ps.lowSample).toBe(false);
    // „PKV Wechsel“ und „Tarifoptimierung“ sind dasselbe Produkt
    expect(pkv.leads).toBe(3);
    expect(pkv.label).toBe("Tarifoptimierung");
    expect(pkv.lowSample).toBe(true);
  });

  it("Werbekosten und Kosten je Lead nur, soweit zuordenbar", () => {
    expect(ps.cost).toBe(300);
    expect(ps.cpl).toBe(25);
    expect(pkv.cpl).toBe(30);
    const none = r.products.find((p) => p.key === "Ohne Produkt")!;
    expect(none.leads).toBe(1);
    expect(none.cost).toBeNull();
    expect(none.cpl).toBeNull();
  });

  it("Jahresbeiträge (Monatsprodukte × 12), Provision und Pay-per-Lead-Umsatz", () => {
    // Privatschutz: 1 gemeldeter Beitrag (800), Provision 55 % je Abschluss (ohne Angabe 600)
    expect(ps.premiumsReported).toBe(1);
    expect(ps.premiumSum).toBe(800);
    expect(ps.provision).toBe(800 * 0.55 + 600 * 0.55 * 2);
    // PKV: 300 €/Monat → 3.600 € im Jahr, Provision 10 Monatsbeiträge
    expect(pkv.premiumSum).toBe(3600);
    expect(pkv.provision).toBe(3000);
    expect(pkv.pplRevenue).toBe(50);
    expect(ps.pplRevenue).toBe(40);
    expect(r.products.find((p) => p.key === "Ohne Produkt")!.pplRevenue).toBe(10);
  });

  it("Matrix Produkt × Vertreter mit anteiligen Pool-Kosten", () => {
    const a = r.matrix.find((m) => m.customerId === "A")!;
    const b = r.matrix.find((m) => m.customerId === "B")!;
    expect(r.matrix[0].customerId).toBe("A"); // meiste Leads zuerst
    expect(a.name).toBe("Agentur A");
    // A: 8 von 12 Privatschutz-Leads → 160 € Pool
    expect(a.cells["Allianz Privatschutz"]).toMatchObject({ leads: 8, cost: 160, cpl: 20, costShared: true, closes: 2, lowSample: true });
    // B: 4 von 12 → 80 € Pool + 60 € direkt
    expect(b.cells["Allianz Privatschutz"]).toMatchObject({ leads: 4, cost: 140, cpl: 35, closes: 1 });
    expect(b.cells["Allianz Privatschutz"].closeRate).toBeCloseTo(0.25, 5);
    expect(a.cells["Wechsel"]).toMatchObject({ leads: 3, cost: 90, cpl: 30 });
    expect(b.cells["Ohne Produkt"]).toMatchObject({ leads: 1, cost: null, cpl: null, closeRate: 0 });
  });
});

describe("Produkte: Zeitraum", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("rechnet in Berliner Zeit", () => {
    expect(produktRange("monat", now).from.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    const vm = produktRange("vormonat", now);
    expect(vm.from.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(vm.to.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(produktRange("unsinn", now).key).toBe("90");
    expect(produktRange("max", now).from.toISOString()).toBe("2026-05-31T22:00:00.000Z");
  });
});
