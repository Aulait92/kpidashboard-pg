// Budget ändern: Preisstufe, Live-Vorschau, Freigaberegel (Werte aus PRICE_LIST).
import { describe, expect, it } from "vitest";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { decideApproval, listFeeFor, needsAcknowledge, previewChange, tierFor, tierSentence, type BudgetContext } from "@/lib/budget-shared";

const [t1, t2, t3] = PRICE_LIST.tiers;
const days = PRICE_LIST.daysPerMonth;
const ctx = (extra: Partial<BudgetContext> = {}): BudgetContext => ({ plan: "software", feeMonthly: t1.monthly, billingInterval: "month", cpl: 6, cplSource: "standard", ...extra });
const one = (daily: number) => [{ product: "TKV", dailyBudget: daily }];

describe("tierFor", () => {
  it("ordnet das Monatsbudget der Stufe aus PRICE_LIST zu (Grenze gehört zur unteren Stufe)", () => {
    expect(tierFor(t1.maxBudget)?.monthly).toBe(t1.monthly);
    expect(tierFor(t1.maxBudget + 1)?.monthly).toBe(t2.monthly);
    expect(tierFor(t2.maxBudget + 1)?.monthly).toBe(t3.monthly);
    expect(tierFor(t2.maxBudget + 1)?.from).toBe(t2.maxBudget);
    expect(tierFor(PRICE_LIST.individualFrom + 1)).toBeNull();
  });
  it("Listenpreis: Stufe + weitere Produkte", () => {
    expect(listFeeFor(1000, 2)).toBe(t1.monthly + PRICE_LIST.extraProductMonthly);
  });
});

describe("previewChange", () => {
  it("rechnet Monatsbudget, Leads und Stufenwechsel nach oben", () => {
    const p = previewChange(one(100), one(110), ctx());
    expect(p.monthlyFrom).toBe(100 * days);
    expect(p.monthlyTo).toBe(110 * days);
    expect(p.leadsTo).toBe(Math.round((110 * days) / 6));
    expect(p.tierChange).toBe(true);
    expect(p.pricing).toBe("list");
    expect(p.feeTo).toBe(t2.monthly);
    expect(tierSentence(p)).toBe(
      `Mit ${(110 * days).toLocaleString("de-DE")} € Werbebudget pro Monat gilt die nächste Betreuungsstufe (${t2.label}): ${t2.monthly.toLocaleString("de-DE")} € statt ${t1.monthly.toLocaleString("de-DE")} € netto im Monat, ab dem nächsten Abrechnungsmonat.`,
    );
  });
  it("Senkung in eine niedrigere Stufe wird ebenso deutlich angezeigt", () => {
    const p = previewChange(one(110), one(50), ctx({ feeMonthly: t2.monthly }));
    expect(p.tierChange).toBe(true);
    expect(p.feeTo).toBe(t1.monthly);
    expect(tierSentence(p)).toContain("niedrigere Betreuungsstufe");
  });
  it("Warnung unter 20 €/Tag (Lead-Garantie)", () => {
    expect(previewChange(one(30), one(15), ctx()).belowGuarantee).toEqual(["TKV"]);
  });
  it("über individualFrom → individuelles Angebot", () => {
    const p = previewChange(one(100), one(Math.ceil(PRICE_LIST.individualFrom / days) + 5), ctx());
    expect(p.overIndividual).toBe(true);
    expect(tierSentence(p)).toContain("individuelles Angebot");
  });
  it("abweichender Preis oder Jahreszahler → individuell, Paket „Nur Betreuung“ ohne Staffel", () => {
    expect(previewChange(one(50), one(60), ctx({ feeMonthly: 800 })).pricing).toBe("individual");
    expect(previewChange(one(50), one(60), ctx({ billingInterval: "year" })).pricing).toBe("individual");
    const s = previewChange(one(50), one(200), ctx({ plan: "service", feeMonthly: PRICE_LIST.serviceOnlyMonthly }));
    expect(s.pricing).toBe("fixed");
    expect(s.tierChange).toBe(false);
    expect(s.feeTo).toBe(PRICE_LIST.serviceOnlyMonthly);
  });
});

describe("decideApproval (Ole 11.11.: immer sofort, nur informieren)", () => {
  it("Erhöhung und Senkung ohne Stufenwechsel: sofort, kein Preiswechsel", () => {
    for (const [a, b] of [[50, 60], [60, 40]]) {
      const p = previewChange(one(a), one(b), ctx());
      expect(decideApproval(p, ctx())).toEqual({ kind: "apply", price: "none" });
      expect(needsAcknowledge(p)).toBe(false);
    }
  });
  it("Stufenwechsel (hoch und runter) bei Listenpreis: sofort, Preis automatisch, Bestätigung Pflicht", () => {
    const up = previewChange(one(100), one(110), ctx());
    expect(decideApproval(up, ctx())).toEqual({ kind: "apply", price: "auto" });
    expect(needsAcknowledge(up)).toBe(true);
    const down = previewChange(one(110), one(50), ctx({ feeMonthly: t2.monthly }));
    expect(decideApproval(down, ctx({ feeMonthly: t2.monthly }))).toEqual({ kind: "apply", price: "auto" });
  });
  it("individuelle Konditionen: Budget sofort, Preis von Hand – nur bei Stufenwechsel", () => {
    const c = ctx({ feeMonthly: 800 });
    expect(decideApproval(previewChange(one(100), one(110), c), c)).toEqual({ kind: "apply", price: "manual", reason: "individual_terms" });
    expect(decideApproval(previewChange(one(50), one(60), c), c)).toEqual({ kind: "apply", price: "none" });
    const y = ctx({ billingInterval: "year" });
    expect(decideApproval(previewChange(one(100), one(110), y), y)).toMatchObject({ price: "manual", reason: "annual" });
  });
  it("über individualFrom: Anfrage statt Selbstbedienung", () => {
    const p = previewChange(one(100), one(400), ctx());
    expect(decideApproval(p, ctx())).toEqual({ kind: "request", reason: "individual_budget" });
    expect(needsAcknowledge(p)).toBe(false);
  });
});
