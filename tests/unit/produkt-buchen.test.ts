import { describe, expect, it } from "vitest";
import { PRICE_LIST } from "@/lib/offer-pricing";
import type { BudgetContext } from "@/lib/budget-shared";
import { bookingSentence, DEFAULT_CATALOG, hasGuarantee, matchesCatalog, previewBooking } from "@/lib/produkt-buchen-shared";

const [t1, t2] = PRICE_LIST.tiers;
const ctx = (o: Partial<BudgetContext> = {}): BudgetContext => ({ plan: "software", feeMonthly: t1.monthly, billingInterval: "month", cpl: 6, cplSource: "standard", ...o });
const tkv = [{ product: "Katzenversicherung (TKV)", dailyBudget: 30 }];
const add = (daily: number) => ({ product: "Privatschutz", dailyBudget: daily });

describe("Produkt buchen: Vorschau", () => {
  it("Listenpreis: Einrichtung + Aufschlag je weiterem Produkt, gleiche Stufe", () => {
    const p = previewBooking(tkv, add(30), ctx(), 12);
    expect(p.setupFee).toBe(PRICE_LIST.extraProductSetupSelfService);
    expect(p.setupFee).toBe(0); // Ole, 12.11.: Einrichtung bei Selbstbuchung kostenlos
    expect(p.extraMonthly).toBe(PRICE_LIST.extraProductMonthly);
    expect(p.monthlyFrom).toBe(900);
    expect(p.monthlyTo).toBe(1800);
    expect(p.tierChange).toBe(false);
    expect(p.bookingPricing).toBe("list");
    expect(p.feeTo).toBe(t1.monthly + PRICE_LIST.extraProductMonthly);
    expect(p.leadsNew).toBe(75);
    expect(p.guarantee).toBe(false);
    expect(bookingSentence(p)).toBeNull();
  });

  it("erkennt den Stufenwechsel und nennt ihn deutlich", () => {
    const p = previewBooking([{ product: "Katzenversicherung (TKV)", dailyBudget: 90 }], add(20), ctx(), null);
    expect(p.tierChange).toBe(true);
    expect(p.tierTo?.monthly).toBe(t2.monthly);
    expect(p.feeTo).toBe(t2.monthly + PRICE_LIST.extraProductMonthly);
    expect(bookingSentence(p)).toContain("nächste Betreuungsstufe");
    expect(p.leadsNew).toBeNull();
  });

  it("individuelle Konditionen, Jahreszahler und Nur Betreuung → Preis von Hand", () => {
    expect(previewBooking(tkv, add(30), ctx({ feeMonthly: 850 }), null)).toMatchObject({ bookingPricing: "individual", manualReason: "individual_terms", feeTo: null });
    expect(previewBooking(tkv, add(30), ctx({ billingInterval: "year" }), null).manualReason).toBe("annual");
    expect(previewBooking(tkv, add(30), ctx({ plan: "service", feeMonthly: 700 }), null).manualReason).toBe("service_plan");
  });

  it("über individualFrom → Anfrage", () => {
    const p = previewBooking([{ product: "Katzenversicherung (TKV)", dailyBudget: 300 }], add(100), ctx(), null);
    expect(p.overIndividual).toBe(true);
  });
});

describe("Produkt buchen: Katalog", () => {
  it("Standard: Ole-Liste buchbar, nur die Katze bewährt", () => {
    expect(DEFAULT_CATALOG.filter((c) => c.enabled).map((c) => c.key)).toEqual(["tkv-katze", "tkv-hund", "tkv-pferd", "privatschutz", "sterbegeld", "kindersparplan"]);
    expect(DEFAULT_CATALOG.filter((c) => c.proven).map((c) => c.key)).toEqual(["tkv-katze"]);
    expect(DEFAULT_CATALOG.find((c) => c.key === "tkv-katze")?.proven).toBe(true);
  });

  it("erkennt vorhandene Produkte unter anderen Namen", () => {
    const katze = DEFAULT_CATALOG.find((c) => c.key === "tkv-katze")!;
    const hund = DEFAULT_CATALOG.find((c) => c.key === "tkv-hund")!;
    expect(matchesCatalog(katze, "Tierkrankenversicherung")).toBe(true);
    expect(matchesCatalog(katze, "Katzenversicherung (TKV)")).toBe(true);
    expect(matchesCatalog(hund, "Katzenversicherung (TKV)")).toBe(false);
    expect(matchesCatalog(hund, "Hundekrankenversicherung")).toBe(true);
  });

  it("Garantien nur für die Katzenversicherung", () => {
    expect(hasGuarantee("Katzenversicherung (TKV)")).toBe(true);
    expect(hasGuarantee("Hundekrankenversicherung")).toBe(false);
    expect(hasGuarantee("Privatschutz")).toBe(false);
  });
});
