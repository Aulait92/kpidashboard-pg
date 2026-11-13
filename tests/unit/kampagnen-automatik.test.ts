import { describe, expect, it } from "vitest";
import { budgetOnlyBody, namePrefix } from "@/lib/kampagnen/budget-sync";
import { detectFatigue, type AdStats } from "@/lib/kampagnen/refresh";
import { DEFAULT_AUTOMATION } from "@/lib/kampagnen/settings";

// Kampagnen-Automatik: Budget-Body ohne Status, Benennungsschema, Ermüdungserkennung.

const ad = (p: Partial<AdStats>): AdStats => ({
  adId: "a",
  adName: "Anzeige",
  adSetId: "s1",
  createdTime: "2026-10-01T00:00:00Z",
  spend: 60,
  impressions: 5000,
  clicks: 100,
  frequency: 1.8,
  leads: 6,
  firstWeek: { impressions: 5000, clicks: 100 },
  ...p,
});

describe("Kampagnen-Automatik: Budget", () => {
  it("setzt nur daily_budget in Cent – nie einen Status", () => {
    const b = budgetOnlyBody(42.5);
    expect(b).toEqual({ daily_budget: 4250 });
    expect(Object.keys(b)).not.toContain("status");
  });
  it("Benennungsschema PG | Kunde | Produkt | (Groß-/Kleinschreibung egal)", () => {
    expect(namePrefix("Agentur Muster", "Katzenversicherung (TKV)")).toBe("pg | agentur muster | katzenversicherung (tkv) |");
  });
});

describe("Kampagnen-Automatik: müde Anzeigen", () => {
  const th = DEFAULT_AUTOMATION;

  it("gesunde Anzeigen sind nicht müde", () => {
    expect(detectFatigue([ad({ adId: "a" }), ad({ adId: "b" })], th)).toEqual([]);
  });

  it("Frequenz über der Schwelle", () => {
    const r = detectFatigue([ad({ adId: "a", frequency: 3.4 }), ad({ adId: "b" })], th);
    expect(r.map((f) => f.adId)).toEqual(["a"]);
    expect(r[0].reasons[0]).toMatch(/Frequenz 3\.4/);
  });

  it("CTR mindestens 30 % unter den ersten 7 Tagen", () => {
    // erste Woche 2 %, jetzt 1,3 % → −35 %
    const r = detectFatigue([ad({ adId: "a", clicks: 65, impressions: 5000 }), ad({ adId: "b" })], th);
    expect(r.map((f) => f.adId)).toEqual(["a"]);
    expect(r[0].reasons.join()).toMatch(/CTR/);
    // −20 % reicht nicht
    expect(detectFatigue([ad({ adId: "a", clicks: 80 }), ad({ adId: "b" })], th)).toEqual([]);
  });

  it("CTR-Vergleich nur mit genug Impressionen", () => {
    expect(detectFatigue([ad({ adId: "a", clicks: 5, impressions: 500 })], th)).toEqual([]);
  });

  it("Leadpreis mindestens 40 % über dem Kampagnenschnitt bei genug Ausgaben", () => {
    // Schnitt: (60+60+120)/(6+6+6) = 13,33 €; Anzeige c: 20 € → +50 %
    const r = detectFatigue([ad({ adId: "a" }), ad({ adId: "b" }), ad({ adId: "c", spend: 120, leads: 6 })], th);
    expect(r.map((f) => f.adId)).toEqual(["c"]);
    expect(r[0].reasons.join()).toMatch(/Leadpreis/);
  });

  it("ohne Lead trotz Ausgaben zählt als müde, unter Mindestausgaben nicht", () => {
    expect(detectFatigue([ad({ adId: "a" }), ad({ adId: "b", spend: 70, leads: 0 })], th).map((f) => f.adId)).toEqual(["b"]);
    expect(detectFatigue([ad({ adId: "a" }), ad({ adId: "b", spend: 30, leads: 0 })], th)).toEqual([]);
  });
});
