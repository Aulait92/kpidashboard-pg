import { describe, expect, it } from "vitest";
import { annualMultiplier, computeOfferPrice, offerAddOns, PRICE_LIST } from "@/lib/offer-pricing";
import { retainerRows } from "@/lib/revenue-ledger";

const p = (dailyBudget: number, name = "Privatschutz") => ({ name, dailyBudget });

describe("Preise 11.11.: Logins, Jahreszahlung, Bestandskunden-Modul", () => {
  it("Preisliste: 3 Logins inklusive, 49 € je weiterem, Modul 149 €, 500 Kampagnen-Nachrichten, WhatsApp inklusive", () => {
    expect(PRICE_LIST).toMatchObject({
      seatsIncluded: 3,
      seatMonthly: 49,
      seatIndividualFrom: 10,
      annualFreeMonths: 2,
      bestandModuleMonthly: 149,
      bestandIncludedMessages: 500,
      whatsappIncluded: true,
    });
  });

  it("Standard: 3 Logins inklusive, kein Aufpreis", () => {
    const r = computeOfferPrice({ package: "software", term: "12m", products: [p(50)] });
    expect(r).toMatchObject({ seats: 3, seatsIncluded: 3, extraSeats: 0, seatsFee: 0, monthlyTotal: 1000, annual: false, annualTotal: null });
  });

  it("5 Logins: 2 weitere × 49 €", () => {
    const r = computeOfferPrice({ package: "software", term: "12m", products: [p(50)], seats: 5 });
    expect(r.extraSeats).toBe(2);
    expect(r.seatsFee).toBe(98);
    expect(r.monthlyTotal).toBe(1098);
  });

  it("ab 10 Logins individuell: kein Listenpreis, keine automatische Platz-Abrechnung", () => {
    const r = computeOfferPrice({ package: "software", term: "12m", products: [p(50)], seats: 10 });
    expect(r.seatsIndividual).toBe(true);
    expect(r.individual).toBe(true);
    expect(r.seatsFee).toBe(0);
    expect(r.monthlyFee).toBeNull();
    // mit Sonderkondition wieder berechenbar
    const s = computeOfferPrice({ package: "software", term: "12m", products: [p(50)], seats: 12, monthlyOverride: 1500 });
    expect(s.monthlyFee).toBe(1500);
    expect(s.monthlyTotal).toBe(1500);
  });

  it("Bestandskunden-Modul +149 €", () => {
    const r = computeOfferPrice({ package: "software", term: "none", products: [p(50)], bestandModule: true });
    expect(r.bestandFee).toBe(149);
    expect(r.monthlyTotal).toBe(1149);
  });

  it("Nur Betreuung: keine Logins, kein Modul", () => {
    const r = computeOfferPrice({ package: "service", term: "12m", products: [p(50)], seats: 6, bestandModule: true });
    expect(r).toMatchObject({ seats: 0, extraSeats: 0, seatsFee: 0, bestandFee: 0, monthlyTotal: 700 });
  });

  it("Jährlich im Voraus: 10 × Monatspreis inkl. Zusätze, 2 Monate geschenkt", () => {
    const r = computeOfferPrice({ package: "software", term: "12m", products: [p(50)], seats: 5, bestandModule: true, annual: true });
    expect(r.monthlyTotal).toBe(1000 + 98 + 149);
    expect(r.annual).toBe(true);
    expect(r.annualTotal).toBe(1247 * 10);
    expect(r.annualSavings).toBe(1247 * 2);
    expect(annualMultiplier()).toBe(10);
  });

  it("Jahreszahlung nur mit 12 Monaten Laufzeit", () => {
    const r = computeOfferPrice({ package: "software", term: "none", products: [p(50)], annual: true });
    expect(r.annual).toBe(false);
    expect(r.annualTotal).toBeNull();
  });

  it("offerAddOns: Snapshot eines Angebots", () => {
    const a = offerAddOns({ monthlyFee: 1000, seats: 5, seatsIncluded: 3, seatMonthly: 49, bestandMonthly: 149, annualPrepay: true, annualFreeMonths: 2 });
    expect(a).toMatchObject({ hasSeats: true, extraSeats: 2, seatsFee: 98, bestandFee: 149, monthlyTotal: 1247, annual: true, annualTotal: 12470 });
    // Alt-Angebot ohne Zusätze
    const old = offerAddOns({ monthlyFee: 1000, seats: null, seatsIncluded: null, seatMonthly: null, bestandMonthly: null, annualPrepay: false, annualFreeMonths: null });
    expect(old).toMatchObject({ hasSeats: false, seatsFee: 0, bestandFee: 0, monthlyTotal: 1000, annual: false, annualTotal: null });
  });
});

describe("Umsatzbuch: Zusätze und Jahresabo", () => {
  const start = new Date("2026-10-01T00:00:00Z");
  it("weitere Logins und Modul zählen als Software", () => {
    const rows = retainerRows({ customerId: "c", monthly: 1000, start, end: null, softwareShare: 349, extras: 98 + 149, pauses: [] }, ["2026-10"], "2026-11");
    expect(rows.find((r) => r.stream === "software")!.amount).toBe(349 + 247);
    expect(rows.find((r) => r.stream === "service")!.amount).toBe(651);
  });

  it("Jahresabo: MRR = Jahresbetrag / 12, Pausen ohne Abzug", () => {
    const rows = retainerRows({ customerId: "c", monthly: 1000, start, end: null, softwareShare: 349, extras: 98, annualFactor: 10 / 12, pauses: [] }, ["2026-10"], "2026-11");
    const total = rows.reduce((s, r) => s + r.amount, 0);
    expect(total).toBeCloseTo(((1000 + 98) * 10) / 12, 1); // Jahresbetrag 10.980 € / 12
  });
});
