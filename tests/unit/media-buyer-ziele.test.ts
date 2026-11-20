import { describe, expect, it } from "vitest";
import {
  aggregatePoolGoal,
  customersBehind,
  goalSourceFromEnv,
  holdForSourceSwitch,
  limitForSourceSwitch,
  subscriptionMonthGoal,
  type GoalOrder,
  type GoalSubscription,
  type GoalWindow,
} from "@/lib/media-buyer-ziele";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
// Freitag, 27.11.2026; Monat endet am 01.12. (exklusiv).
const W: GoalWindow = { now: new Date("2026-11-27T12:00:00Z"), monthStart: d("2026-11-01"), monthEnd: d("2026-12-01") };

const order = (start: string, end: string, o: Partial<GoalOrder> = {}): GoalOrder => ({
  periodStart: d(start),
  periodEnd: d(end),
  quantity: 10,
  status: "paid",
  autoRenew: false,
  delivered: 0,
  ...o,
});

const sub = (o: Partial<GoalSubscription> = {}): GoalSubscription => ({
  id: "s1",
  customerId: "c1",
  productKey: "PKV-Tarifoptimierung",
  active: true,
  dormant: false,
  status: "live",
  period: "week",
  goal: null,
  testQuantity: null,
  startDate: null,
  price: 50,
  taxFree: false,
  areas: [],
  deliveredMonth: 0,
  deliveredBefore: 0,
  orders: [],
  ...o,
});

describe("Zielableitung je Bezug", () => {
  it("Wochenbestellung: Rest der bezahlten Woche zählt voll", () => {
    const g = subscriptionMonthGoal(sub({ deliveredMonth: 30, orders: [order("2026-11-23", "2026-11-30", { delivered: 4 })] }), W);
    expect(g.fest).toBe(6);
    expect(g.erwartet).toBe(0);
    expect(g.soll).toBe(36);
  });

  it("Wochenbestellung über die Monatsgrenze zählt nur anteilig (1 von 7 Tagen)", () => {
    const g = subscriptionMonthGoal(
      sub({
        orders: [
          order("2026-11-23", "2026-11-30", { delivered: 4 }),
          order("2026-11-30", "2026-12-07", { quantity: 14, autoRenew: true }),
        ],
      }),
      W,
    );
    expect(g.fest).toBeCloseTo(6 + 2, 6);
    // Die jüngste Bestellung reicht schon über das Monatsende: keine weitere Verlängerung.
    expect(g.erwartet).toBe(0);
  });

  it("Verlängerung (jede Woche wiederholen) wird für die Resttage erwartet, abschaltbar", () => {
    const s = sub({ orders: [order("2026-11-23", "2026-11-30", { autoRenew: true })] });
    expect(subscriptionMonthGoal(s, W).erwartet).toBeCloseTo(10 / 7, 6);
    expect(subscriptionMonthGoal(s, { ...W, projectRenewals: false }).erwartet).toBe(0);
  });

  it("unbezahlte, fehlgeschlagene und stornierte Bestellungen zählen nicht", () => {
    for (const status of ["open", "failed", "cancelled"]) {
      const g = subscriptionMonthGoal(sub({ orders: [order("2026-11-23", "2026-11-30", { status, autoRenew: true })] }), W);
      expect(g.fest + g.erwartet).toBe(0);
    }
    // Lastschrift läuft (processing) zählt wie bezahlt.
    expect(subscriptionMonthGoal(sub({ orders: [order("2026-11-23", "2026-11-30", { status: "processing" })] }), W).fest).toBe(10);
  });

  it("abgelaufene Bestellung zählt nicht mehr", () => {
    expect(subscriptionMonthGoal(sub({ orders: [order("2026-11-16", "2026-11-23", { delivered: 2 })] }), W).fest).toBe(0);
  });

  it("pausierter/gekündigter Bezug und ruhendes Konto: nichts offen, Geliefertes bleibt im Soll", () => {
    const orders = [order("2026-11-23", "2026-11-30", { autoRenew: true })];
    for (const o of [{ active: false }, { dormant: true }]) {
      const g = subscriptionMonthGoal(sub({ ...o, deliveredMonth: 12, orders }), W);
      expect(g).toMatchObject({ soll: 12, geliefert: 12, fest: 0, erwartet: 0 });
    }
  });

  it("Großabnehmer mit Monatsziel: Ziel minus Geliefertes, Start mitten im Monat anteilig", () => {
    expect(subscriptionMonthGoal(sub({ period: "month", goal: 100, deliveredMonth: 60 }), W).fest).toBe(40);
    // Start 16.11.: 15 von 30 Tagen übrig → 50, davon 10 geliefert.
    const g = subscriptionMonthGoal(sub({ period: "month", goal: 100, startDate: d("2026-11-16"), deliveredMonth: 10 }), W);
    expect(g.fest).toBeCloseTo(40, 6);
    expect(g.soll).toBeCloseTo(50, 6);
  });

  it("Großabnehmer ohne Ziel: Summe der Gebietsmengen", () => {
    const g = subscriptionMonthGoal(
      sub({ period: "month", areas: [{ quantity: 30, period: "month" }, { quantity: 20, period: null }], deliveredMonth: 5 }),
      W,
    );
    expect(g.fest).toBe(45);
  });

  it("Einmal-Menge: Gesamt minus alles bisher Gelieferte", () => {
    expect(subscriptionMonthGoal(sub({ period: "once", goal: 50, deliveredBefore: 30, deliveredMonth: 5 }), W).fest).toBe(15);
  });

  it("Bezug startet erst nächsten Monat: kein Soll", () => {
    expect(subscriptionMonthGoal(sub({ period: "month", goal: 100, startDate: d("2026-12-03") }), W).soll).toBe(0);
  });
});

describe("Pool-Ziel", () => {
  it("kein Bezug: Ziel 0, kein Preis", () => {
    expect(aggregatePoolGoal([])).toMatchObject({ goal: 0, leadPrice: null, taxFreeShare: 0, customers: [] });
  });

  it("Summe, Lead-Preis und Steueranteil gewichtet mit dem Soll", () => {
    const a = subscriptionMonthGoal(sub({ id: "a", customerId: "A", period: "month", goal: 30, price: 50, taxFree: true }), W);
    const b = subscriptionMonthGoal(sub({ id: "b", customerId: "B", period: "month", goal: 10, price: 30 }), W);
    const p = aggregatePoolGoal([a, b]);
    expect(p.goal).toBe(40);
    expect(p.leadPrice).toBe(45);
    expect(p.taxFreeShare).toBe(0.75);
    expect(p.customers.map((c) => [c.customerId, c.goal])).toEqual([
      ["A", 30],
      ["B", 10],
    ]);
  });
});

describe("Rückstand je Kunde", () => {
  const customers = [
    { customerId: "A", goal: 60, delivered: 70 },
    { customerId: "B", goal: 40, delivered: 30 },
  ];
  it("Pool-Summe erreicht, ein Kunde unter 95 % → gemeldet", () => {
    expect(customersBehind({ goal: 100, leadsMtd: 100, customers }).map((c) => c.customerId)).toEqual(["B"]);
  });
  it("Pool-Summe noch nicht erreicht → keine Meldung", () => {
    expect(customersBehind({ goal: 100, leadsMtd: 99, customers })).toEqual([]);
  });
});

describe("Zielquelle", () => {
  it("Standard software, airtable per Env", () => {
    expect(goalSourceFromEnv(undefined)).toBe("software");
    expect(goalSourceFromEnv(" Airtable ")).toBe("airtable");
    expect(goalSourceFromEnv("quatsch")).toBe("software");
  });

  it("Wechsel mitten im Monat mit anderem Ziel → Schonlauf", () => {
    const last = { goalSource: null, goal: 300, at: d("2026-11-26") };
    expect(holdForSourceSwitch({ source: "software", goal: 420, last, monthStart: W.monthStart }).hold).toBe(true);
    expect(holdForSourceSwitch({ source: "software", goal: 300, last, monthStart: W.monthStart }).hold).toBe(false);
    expect(holdForSourceSwitch({ source: "airtable", goal: 420, last, monthStart: W.monthStart }).hold).toBe(false);
    expect(holdForSourceSwitch({ source: "software", goal: 420, last: { ...last, at: d("2026-10-30") }, monthStart: W.monthStart }).hold).toBe(false);
  });

  it("Schonlauf: Schritt höchstens ±20 %, kein Pausieren", () => {
    const up = { action: "increase" as const, reason: "x", targetBudget: 200, setStatus: null };
    expect(limitForSourceSwitch({ decision: up, currentBudget: 100, note: "n" }).decision.targetBudget).toBe(120);
    const pause = { action: "pause" as const, reason: "x", targetBudget: null, setStatus: "PAUSED" as const };
    expect(limitForSourceSwitch({ decision: pause, currentBudget: 100, note: "n" }).decision).toMatchObject({ action: "none", setStatus: null });
    const small = { action: "decrease" as const, reason: "x", targetBudget: 90, setStatus: null };
    expect(limitForSourceSwitch({ decision: small, currentBudget: 100, note: "n" }).changed).toBe(false);
  });
});
