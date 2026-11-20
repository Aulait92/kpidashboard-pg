import { describe, expect, it } from "vitest";
import { computeMaxCpl } from "@/lib/media-buyer-preisgrenze";
import {
  applyRegionGuard,
  evaluateRegionCase,
  openPriceAndTax,
  regionOnlyOpen,
  usableShare,
  type OpenSubscription,
} from "@/lib/media-buyer-regionen";
import type { GuardableDecision } from "@/lib/media-buyer-lernphase";

const hvk: OpenSubscription = { customerId: "hvk", name: "Heinrich von Kleist", open: 40, plzRanges: "10000-14999|80000-81999", price: 50, taxFree: true };
const voll: OpenSubscription = { customerId: "x", name: "Makler X", open: 0, plzRanges: null, price: 60, taxFree: false };

// Break-even HvK: 50 € × (1 − 10 %) / (1 + 0,19) = 37,82 €
const breakEven = computeMaxCpl({ poolOverride: null, envOverride: null, leadPrices: [50], stornoRate: 0.1, defaultStorno: 0.1, taxFreeShare: 1 }).value;

describe("Regionen-Rechnung", () => {
  it("erkennt: nur regionale Bezüge offen", () => {
    expect(regionOnlyOpen([hvk, voll])).toEqual([hvk]);
    expect(regionOnlyOpen([hvk, { ...voll, open: 5 }])).toBeNull(); // bundesweiter Bezug noch offen
    expect(regionOnlyOpen([{ ...hvk, open: 0 }, voll])).toBeNull(); // nichts offen
  });

  it("Anteil verwertbarer Leads aus den PLZ (ohne PLZ = nicht verwertbar)", () => {
    expect(usableShare(["10115", "80331", "50667", null], [hvk.plzRanges!])).toBe(0.5);
    expect(usableShare([], [hvk.plzRanges!])).toBeNull();
  });

  it("Preis und Steueranteil der offenen Bezüge", () => {
    expect(openPriceAndTax([hvk])).toEqual({ price: 50, taxFreeShare: 1 });
  });

  it("unter Break-even: weiterlaufen", () => {
    expect(breakEven).toBe(37.82);
    const c = evaluateRegionCase({ open: [hvk], cpl: 20, share: 0.6, sample: 200, breakEven })!;
    expect(c.costPerUsable).toBeCloseTo(33.33, 2);
    expect(c.verdict).toBe("weiter");
  });

  it("über Break-even: halten bzw. senken, mit Empfehlung", () => {
    const halten = evaluateRegionCase({ open: [hvk], cpl: 20, share: 0.5, sample: 200, breakEven })!;
    expect(halten.costPerUsable).toBe(40);
    expect(halten.verdict).toBe("halten");
    const senken = evaluateRegionCase({ open: [hvk], cpl: 20, share: 0.4, sample: 200, breakEven })!;
    expect(senken.verdict).toBe("senken");
    expect(senken.message).toContain("Nur Heinrich von Kleist offen: bundesweit kostet ein verwertbarer Lead 50,00");
    expect(senken.message).toContain("Break-even 37,82");
    expect(senken.message).toContain("regionale Kampagne");
    expect(senken.message).not.toMatch(/[–—]/);
  });

  it("zu wenig Leads oder kein CPL: keine Bewertung", () => {
    expect(evaluateRegionCase({ open: [hvk], cpl: 20, share: 0.4, sample: 10, breakEven })).toBeNull();
    expect(evaluateRegionCase({ open: [hvk], cpl: null, share: 0.4, sample: 200, breakEven })).toBeNull();
  });

  const dec = (action: GuardableDecision["action"], targetBudget: number | null, setStatus: GuardableDecision["setStatus"] = null): GuardableDecision => ({
    action,
    reason: "Plan",
    targetBudget,
    setStatus,
  });
  const check = (share: number) => evaluateRegionCase({ open: [hvk], cpl: 20, share, sample: 200, breakEven });

  it("Budget-Regel: halten blockt Erhöhung, senken geht einen Schritt runter, Pause bleibt", () => {
    expect(applyRegionGuard({ decision: dec("increase", 120), currentBudget: 100, minBudget: 5, check: check(0.5) }).decision).toMatchObject({ action: "none", targetBudget: null });
    expect(applyRegionGuard({ decision: dec("increase", 120), currentBudget: 100, minBudget: 5, check: check(0.4) }).decision).toMatchObject({ action: "decrease", targetBudget: 80 });
    expect(applyRegionGuard({ decision: dec("decrease", 60), currentBudget: 100, minBudget: 5, check: check(0.4) }).changed).toBe(false);
    expect(applyRegionGuard({ decision: dec("pause", null, "PAUSED"), currentBudget: 100, minBudget: 5, check: check(0.4) }).changed).toBe(false);
    expect(applyRegionGuard({ decision: dec("increase", 120), currentBudget: 100, minBudget: 5, check: check(0.6) }).changed).toBe(false);
  });
});
