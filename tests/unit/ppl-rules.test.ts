import { describe, expect, it } from "vitest";
import { excludedByRules, isWeak, pickCandidate, plzMatches, rejectReason, type PoolLeadFacts, type SubscriptionRules } from "@/lib/ppl/rules";
import { weekStart } from "@/lib/ppl/periods";

const rules = (r: Partial<SubscriptionRules> = {}): SubscriptionRules => ({
  plzRanges: null, acceptWeak: true, weakThreshold: null, acceptCivilServants: true, onlyWeak: false, scoreFloor: null,
  insurerInclude: [], insurerExclude: [], excludeRules: null, ...r,
});
const facts = (f: Partial<PoolLeadFacts> = {}): PoolLeadFacts => ({
  plz: "80331", insurer: "Allianz", contribution: 900, civilServant: false, smsVerified: false, score: null, answers: {}, ...f,
});

describe("Pay-per-Lead-Regeln", () => {
  it("PLZ-Bereiche wie bei Heinrich von Kleist", () => {
    const r = "67300-67499|68700-69299|70000-72199|74700-77999";
    expect(plzMatches(r, "70173")).toBe(true);
    expect(plzMatches(r, "69300")).toBe(false);
    expect(plzMatches("80000-85999", "80331")).toBe(true);
    expect(plzMatches("80000-85999", null)).toBe(false);
    expect(plzMatches("", null)).toBe(true);
    expect(plzMatches("12345", "12345")).toBe(true);
  });

  it("schwach: Beamte immer, sonst Beitrag unter Grenze", () => {
    expect(isWeak({ contribution: 650, civilServant: false })).toBe(true);
    expect(isWeak({ contribution: 650, civilServant: false }, 450)).toBe(false);
    expect(isWeak({ contribution: 2000, civilServant: true }, 450)).toBe(true);
    expect(isWeak({ contribution: null, civilServant: false })).toBe(false);
  });

  it("Filter je Bezug", () => {
    expect(rejectReason(rules({ acceptWeak: false }), facts({ contribution: 500 }))).toBe("schwach");
    expect(rejectReason(rules({ acceptWeak: false, weakThreshold: 450 }), facts({ contribution: 500 }))).toBeNull();
    expect(rejectReason(rules({ insurerExclude: ["Debeka", "HUK"] }), facts({ insurer: "HUK-Coburg" }))).toBe("Gesellschaft ausgeschlossen");
    expect(rejectReason(rules({ insurerInclude: ["Allianz", "AXA"] }), facts({ insurer: "Signal Iduna" }))).toBe("Gesellschaft nicht eingeschlossen");
    expect(rejectReason(rules({ plzRanges: "80000-85999" }), facts({ plz: "10115" }))).toBe("PLZ");
    expect(rejectReason(rules({ scoreFloor: 50 }), facts({ score: 40 }))).toBe("Score");
    expect(excludedByRules("Tarif=Basistarif,Standardtarif|Wohnsitz=Ausland", { tarif: "Standardtarif" })).toBe("Regel Tarif");
  });

  it("d'Hondt verteilt im Verhältnis der Kontingente, Test hat Vorrang", () => {
    const a = { id: "a", quota: 100, delivered: 0 };
    const b = { id: "b", quota: 50, delivered: 0 };
    const tally: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 30; i++) {
      const p = pickCandidate([a, b])!;
      tally[p.id]++;
      p.delivered++;
    }
    expect(tally).toEqual({ a: 20, b: 10 });
    expect(pickCandidate([{ id: "x", quota: 5, delivered: 5 }])).toBeNull();
    const t = { id: "t", quota: 10, delivered: 0, test: { quantity: 10, delivered: 0, days: null, startedDaysAgo: 0 } };
    expect(pickCandidate([{ id: "big", quota: 1000, delivered: 0 }, t])!.id).toBe("t");
  });

  it("Woche beginnt Montag 00:00 Berlin", () => {
    expect(weekStart(new Date("2026-11-12T10:00:00Z")).toISOString()).toBe("2026-11-08T23:00:00.000Z");
    expect(weekStart(new Date("2026-11-08T22:30:00Z")).toISOString()).toBe("2026-11-01T23:00:00.000Z");
    expect(weekStart(new Date("2026-11-12T10:00:00Z"), 1).toISOString()).toBe("2026-11-15T23:00:00.000Z");
  });
});
