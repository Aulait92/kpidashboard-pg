// Neue Listenpreise Betreuung + Software (Ole, 18.11.2026): 990/1.390/1.790 € statt 1.000/1.400/1.800 €.
// Geprüft: Staffel, Vorauszahlung 6/12 Monate, Regel für offene Angebote (listenpreisUmstellung, gleiche Regel wie die
// Migration 20261118999500_listenpreise_990) und dass Kunden zum alten Listenpreis ihre Staffel behalten.
import { describe, expect, it } from "vitest";
import {
  betreuungsSatz,
  computeOfferPrice,
  eur,
  eurText,
  preisstufeBereich,
  LISTENPREISE_ALT,
  listenMonatspreis,
  listenpreisUmstellung,
  PRICE_LIST,
  tierStaffelText,
  vorauszahlungBetraege,
  type ListenpreisUmstellungInput,
} from "@/lib/offer-pricing";
import { decideApproval, previewChange, tierSentence, type BudgetContext } from "@/lib/budget-shared";
import { previewBooking } from "@/lib/produkt-buchen-shared";
import { paketDaten, verkaufsFolien, type AngebotFuerFolien } from "@/lib/vertrieb/verkaufspraesentation";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const katze = (dailyBudget = 30) => [{ name: "TKV-Katze", dailyBudget }];

describe("Staffel seit 18.11.2026", () => {
  it("990 / 1.390 / 1.790 € netto, Budgetgrenzen unverändert", () => {
    expect(PRICE_LIST.tiers.map((t) => [t.maxBudget, t.monthly])).toEqual([
      [3000, 990],
      [6000, 1390],
      [10000, 1790],
    ]);
    expect(LISTENPREISE_ALT.map((t) => [t.maxBudget, t.monthly])).toEqual([
      [3000, 1000],
      [6000, 1400],
      [10000, 1800],
    ]);
    expect(PRICE_LIST.individualFrom).toBe(10000);
  });

  it("Angebot: Stufe je Werbebudget, weitere Produkte +350 €, über 10.000 € individuell", () => {
    expect(computeOfferPrice({ term: "12m", products: katze(100) }).monthlyFee).toBe(990); // 3.000 € = noch Stufe 1
    expect(computeOfferPrice({ term: "12m", products: katze(101) }).monthlyFee).toBe(1390);
    expect(computeOfferPrice({ term: "12m", products: katze(300) }).monthlyFee).toBe(1790);
    expect(computeOfferPrice({ term: "12m", products: katze(334) }).monthlyFee).toBeNull();
    expect(computeOfferPrice({ term: "12m", products: [...katze(30), { name: "Hund", dailyBudget: 20 }] }).monthlyFee).toBe(990 + 350);
    expect(listenMonatspreis(3000, 1)).toBe(990);
    expect(listenMonatspreis(3000, 1, LISTENPREISE_ALT)).toBe(1000);
  });

  it("Preisstaffel im Angebot nennt die neuen Preise, auf Wunsch die alte Staffel (angenommene Altangebote)", () => {
    const neu = tierStaffelText().replace(/ /g, " ");
    expect(neu).toContain("bis 3.000 €: 990 €; über 3.000 bis 6.000 €: 1.390 €; über 6.000 bis 10.000 €: 1.790 €");
    const alt = tierStaffelText(LISTENPREISE_ALT).replace(/ /g, " ");
    expect(alt).toContain("bis 3.000 €: 1.000 €; über 3.000 bis 6.000 €: 1.400 €; über 6.000 bis 10.000 €: 1.800 €");
  });
});

describe("Vorauszahlung rechnet mit den neuen Preisen", () => {
  it("12 Monate: 10 × 990 € = 9.900 €, 2 Monate (1.980 €) geschenkt", () => {
    const p = computeOfferPrice({ term: "12m", products: katze(), annual: true });
    expect(p).toMatchObject({ monthlyTotal: 990, annual: true, annualTotal: 9900, annualSavings: 1980, prepayMonths: 12, prepayFreeMonths: 2 });
  });

  it("6 Monate: 5 × 990 € = 4.950 €, 1 Monat (990 €) geschenkt", () => {
    const p = computeOfferPrice({ term: "6m", products: katze(), annual: true });
    expect(p).toMatchObject({ monthlyTotal: 990, annual: true, annualTotal: 4950, annualSavings: 990, prepayMonths: 6, prepayFreeMonths: 1 });
    expect(vorauszahlungBetraege(990, "6m")).toEqual({ total: 4950, savings: 990, freeMonths: 1, months: 6, paidMonths: 5 });
  });

  it("zweite Stufe mit Modul und weiterem Verkäufer: 1.390 + 149 + 49 = 1.588 € → jährlich 15.880 €", () => {
    const p = computeOfferPrice({ term: "12m", products: katze(150), seats: 4, bestandModule: true, annual: true });
    expect(p).toMatchObject({ monthlyFee: 1390, monthlyTotal: 1588, annualTotal: 15880, annualSavings: 3176 });
  });
});

describe("Offene Angebote: alter Listenpreis → neuer Listenpreis", () => {
  const offen = (over: Partial<ListenpreisUmstellungInput> = {}): ListenpreisUmstellungInput => ({
    status: "sent",
    acceptedAt: null,
    isTest: false,
    package: "software",
    products: katze(),
    monthlyFee: "1000",
    seats: 3,
    ...over,
  });

  it("offenes Angebot zum alten Listenpreis bekommt den neuen (jede Stufe, weitere Produkte)", () => {
    expect(listenpreisUmstellung(offen())).toEqual({ alt: 1000, neu: 990 });
    expect(listenpreisUmstellung(offen({ status: "draft" }))).toEqual({ alt: 1000, neu: 990 });
    expect(listenpreisUmstellung(offen({ products: katze(150), monthlyFee: 1400 }))).toEqual({ alt: 1400, neu: 1390 });
    expect(listenpreisUmstellung(offen({ products: katze(300), monthlyFee: 1800 }))).toEqual({ alt: 1800, neu: 1790 });
    const zwei = [...katze(30), { name: "Hund", dailyBudget: 20 }];
    expect(listenpreisUmstellung(offen({ products: zwei, monthlyFee: 1350 }))).toEqual({ alt: 1350, neu: 1340 });
    // Altangebot ohne Platz-Abrechnung
    expect(listenpreisUmstellung(offen({ seats: null }))).toEqual({ alt: 1000, neu: 990 });
  });

  it("Sonderkondition (Monatspreis abweichend) bleibt", () => {
    expect(listenpreisUmstellung(offen({ monthlyFee: 900 }))).toBeNull();
    // 1.400 € bei Budget der ersten Stufe = bewusst anders vereinbart
    expect(listenpreisUmstellung(offen({ monthlyFee: 1400 }))).toBeNull();
    expect(listenpreisUmstellung(offen({ monthlyFee: 990 }))).toBeNull(); // schon neu
  });

  it("angenommene, abgelehnte, ersetzte, Test-, Nur-Betreuung- und individuelle Angebote bleiben", () => {
    expect(listenpreisUmstellung(offen({ status: "accepted", acceptedAt: new Date() }))).toBeNull();
    expect(listenpreisUmstellung(offen({ acceptedAt: new Date() }))).toBeNull();
    expect(listenpreisUmstellung(offen({ status: "declined" }))).toBeNull();
    expect(listenpreisUmstellung(offen({ status: "superseded" }))).toBeNull();
    expect(listenpreisUmstellung(offen({ isTest: true }))).toBeNull();
    expect(listenpreisUmstellung(offen({ package: "service", monthlyFee: 700 }))).toBeNull();
    expect(listenpreisUmstellung(offen({ seats: 10 }))).toBeNull();
    expect(listenpreisUmstellung(offen({ products: katze(400), monthlyFee: 1800 }))).toBeNull(); // über 10.000 €
    expect(listenpreisUmstellung(offen({ products: [] }))).toBeNull();
  });
});

describe("Laufende Kunden zum alten Listenpreis behalten Preis und Staffel", () => {
  const ctx = (feeMonthly: number, extra: Partial<BudgetContext> = {}): BudgetContext => ({ plan: "software", feeMonthly, billingInterval: "month", cpl: 6, cplSource: "standard", ...extra });
  const one = (daily: number) => [{ product: "TKV", dailyBudget: daily }];

  it("Budget ändern ohne Stufenwechsel: Preis bleibt 1.000 €", () => {
    const p = previewChange(one(30), one(60), ctx(1000));
    expect(p).toMatchObject({ pricing: "list", tierChange: false, feeFrom: 1000, feeTo: 1000 });
    expect(decideApproval(p, ctx(1000))).toEqual({ kind: "apply", price: "none" });
  });

  it("Stufenwechsel: nach der vereinbarten (alten) Staffel, automatisch", () => {
    const hoch = previewChange(one(30), one(110), ctx(1000));
    expect(hoch).toMatchObject({ pricing: "list", tierChange: true, feeTo: 1400 });
    expect(tierSentence(hoch)?.replace(/ /g, " ")).toContain("1.400 € statt 1.000 € netto im Monat");
    const runter = previewChange(one(110), one(30), ctx(1400));
    expect(runter).toMatchObject({ pricing: "list", feeTo: 1000 });
    expect(decideApproval(runter, ctx(1400))).toEqual({ kind: "apply", price: "auto" });
  });

  it("weiteres Produkt: alte Staffel + 350 €", () => {
    const b = previewBooking(one(30), { product: "Hund", dailyBudget: 20 }, ctx(1000), null);
    expect(b).toMatchObject({ bookingPricing: "list", feeTo: 1350 });
  });

  it("neue Kunden: neue Staffel", () => {
    expect(previewChange(one(30), one(110), ctx(990))).toMatchObject({ pricing: "list", feeTo: 1390 });
    expect(previewChange(one(30), one(60), ctx(990))).toMatchObject({ pricing: "list", feeTo: 990 });
    expect(previewBooking(one(30), { product: "Hund", dailyBudget: 20 }, ctx(990), null)).toMatchObject({ feeTo: 1340 });
  });

  it("Sonderpreis bleibt individuell", () => {
    expect(previewChange(one(30), one(110), ctx(800)).pricing).toBe("individual");
  });
});

describe("Satz zur Preisstufe unter dem Werbebudget und Beträge ohne „,00“ (Ole, 18.11.2026)", () => {
  const nb = (t: string | null) => t?.replace(/\u00a0/g, " ") ?? null;

  it("Beträge: ganze Euro ohne „,00“, sonst mit Cent", () => {
    expect(nb(eur(990))).toBe("990 €");
    expect(nb(eur(1000))).toBe("1.000 €");
    expect(nb(eur(1234.5))).toBe("1.234,50 €");
    expect(nb(eur(1234.999))).toBe("1.235 €");
    expect(eurText(1390)).toBe("1.390 €");
    expect(eurText(0.5)).toBe("0,50 €");
  });

  it("Stufe im Wortlaut der Staffel", () => {
    expect(nb(preisstufeBereich(900))).toBe("bis 3.000 €");
    expect(nb(preisstufeBereich(3000))).toBe("bis 3.000 €");
    expect(nb(preisstufeBereich(4500))).toBe("über 3.000 bis 6.000 €");
    expect(nb(preisstufeBereich(9000))).toBe("über 6.000 bis 10.000 €");
    expect(preisstufeBereich(12000)).toBeNull();
  });

  it("Listenpreis: Stufe und Betrag aus PRICE_LIST, alte Staffel für Altverträge, Sonderkondition: vereinbarter Preis", () => {
    const s = (monthlyBudget: number, monthlyFee: number, productCount = 1, pkg = "software") => nb(betreuungsSatz({ package: pkg, monthlyBudget, productCount, monthlyFee }));
    expect(s(600, 990)).toBe("Damit gilt für Betreuung und Software die Preisstufe bis 3.000 € Werbebudget im Monat: 990 € netto im Monat.");
    expect(s(4500, 1390)).toBe("Damit gilt für Betreuung und Software die Preisstufe über 3.000 bis 6.000 € Werbebudget im Monat: 1.390 € netto im Monat.");
    expect(s(9000, 1790)).toBe("Damit gilt für Betreuung und Software die Preisstufe über 6.000 bis 10.000 € Werbebudget im Monat: 1.790 € netto im Monat.");
    expect(s(600, 1000)).toBe("Damit gilt für Betreuung und Software die Preisstufe bis 3.000 € Werbebudget im Monat: 1.000 € netto im Monat.");
    expect(s(1500, 1340, 2)).toBe("Damit gilt für Betreuung und Software die Preisstufe bis 3.000 € Werbebudget im Monat: 1.340 € netto im Monat, inklusive 1 × 350 € für ein weiteres Produkt.");
    expect(s(600, 850)).toBe("Für Betreuung und Software gilt Ihr vereinbarter Preis: 850 € netto im Monat.");
    expect(s(600, 1234.5)).toBe("Für Betreuung und Software gilt Ihr vereinbarter Preis: 1.234,50 € netto im Monat.");
    expect(s(12000, 2500)).toBe("Für Betreuung und Software gilt Ihr vereinbarter Preis: 2.500 € netto im Monat.");
    expect(s(600, 700, 1, "service")).toBeNull();
    for (const t of [s(600, 990), s(4500, 1390), s(600, 850)]) expect(hatGedankenstrich(t!)).toBe(false);
  });

  it("Präsentation mit Angebot: gleicher Satz auf der Kachel Werbebudget, ohne Angebot keiner", () => {
    const angebot = {
      number: "PG-2026-0990",
      company: "Agentur Neu",
      contactName: "Nina Neu",
      package: "software",
      vermittlerTyp: "vertreter",
      term: "12m",
      products: [{ name: "Katzenversicherung", dailyBudget: 20 }],
      setupFee: 990,
      monthlyFee: 990,
      softwareFee: 349,
      introMonthlyFee: null,
      introMonths: null,
      seats: 3,
      seatsIncluded: 3,
      seatMonthly: 49,
      bestandMonthly: null,
      empfehlungMonthly: null,
      annualPrepay: false,
      annualFreeMonths: null,
      annualChoice: false,
      customerChoosesTerm: false,
      setupDiscount: null,
      abschlussBonus: null,
      allowPayLater: false,
    } as unknown as AngebotFuerFolien;
    const p = paketDaten(angebot, "vertreter");
    expect(nb(p.betreuungsSatz)).toBe("Damit gilt für Betreuung und Software die Preisstufe bis 3.000 € Werbebudget im Monat: 990 € netto im Monat.");
    const html = verkaufsFolien("vertreter", p).find((f) => f.html.includes("Ihr Paket: Leads"))!.html.replace(/\u00a0/g, " ");
    expect(html).toContain("Laut Angebot: 20 € pro Tag. Damit gilt für Betreuung und Software die Preisstufe bis 3.000 € Werbebudget im Monat: 990 € netto im Monat.");
    const sonder = paketDaten({ ...angebot, monthlyFee: 1100 } as AngebotFuerFolien, "vertreter");
    expect(nb(sonder.betreuungsSatz)).toBe("Für Betreuung und Software gilt Ihr vereinbarter Preis: 1.100 € netto im Monat.");
    expect(paketDaten(null, "vertreter").betreuungsSatz).toBeNull();
  });
});
