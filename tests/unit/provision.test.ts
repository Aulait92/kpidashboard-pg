import { describe, expect, it } from "vitest";
import { PROVISION_PRODUCTS, closeValueField, closeValueLabel, estimatedProvision, productKeyFor, ruleFor, sumProvision } from "@/lib/provision";

describe("Provision je Abschluss", () => {
  it("PKV-Tarifoptimierung: 9 Monatsbeiträge, ohne Angabe 2.500 €", () => {
    expect(ruleFor("PKV-Tarifoptimierung").kind).toBe("monthly");
    expect(estimatedProvision("pkv-tarifoptimierung", null)).toBe(2500);
    expect(estimatedProvision("PKV-Tarifoptimierung", 300)).toBe(2700);
    expect(closeValueField("PKV-Tarifoptimierung")?.label).toBe("Monatsbeitrag netto (optional)");
    expect(closeValueField("PKV-Tarifoptimierung")?.hint).toContain("9 Monatsbeiträge");
  });

  it("Privatschutz: 55 % vom Jahresbeitrag, sonst Standard 600 €", () => {
    expect(estimatedProvision("Privatschutz", 800)).toBe(440);
    expect(estimatedProvision("Allianz Privatschutz", null)).toBe(330);
    expect(estimatedProvision("Privatschutz", "0")).toBe(330);
    expect(closeValueField("Privatschutz")?.label).toBe("Jahresbeitrag netto (optional)");
  });

  it("TKV: 55 % vom Jahresbeitrag, sonst Standard 350 €", () => {
    expect(estimatedProvision("TKV", 400)).toBe(220);
    expect(estimatedProvision("Tierkrankenversicherung", null)).toBe(192.5);
    expect(ruleFor("Matkvx").kind).toBe("value");
  });

  it("unbekanntes Produkt: eingegebener Wert wie bisher", () => {
    expect(estimatedProvision("Kindersparplan", 1200)).toBe(1200);
    expect(estimatedProvision(null, null)).toBeNull();
    expect(closeValueField("Kindersparplan")?.label).toBe("Wert des Abschlusses (optional)");
  });

  it("Kartentext nennt Beitrag und Provision", () => {
    const lbl = (src: string, v: number | null) => closeValueLabel(src, v)?.replace(/\u00a0/g, " ") ?? null;
    expect(lbl("Privatschutz", 600)).toBe("Beitrag 600 € · Provision ≈ 330 €");
    expect(lbl("PKV-Tarifoptimierung", null)).toBe("Provision ≈ 2.500 €");
    expect(lbl("PKV-Tarifoptimierung", 300)).toBe("Beitrag 300 €/Monat · Provision ≈ 2.700 €");
    expect(lbl("Kindersparplan", null)).toBeNull();
  });

  it("kundenspezifische Sätze gelten vor dem Standard", () => {
    const own = { privatschutz: { kind: "percent" as const, rate: 0.6, defaultPremium: 500 }, pkv: { kind: "fixed" as const, amount: 3000 } };
    expect(estimatedProvision("PKV", 300, { pkv: { kind: "monthly", months: 10, fallbackAmount: 2000 } })).toBe(3000);
    expect(estimatedProvision("PKV", null, { pkv: { kind: "monthly", months: 10, fallbackAmount: 2000 } })).toBe(2000);
    expect(closeValueField("PKV", own)).toBeNull();
    expect(estimatedProvision("Privatschutz", null, own)).toBe(300);
    expect(estimatedProvision("Privatschutz", 1000, own)).toBe(600);
    expect(estimatedProvision("PKV-Tarifoptimierung", null, own)).toBe(3000);
    expect(estimatedProvision("TKV", null, own)).toBe(192.5);
    expect(closeValueField("Privatschutz", own)?.hint).toContain("60 %");
    expect(closeValueField("PKV", { pkv: { kind: "percent", rate: 0.5, defaultPremium: 100 } })?.label).toBe("Jahresbeitrag netto (optional)");
  });

  it("Produktliste mit stabilen Schlüsseln, Summen", () => {
    expect(PROVISION_PRODUCTS.map((p) => p.key)).toEqual(["pkv", "privatschutz", "tkv"]);
    expect(productKeyFor("Allianz TKV Hund")).toBe("tkv");
    expect(productKeyFor("Kindersparplan")).toBeNull();
    expect(sumProvision([{ source: "PKV-Tarifoptimierung", closeValue: null }, { source: "Privatschutz", closeValue: 800 }, { source: "x", closeValue: 100 }])).toBe(3040);
    expect(sumProvision([{ source: "PKV-Tarifoptimierung", closeValue: 250 }])).toBe(2250);
  });
});
