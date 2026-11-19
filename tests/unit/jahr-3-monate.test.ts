// Jahresvorauszahlung (Ole, 19.11.2026): 3 Monate geschenkt statt 2, der Kunde zahlt 9 Monatsbeträge für 12 Monate.
// 6 Monate im Voraus (1 Monat geschenkt) und der Abschlussbonus bleiben unverändert, gespeicherte Altwerte (2) gelten weiter.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  abschlussBonusJetzt,
  annualMultiplier,
  computeOfferPrice,
  freimonateBeiUmstellung,
  freimonateKunde,
  offerAddOns,
  PRICE_LIST,
  rhythmusFaktor,
  VORAUSZAHLUNG,
  vorauszahlungBetraege,
} from "@/lib/offer-pricing";
import { ANNUAL_PAID_MONTHS } from "@/lib/rechner";
import { OfferDocument, type OfferDoc } from "@/components/offer-document";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const katze = [{ name: "TKV-Katze", dailyBudget: 30 }];
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/ /g, " ").replace(/\s+/g, " ");

describe("Jahreszahlung: 3 Monate geschenkt", () => {
  it("Preisliste: jährlich 3 geschenkt, 6 Monate weiter 1", () => {
    expect(PRICE_LIST.annualFreeMonths).toBe(3);
    expect(PRICE_LIST.halfYearFreeMonths).toBe(1);
    expect(VORAUSZAHLUNG).toEqual({ "6m": { months: 6, freeMonths: 1 }, "12m": { months: 12, freeMonths: 3 } });
    expect(annualMultiplier()).toBe(9);
    expect(ANNUAL_PAID_MONTHS).toBe(9);
  });

  it("12 Monate: 9 Monatsbeträge inkl. Zusätze; 6 Monate unverändert 5", () => {
    const j = computeOfferPrice({ term: "12m", products: katze, seats: 4, bestandModule: true, annual: true });
    expect(j.monthlyTotal).toBe(990 + 49 + 149);
    expect(j).toMatchObject({ annualTotal: 1188 * 9, annualSavings: 1188 * 3, prepayMonths: 12, prepayFreeMonths: 3 });
    const h = computeOfferPrice({ term: "6m", products: katze, annual: true });
    expect(h).toMatchObject({ monthlyTotal: 990, annualTotal: 990 * 5, annualSavings: 990, prepayMonths: 6, prepayFreeMonths: 1 });
    expect(vorauszahlungBetraege(990, "6m")).toEqual({ total: 4950, savings: 990, freeMonths: 1, months: 6, paidMonths: 5 });
  });

  it("Abschlussbonus gilt zusätzlich: Einrichtung minus 300 €, Jahresbetrag bleibt 9 × Monatspreis", () => {
    const p = computeOfferPrice({ term: "12m", products: katze, annual: true });
    const now = new Date("2026-11-19T10:00:00Z");
    const bonus = abschlussBonusJetzt({ abschlussBonus: 300, abschlussBonusBis: new Date("2026-11-21T22:59:59Z"), createdAt: now, setupFee: p.setupFee }, now);
    expect(bonus?.betrag).toBe(300);
    expect(p.setupFee - bonus!.betrag).toBe(690);
    expect(p.annualTotal).toBe(8910);
    // nach der Frist kein Bonus, Jahresbetrag gleich
    expect(abschlussBonusJetzt({ abschlussBonus: 300, abschlussBonusBis: new Date("2026-11-18T22:59:59Z"), createdAt: now, setupFee: p.setupFee }, now)).toBeNull();
  });

  it("gespeicherte Werte gelten: angenommene Angebote mit 2 rechnen 10 ×, ohne Wert der neue Standard", () => {
    const base = { monthlyFee: 990, seats: 3, seatsIncluded: 3, seatMonthly: 49, bestandMonthly: null, annualPrepay: true, term: "12m" };
    expect(offerAddOns({ ...base, annualFreeMonths: 2 })).toMatchObject({ annualTotal: 9900, freeMonths: 2 });
    expect(offerAddOns({ ...base, annualFreeMonths: 3 })).toMatchObject({ annualTotal: 8910, freeMonths: 3 });
    expect(offerAddOns({ ...base, annualFreeMonths: null })).toMatchObject({ annualTotal: 8910, freeMonths: 3 });
  });

  it("Kunden: eingefrorene Freimonate vor Angebot vor Standard; Umstellen zurück aufs Angebot behält dessen Wert", () => {
    expect(freimonateKunde({ prepayFreeMonths: 2 }, { annualFreeMonths: 3 })).toBe(2);
    expect(freimonateKunde({ prepayFreeMonths: null }, { annualFreeMonths: 2 })).toBe(2);
    expect(freimonateKunde({ prepayFreeMonths: null }, null)).toBeNull();
    expect(rhythmusFaktor("year", freimonateKunde({ prepayFreeMonths: 2 }))).toBe(10);
    expect(rhythmusFaktor("year", freimonateKunde({ prepayFreeMonths: null }))).toBe(9);

    const alt = { annualPrepay: true, annualFreeMonths: 2, term: "12m" };
    expect(freimonateBeiUmstellung(alt, "year")).toBe(2);
    expect(freimonateBeiUmstellung(alt, "halfyear")).toBe(1);
    expect(freimonateBeiUmstellung(alt, "month")).toBeNull();
    expect(freimonateBeiUmstellung({ annualPrepay: false, annualFreeMonths: null, term: "12m" }, "year")).toBe(3);
    expect(freimonateBeiUmstellung(null, "year")).toBe(3);
    expect(freimonateBeiUmstellung({ annualPrepay: true, annualFreeMonths: 1, term: "6m" }, "halfyear")).toBe(1);
  });
});

const doc = (o: Partial<OfferDoc> = {}): OfferDoc => ({
  number: "PG-2026-0999",
  version: 1,
  status: "sent",
  contactName: "Jana Jahr",
  company: "Agentur Jahr",
  street: null,
  zip: null,
  city: null,
  package: "software",
  vermittlerTyp: "vertreter",
  term: "12m",
  products: katze,
  setupFee: 990,
  monthlyFee: 990,
  softwareFee: 349,
  introMonthlyFee: null,
  introMonths: null,
  specialTerms: null,
  startDate: new Date("2027-01-01T12:00:00Z"),
  validUntil: new Date("2026-12-03T12:00:00Z"),
  createdAt: new Date("2026-11-19T12:00:00Z"),
  acceptedAt: null,
  acceptedName: null,
  termsUrl: null,
  dpaUrl: null,
  seats: 3,
  seatsIncluded: 3,
  seatMonthly: 49,
  bestandMonthly: null,
  annualPrepay: false,
  annualFreeMonths: 3,
  annualChoice: true,
  customerChoosesTerm: true,
  customerChoosesStart: true,
  ...o,
});

describe("Angebotsdokument mit 3 Monaten geschenkt", () => {
  it("12 Monate zur Wahl: 9 × Monatspreis, 3 Monate geschenkt, keine Gedankenstriche", () => {
    const t = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc() })));
    expect(t).toMatch(/jährlich im Voraus 8\.910 € netto im Jahr/);
    expect(t).toMatch(/Bei Jahreszahlung 3 Monate geschenkt, Sie sparen 2\.970 €\./);
    expect(t).not.toMatch(/2 Monate geschenkt/);
    const zeile = t.slice(t.indexOf("Wählen Sie bei der Annahme"), t.indexOf("keine Gutschrift.") + 17);
    expect(zeile.length).toBeGreaterThan(50);
    expect(hatGedankenstrich(zeile)).toBe(false);
  });

  it("6 Monate zur Wahl: Hinweis auf Jahreszahlung nennt die neuen 3 Monate, 6 Monate weiter 1 Monat", () => {
    const t = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc({ term: "6m", setupFee: 1490, annualFreeMonths: 1 }) })));
    expect(t).toMatch(/6 Monate im Voraus 4\.950 €/);
    expect(t).toMatch(/jährlich im Voraus mit 12 Monaten Laufzeit \(3 Monate geschenkt\)/);
    expect(t).not.toMatch(/2 Monate geschenkt/);
  });

  it("angenommenes Altangebot mit 2 Monaten bleibt bei 10 × Monatspreis", () => {
    const t = text(
      renderToStaticMarkup(createElement(OfferDocument, { offer: doc({ status: "accepted", annualPrepay: true, annualFreeMonths: 2, acceptedAt: new Date("2026-11-17T12:00:00Z"), acceptedName: "Jana Jahr" }) })),
    );
    expect(t).toMatch(/9\.900 €/);
    expect(t).not.toMatch(/8\.910 €/);
  });
});
