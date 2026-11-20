import { describe, expect, it } from "vitest";
import {
  KUNDE_MAX_PRODUKTE,
  listenMonatsgebuehr,
  produktWahlOptionen,
  resolveProduktWahl,
  TAGESBUDGET_STUFEN,
  type OfferProduct,
} from "@/lib/offer-pricing";

// Kunde wählt Produkte und Tagesbudget auf der Angebotsseite (Ole, 19.11.2026)
const angebot: OfferProduct[] = [{ name: "TKV-Katze", dailyBudget: 30 }];
const snap = (choosesProducts = true, products = angebot) => ({ products, monthlyFee: 990, choosesProducts });

describe("Produktwahl: Monatsgebühr nach Staffel", () => {
  it("rechnet Staffel und weitere Produkte (+350 €)", () => {
    expect(listenMonatsgebuehr([{ name: "A", dailyBudget: 30 }])).toBe(990); // 900 € im Monat
    expect(listenMonatsgebuehr([{ name: "A", dailyBudget: 100 }, { name: "B", dailyBudget: 50 }])).toBe(1390 + 350); // 4.500 €
    expect(listenMonatsgebuehr([{ name: "A", dailyBudget: 100 }, { name: "B", dailyBudget: 100 }, { name: "C", dailyBudget: 100 }])).toBe(1790 + 700); // 9.000 €
  });
  it("über 10.000 € Werbebudget: individuell (null)", () => {
    const viel = ["A", "B", "C", "D"].map((name) => ({ name, dailyBudget: 100 }));
    expect(listenMonatsgebuehr(viel)).toBeNull();
  });
});

describe("resolveProduktWahl", () => {
  it("ohne Angabe gilt das Angebot", () => {
    expect(resolveProduktWahl(snap(), null)).toEqual({ ok: true, products: angebot, monthlyFee: 990, geaendert: false });
  });
  it("gleiche Wahl wie im Angebot: unverändert, auch ohne Freigabe", () => {
    expect(resolveProduktWahl(snap(false), [{ name: "TKV-Katze", dailyBudget: 30 }])).toMatchObject({ ok: true, geaendert: false, monthlyFee: 990 });
  });
  it("übernimmt Produkte und rechnet neu (Preis nie vom Client)", () => {
    const r = resolveProduktWahl(snap(), [
      { name: "TKV-Katze", dailyBudget: 50, monthlyFee: 1 },
      { name: "TKV-Hund", dailyBudget: 20 },
    ]);
    expect(r).toEqual({
      ok: true,
      products: [
        { name: "TKV-Katze", dailyBudget: 50 },
        { name: "TKV-Hund", dailyBudget: 20 },
      ],
      monthlyFee: 990 + 350, // 2.100 € Werbebudget
      geaendert: true,
    });
  });
  it("ohne Freigabe: geänderte Wahl abgelehnt", () => {
    expect(resolveProduktWahl(snap(false), [{ name: "TKV-Hund", dailyBudget: 30 }])).toMatchObject({ ok: false });
  });
  it("lehnt manipulierte Werte ab", () => {
    for (const wanted of [
      "ungueltig",
      [],
      [{ name: "Erfundenes Produkt", dailyBudget: 30 }],
      [{ name: "TKV-Katze", dailyBudget: 33 }],
      [{ name: "TKV-Katze", dailyBudget: 5 }],
      [{ name: "TKV-Katze", dailyBudget: -20 }],
      [{ name: "TKV-Katze", dailyBudget: "abc" }],
      [{ name: "", dailyBudget: 30 }],
      [
        { name: "TKV-Katze", dailyBudget: 30 },
        { name: "TKV-Katze", dailyBudget: 20 },
      ],
      ["TKV-Katze", "TKV-Hund", "TKV-Pferd", "Privatschutz", "Zahnzusatz", "Sterbegeld"].map((name) => ({ name, dailyBudget: 20 })),
      ["TKV-Katze", "TKV-Hund", "TKV-Pferd", "Privatschutz"].map((name) => ({ name, dailyBudget: 100 })),
    ]) {
      expect(resolveProduktWahl(snap(), wanted), JSON.stringify(wanted)).toMatchObject({ ok: false });
    }
  });
  it("erlaubt Produkt und Tagesbudget aus dem Angebot, auch außerhalb der Vorschläge", () => {
    const eigen = [{ name: "Gewerbe-Haftpflicht", dailyBudget: 35 }];
    expect(produktWahlOptionen(eigen).namen).toContain("Gewerbe-Haftpflicht");
    expect(produktWahlOptionen(eigen).stufen).toContain(35);
    expect(resolveProduktWahl(snap(true, eigen), [{ name: "Gewerbe-Haftpflicht", dailyBudget: 35 }, { name: "TKV-Katze", dailyBudget: 20 }])).toMatchObject({ ok: true, geaendert: true });
  });
  it("Stufen ab 20 €, höchstens 5 Produkte online", () => {
    expect(TAGESBUDGET_STUFEN[0]).toBe(20);
    expect(KUNDE_MAX_PRODUKTE).toBe(5);
  });
});
