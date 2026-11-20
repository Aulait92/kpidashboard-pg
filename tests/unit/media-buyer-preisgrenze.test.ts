import { describe, expect, it } from "vitest";
import {
  applyMonthlyCap,
  applyPriceGuard,
  computeMaxCpl,
  shouldAlertCpl,
  stornoRate,
} from "@/lib/media-buyer-preisgrenze";
import type { GuardableDecision } from "@/lib/media-buyer-lernphase";

const inc = (t: number, action: GuardableDecision["action"] = "increase"): GuardableDecision => ({
  action,
  reason: "geplant",
  targetBudget: t,
  setStatus: null,
});

describe("Höchstpreis", () => {
  it("Break-even aus Ø Lead-Preis × (1 − Storno)", () => {
    expect(computeMaxCpl({ poolOverride: null, envOverride: null, leadPrices: [50, 70], stornoRate: 0.2, defaultStorno: 0.1 }))
      .toEqual({ value: 48, source: "break-even" });
    expect(computeMaxCpl({ poolOverride: null, envOverride: null, leadPrices: [60], stornoRate: null, defaultStorno: 0.1 }).value).toBe(54);
  });
  it("Pool-Feld vor Env vor Break-even", () => {
    expect(computeMaxCpl({ poolOverride: 40, envOverride: 45, leadPrices: [60], stornoRate: 0, defaultStorno: 0.1 }).source).toBe("pool");
    expect(computeMaxCpl({ poolOverride: null, envOverride: 45, leadPrices: [60], stornoRate: 0, defaultStorno: 0.1 }).value).toBe(45);
  });
  it("ohne Lead-Preis kein Höchstpreis", () => {
    expect(computeMaxCpl({ poolOverride: null, envOverride: null, leadPrices: [], stornoRate: 0, defaultStorno: 0.1 }).value).toBeNull();
  });
  it("Stornoquote erst ab Mindestmenge", () => {
    expect(stornoRate(10, 2, 20)).toBeNull();
    expect(stornoRate(40, 4, 20)).toBe(0.1);
  });
});

describe("Preisgrenze", () => {
  it("erhöht nur, wenn der CPL unter dem Höchstpreis liegt", () => {
    expect(applyPriceGuard({ decision: inc(120), currentBudget: 100, costPerLead: 30, maxCpl: 40 }).blocked).toBe(false);
    const r = applyPriceGuard({ decision: inc(120), currentBudget: 100, costPerLead: 45, maxCpl: 40 });
    expect(r.blocked).toBe(true);
    expect(r.overMax).toBe(true);
    expect(r.decision.targetBudget).toBeNull();
    expect(r.decision.reason).toContain("Preisgrenze");
  });
  it("Endspurt-Boost nie über dem Höchstpreis", () => {
    const r = applyPriceGuard({ decision: inc(300, "boost"), currentBudget: 100, costPerLead: 45, maxCpl: 40 });
    expect(r.decision.action).toBe("none");
    expect(r.decision.reason).toContain("kein Endspurt-Boost");
  });
  it("Höchstpreis fehlt: nicht erhöhen, senken erlaubt", () => {
    expect(applyPriceGuard({ decision: inc(120), currentBudget: 100, costPerLead: 30, maxCpl: null }).decision.reason).toContain("Höchstpreis fehlt");
    const down = applyPriceGuard({ decision: { ...inc(80), action: "decrease" }, currentBudget: 100, costPerLead: 30, maxCpl: null });
    expect(down.decision.targetBudget).toBe(80);
  });
  it("Push nach 3 Läufen in Folge, danach nur alle 6", () => {
    expect([1, 2, 3, 4, 9].map((n) => shouldAlertCpl(n, 3))).toEqual([false, false, true, false, true]);
  });
});

describe("Monats-Gesamtgrenze", () => {
  it("begrenzt Erhöhungen auf den Spielraum", () => {
    // 3000 € Grenze, 2000 ausgegeben, 10 Tage → 100 €/Tag, Rate 80 → +20 erlaubt
    const r = applyMonthlyCap({ decision: inc(150), currentBudget: 100, cap: 3000, spentMtd: 2000, dailyRate: 80, daysLeft: 10 });
    expect(r.decision.targetBudget).toBe(120);
    expect(r.limited).toBe(true);
  });
  it("pausiert, wenn die Grenze erreicht ist", () => {
    const r = applyMonthlyCap({ decision: inc(150), currentBudget: 100, cap: 3000, spentMtd: 3000, dailyRate: 80, daysLeft: 10 });
    expect(r.decision.setStatus).toBe("PAUSED");
  });
});
