import { describe, expect, it, vi } from "vitest";

// Keine echten DB-/Meta-/Push-Aufrufe: media-buyer.ts wird nur für die reine
// Entscheidungsfunktion decideBudget importiert.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn() }));

import { decideBudget } from "@/lib/media-buyer";
import { DEFAULT_LEARNING_CONFIG, guardLearning } from "@/lib/media-buyer-lernphase";
import { applyPriceGuard } from "@/lib/media-buyer-preisgrenze";
import {
  deliveryPacing,
  describePacing,
  holdForImplausible,
  type PoolCustomerGoal,
} from "@/lib/media-buyer-ziele";

// Fall vom 20.11.2026, Pool „PKV Tarifoptimierung“ (Zielquelle Software):
// Ziel 129, eingegangen 134 (countPoolLeads, brutto), geliefert 34.
const PKV: PoolCustomerGoal[] = [
  { customerId: "kleist", goal: 48, delivered: 10 },
  { customerId: "socki", goal: 46, delivered: 13 },
  { customerId: "verrata", goal: 30, delivered: 9 },
  { customerId: "mueller", goal: 5, delivered: 2 },
];

const pkvPacing = () =>
  deliveryPacing({
    goal: 129,
    customers: PKV,
    incomingMtd: 134,
    // 21 Tage: 140 eingegangen, 35 an die Bezüge geliefert → 25 % Verwertung.
    recentIncoming: 140,
    recentDelivered: 35,
    poolDeliveredCheck: 34,
    daysElapsed: 20,
    daysTotal: 30,
  });

const decide = (leadsMtd: number, goal: number, o: Partial<Parameters<typeof decideBudget>[0]> = {}) =>
  decideBudget({
    leadsMtd,
    goal,
    daysElapsed: 20,
    daysTotal: 30,
    currentBudget: 100,
    costPerLead: 20,
    minBudget: 5,
    maxBudget: 1000,
    maxStep: 10, // mit Meta gilt die Schrittgrenze der Lernphase
    boostDays: 5,
    anyPaused: false,
    precisionDays: 3,
    precisionMinBudget: 1,
    lookAheadHours: 12,
    ...o,
  });

describe("Lieferungs-Pacing: Fall PKV Tarifoptimierung (Ziel 129, eingegangen 134, geliefert 34)", () => {
  it("Ist = geliefert, offen = Summe der Kunden-Rückstände, nicht erreicht", () => {
    const pc = pkvPacing();
    expect(pc.delivered).toBe(34);
    expect(pc.open).toBe(95);
    expect(pc.allReached).toBe(false);
    expect(pc.behind).toHaveLength(4);
    expect(pc.plausible).toBe(true);
    expect(pc.yieldSource).toBe("recent");
    expect(pc.yieldRate).toBeCloseTo(0.25);
    // 95 offen / 25 % Verwertung = 380 eingehende Leads nötig.
    expect(pc.neededIncoming).toBe(380);
    expect(pc.steerLeads).toBe(134);
    expect(pc.steerGoal).toBe(514);
    // Prognose geliefert: 34 + 6,7/Tag × 25 % × 10 Tage ≈ 51 (nicht 201).
    expect(pc.projectedDelivered).toBe(51);
    expect(describePacing(pc)).toContain("Geliefert 34/129, offen 95");
  });

  it("alte Rechnung (eingegangen gegen Ziel) hätte pausiert", () => {
    expect(decide(134, 129).action).toBe("pause");
  });

  it("neue Rechnung pausiert nicht, sondern erhöht das Budget", () => {
    const pc = pkvPacing();
    const d = decide(pc.steerLeads, pc.steerGoal);
    expect(d.setStatus).not.toBe("PAUSED");
    expect(d.action).toBe("increase");
    // 380 Leads in 11 Tagen × 20 € ≈ 691 €/Tag rechnerisch.
    expect(d.targetBudget!).toBeGreaterThan(600);
  });

  it("Lernphase deckelt die Erhöhung auf +20 %, pausiert aber nicht", () => {
    const pc = pkvPacing();
    const d = decide(pc.steerLeads, pc.steerGoal);
    const g = guardLearning({
      decision: d,
      currentBudget: 100,
      learning: "SUCCESS",
      hoursSinceLastChange: 100,
      pausedDays: null,
      leadsMtd: pc.steerLeads,
      goal: pc.steerGoal,
      projected: Math.round((pc.steerLeads / 20) * 30),
      daysLeft: 11,
      inBoostWindow: false,
      costPerLead: 20,
      cplMtd: 20,
      maxBudget: 1000,
      cfg: DEFAULT_LEARNING_CONFIG,
    });
    expect(g.decision.setStatus).not.toBe("PAUSED");
    expect(g.decision.targetBudget!).toBeGreaterThan(100);
  });

  it("Preisgrenze: unter dem Höchstpreis erhöht, darüber gehalten (nie pausiert)", () => {
    const pc = pkvPacing();
    const d = decide(pc.steerLeads, pc.steerGoal);
    const ok = applyPriceGuard({ decision: d, currentBudget: 100, costPerLead: 20, maxCpl: 30 });
    expect(ok.decision.action).toBe("increase");
    const tooExpensive = applyPriceGuard({ decision: d, currentBudget: 100, costPerLead: 20, maxCpl: 15 });
    expect(tooExpensive.decision.action).toBe("none");
    expect(tooExpensive.decision.setStatus).toBeNull();
  });
});

describe("Lieferungs-Pacing: Normalfälle", () => {
  const base = {
    goal: 100,
    incomingMtd: 200,
    recentIncoming: 200,
    recentDelivered: 100,
    daysElapsed: 20,
    daysTotal: 30,
  };

  it("alle Kunden am Ziel → erreicht, decideBudget pausiert", () => {
    const pc = deliveryPacing({
      ...base,
      customers: [
        { customerId: "a", goal: 60, delivered: 60 },
        { customerId: "b", goal: 40, delivered: 41 },
      ],
    });
    expect(pc.open).toBe(0);
    expect(pc.allReached).toBe(true);
    expect(decide(pc.steerLeads, pc.steerGoal).action).toBe("pause");
  });

  it("Pool-Summe erreicht, aber ein Kunde hinten → nicht erreicht, kein Pausieren", () => {
    const pc = deliveryPacing({
      ...base,
      customers: [
        { customerId: "a", goal: 60, delivered: 80 },
        { customerId: "b", goal: 40, delivered: 25 },
      ],
    });
    expect(pc.delivered).toBe(105);
    expect(pc.open).toBe(15);
    expect(pc.allReached).toBe(false);
    expect(pc.behind.map((c) => c.customerId)).toEqual(["b"]);
    expect(decide(pc.steerLeads, pc.steerGoal).setStatus).not.toBe("PAUSED");
  });

  it("Toleranz 2 %: 98 von 100 gilt als erreicht, 97 nicht", () => {
    const reached = deliveryPacing({ ...base, customers: [{ customerId: "a", goal: 100, delivered: 98 }] });
    expect(reached.allReached).toBe(true);
    const behind = deliveryPacing({ ...base, customers: [{ customerId: "a", goal: 100, delivered: 97 }] });
    expect(behind.allReached).toBe(false);
    expect(behind.open).toBe(3);
  });

  it("auf Kurs bei hoher Verwertung: kein großer Sprung", () => {
    // 50 % Verwertung, 70 von 100 geliefert, 20 von 30 Tagen.
    const pc = deliveryPacing({ ...base, customers: [{ customerId: "a", goal: 100, delivered: 70 }], incomingMtd: 140 });
    expect(pc.neededIncoming).toBe(60);
    expect(pc.projectedDelivered).toBe(105);
    // 60 Leads in 11 Tagen × 20 € ≈ 109 €/Tag → nahe am aktuellen Budget.
    const d = decide(pc.steerLeads, pc.steerGoal);
    expect(d.setStatus).toBeNull();
    expect(["none", "increase"]).toContain(d.action);
  });

  it("zu wenig Daten für die Quote → 1:1 angenommen, plausibel", () => {
    const pc = deliveryPacing({
      ...base,
      incomingMtd: 5,
      recentIncoming: 5,
      recentDelivered: 1,
      customers: [{ customerId: "a", goal: 10, delivered: 1 }],
    });
    expect(pc.yieldSource).toBe("default");
    expect(pc.yieldRate).toBe(1);
    expect(pc.plausible).toBe(true);
    expect(pc.neededIncoming).toBe(9);
  });

  it("ohne Fenster-Daten: Quote aus dem Monat", () => {
    const pc = deliveryPacing({ ...base, recentIncoming: 10, recentDelivered: 0, customers: [{ customerId: "a", goal: 100, delivered: 50 }] });
    expect(pc.yieldSource).toBe("mtd");
    expect(pc.yieldRate).toBeCloseTo(0.25);
  });
});

describe("Lieferungs-Pacing: Plausibilitätsschutz", () => {
  const customers: PoolCustomerGoal[] = [
    { customerId: "a", goal: 60, delivered: 60 },
    { customerId: "b", goal: 40, delivered: 40 },
  ];

  it("unplausible Verwertungsquote → halten statt pausieren", () => {
    const pc = deliveryPacing({
      goal: 100,
      customers,
      incomingMtd: 300,
      recentIncoming: 300,
      recentDelivered: 6, // 2 %
      daysElapsed: 20,
      daysTotal: 30,
    });
    expect(pc.plausible).toBe(false);
    expect(pc.problem).toContain("Verwertungsquote 2 %");
    const planned = decide(pc.steerLeads, pc.steerGoal);
    expect(planned.action).toBe("pause");
    const held = holdForImplausible(planned, pc.problem!);
    expect(held.action).toBe("none");
    expect(held.setStatus).toBeNull();
    expect(held.targetBudget).toBeNull();
    expect(held.reason).toContain("nicht pausiert");
  });

  it("Quote über 120 % ist unplausibel", () => {
    const pc = deliveryPacing({ goal: 100, customers, incomingMtd: 50, recentIncoming: 50, recentDelivered: 90, daysElapsed: 20, daysTotal: 30 });
    expect(pc.plausible).toBe(false);
  });

  it("Pool-Lieferung weicht stark von der Summe der Kunden ab → unplausibel", () => {
    const pc = deliveryPacing({
      goal: 100,
      customers,
      incomingMtd: 200,
      recentIncoming: 200,
      recentDelivered: 100,
      poolDeliveredCheck: 40,
      daysElapsed: 20,
      daysTotal: 30,
    });
    expect(pc.plausible).toBe(false);
    expect(pc.problem).toContain("Pool-Lieferung 40");
  });

  it("kleine Abweichung der Pool-Lieferung ist ok", () => {
    const pc = deliveryPacing({
      goal: 100,
      customers,
      incomingMtd: 200,
      recentIncoming: 200,
      recentDelivered: 100,
      poolDeliveredCheck: 104,
      daysElapsed: 20,
      daysTotal: 30,
    });
    expect(pc.plausible).toBe(true);
  });
});
