import { describe, expect, it } from "vitest";
import { computeOfferPrice, normalizeTerm, setupForTerm, TERM_MONTHS, withVat } from "@/lib/offer-pricing";

const p = (dailyBudget: number, name = "Privatschutz") => ({ name, dailyBudget });

describe("computeOfferPrice", () => {
  it("Software-Paket, 1 Produkt, 12 Monate: Listenpreise", () => {
    const r = computeOfferPrice({ package: "software", term: "12m", products: [p(50)] });
    expect(r.setupFee).toBe(990);
    expect(r.monthlyFee).toBe(1000); // Budget 50 €/Tag ≈ 1.520 €/Monat → Stufe bis 3.000 €
    expect(r.softwareFee).toBe(349);
    expect(r.individual).toBe(false);
  });

  it("ohne Laufzeit höhere Einrichtung", () => {
    expect(computeOfferPrice({ package: "software", term: "none", products: [p(50)] }).setupFee).toBe(2490);
  });

  it("3 Monate Laufzeit: Setup 1.990 €, Monatsgebühr unverändert", () => {
    const r = computeOfferPrice({ package: "software", term: "3m", products: [p(50)] });
    expect(r.setupFee).toBe(1990);
    expect(r.monthlyFee).toBe(1000);
    expect(setupForTerm("3m")).toBe(1990);
    expect(TERM_MONTHS["3m"]).toBe(3);
  });

  it("3 Monate: keine Jahresvorauszahlung möglich", () => {
    const r = computeOfferPrice({ package: "software", term: "3m", products: [p(50)], annual: true });
    expect(r.annual).toBe(false);
    expect(r.annualTotal).toBeNull();
  });

  it("unbekannte Laufzeit wird „ohne Laufzeit“", () => {
    expect(normalizeTerm("6m")).toBe("none");
    expect(normalizeTerm("3m")).toBe("3m");
    expect(normalizeTerm(undefined)).toBe("none");
  });

  it("weiteres Produkt: +990 € Einrichtung, +350 € monatlich", () => {
    const r = computeOfferPrice({ package: "software", term: "12m", products: [p(30), p(30, "Leben")] });
    expect(r.extraProducts).toBe(1);
    expect(r.setupFee).toBe(990 + 990);
    expect(r.monthlyFee).toBe(1000 + 350);
  });

  it("Nur Betreuung: 700 €/Monat, keine Software-Gebühr", () => {
    const r = computeOfferPrice({ package: "service", term: "12m", products: [p(50)] });
    expect(r.monthlyFee).toBe(700);
    expect(r.softwareFee).toBe(0);
  });

  it("sehr hohes Budget → individuell, kein Listenpreis", () => {
    const r = computeOfferPrice({ package: "software", term: "12m", products: [p(500)] });
    expect(r.individual).toBe(true);
    expect(r.monthlyFee).toBeNull();
  });

  it("Sonderkonditionen überschreiben den Listenpreis", () => {
    const r = computeOfferPrice({ package: "software", term: "12m", products: [p(50)], setupOverride: 0, monthlyOverride: 850 });
    expect(r.setupFee).toBe(0);
    expect(r.monthlyFee).toBe(850);
  });

  it("leere Produktnamen zählen nicht", () => {
    expect(computeOfferPrice({ package: "software", term: "12m", products: [p(50), p(10, "  ")] }).extraProducts).toBe(0);
  });

  it("Mehrwertsteuer 19 %", () => {
    expect(withVat(1000)).toBe(1190);
  });
});
