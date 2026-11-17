// Weitere Standardprodukte (Ole, 17.11.2026: „hier fehlen noch Produkte“): Kranken-Zusatz in Monatsbeiträgen mit
// Bestand, Leben-Produkte nach Beitragssumme.
import { describe, expect, it } from "vitest";
import { contractProvision, effectiveRates, estimatedProvision, includesTrail, parseCustomRates, sparteForSource } from "@/lib/provision";

describe("weitere Standardprodukte", () => {
  it("Zahnzusatz: 6 Monatsbeiträge + 2 % Bestand, ohne Beitrag 30 € im Monat", () => {
    expect(contractProvision({ sparte: "zahnzusatz", premium: 40 })).toMatchObject({ basis: "monatsbeitraege", abschluss: 240, trailPerYear: 9.6, firstYear: 249.6 });
    expect(contractProvision({ sparte: "zahnzusatz", premium: null })).toMatchObject({ abschluss: 180, trailPerYear: 7.2, premiumMissing: true });
    expect(estimatedProvision("Zahnzusatzversicherung", 40)).toBe(249.6);
  });

  it("PKV-Neugeschäft rechnet unverändert (ohne Bestand, fester Betrag ohne Beitrag)", () => {
    expect(contractProvision({ sparte: "pkv", premium: 300 })).toMatchObject({ abschluss: 2700, trailPerYear: 0, firstYear: 2700 });
    expect(contractProvision({ sparte: "pkv", premium: null })).toMatchObject({ abschluss: 2500 });
  });

  it("Leben-Produkte nach Beitragssumme", () => {
    // Risikoleben: 20 € × 12 × 20 Jahre = 4.800 € → 25 ‰ = 120 € + 1,5 % von 240 € = 3,60 €
    expect(contractProvision({ sparte: "risikoleben", premium: null })).toMatchObject({ basis: "beitragssumme", abschluss: 120, trailPerYear: 3.6 });
    expect(contractProvision({ sparte: "basisrente", premium: 1200 })).toMatchObject({ beitragssumme: 36000, abschluss: 900 });
    expect(sparteForSource("Sterbegeldversicherung")).toBe("sterbegeld");
  });

  it("eigene Sätze für Kranken-Zusatz: Bestand und typischer Monatsbeitrag werden gelesen", () => {
    const { rates, errors } = parseCustomRates({ zahnzusatz: { kind: "monthly", months: 8, fallbackAmount: 0, trail: 0.03, defaultMonthly: 50 } });
    expect(errors).toEqual([]);
    expect(rates.zahnzusatz).toMatchObject({ kind: "monthly", months: 8, trail: 0.03, defaultMonthly: 50 });
    const r = effectiveRates("vertreter", { zahnzusatz: rates.zahnzusatz });
    expect(contractProvision({ sparte: "zahnzusatz", premium: null }, r)).toMatchObject({ abschluss: 400, trailPerYear: 18 });
    expect(parseCustomRates({ zahnzusatz: { kind: "monthly", months: 30, fallbackAmount: 0 } }).errors.length).toBe(1);
    expect(includesTrail({ zahnzusatz: rates.zahnzusatz })).toBe(true);
  });
});
