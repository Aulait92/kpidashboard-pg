import { describe, expect, it } from "vitest";
import { PROVISION_PRODUCTS, closeValueField, closeValueLabel, effectiveRates, estimatedProvision, includesTrail, parseCustomRates, productKeyFor, productsForTyp, ruleFor, standardRate, sumProvision } from "@/lib/provision";

describe("Provision je Abschluss", () => {
  it("PKV-Tarifoptimierung (nur Makler): 10 Monatsbeiträge, ohne Angabe 2.500 €", () => {
    expect(ruleFor("PKV-Tarifoptimierung").kind).toBe("monthly");
    expect(estimatedProvision("pkv-tarifoptimierung", null)).toBe(2500);
    expect(estimatedProvision("PKV-Tarifoptimierung", 300)).toBe(3000);
    expect(closeValueField("PKV-Tarifoptimierung")?.label).toBe("Monatsbeitrag netto (optional)");
    expect(closeValueField("PKV-Tarifoptimierung")?.hint).toContain("10 Monatsbeiträge");
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
    expect(lbl("PKV-Tarifoptimierung", 300)).toBe("Beitrag 300 €/Monat · Provision ≈ 3.000 €");
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
    expect(sumProvision([{ source: "PKV-Tarifoptimierung", closeValue: 250 }])).toBe(2500);
  });

  it("Makler: Sach nur Bestandsprovision 22,5 % pro Jahr, PKV 10 Monatsbeiträge", () => {
    const m = effectiveRates("makler");
    expect(estimatedProvision("Privatschutz", 600, m)).toBe(135);
    expect(estimatedProvision("Privatschutz", null, m)).toBe(135);
    expect(estimatedProvision("TKV", null, m)).toBe(78.75);
    expect(estimatedProvision("PKV-Tarifoptimierung", 400, m)).toBe(4000);
    expect(closeValueField("Privatschutz", m)?.hint).toContain("Bestandsprovision (22,5 % pro Jahr)");
    expect(closeValueLabel("Privatschutz", 600, m)?.replace(/\u00a0/g, " ")).toBe("Beitrag 600 € · Bestand ≈ 135 €/Jahr");
    expect(includesTrail(m)).toBe(true);
    expect(includesTrail(effectiveRates("vertreter"))).toBe(false);
  });

  it("Mischfall Abschluss + Bestand: 1. Jahr zählt beides", () => {
    const own = { privatschutz: { kind: "percent" as const, rate: 0.4, trail: 0.1, defaultPremium: 600 } };
    expect(estimatedProvision("Privatschutz", 1000, own)).toBe(500);
    expect(closeValueField("Privatschutz", own)?.hint).toContain("40 % Abschluss + 10 % Bestand im 1. Jahr");
    expect(closeValueLabel("Privatschutz", 1000, own)?.replace(/\u00a0/g, " ")).toBe("Beitrag 1.000 € · Provision ≈ 500 €");
  });

  it("effectiveRates: Typ-Standard, eigene Sätze darüber, Unsinn ignoriert", () => {
    expect(effectiveRates("vertreter").privatschutz).toEqual({ kind: "percent", rate: 0.55, trail: 0.1, trailFromYear2: true, defaultPremium: 600 });
    expect(effectiveRates("quatsch").tkv).toEqual(standardRate("tkv", "vertreter"));
    const r = effectiveRates("makler", { tkv: { kind: "percent", rate: 0.1, trail: 0.2, defaultPremium: 400 }, privatschutz: { kind: "percent", rate: 5 } });
    expect(r.tkv).toEqual({ kind: "percent", rate: 0.1, trail: 0.2, defaultPremium: 400 });
    expect(r.privatschutz).toEqual(standardRate("privatschutz", "makler"));
    expect(r.pkv).toEqual({ kind: "monthly", months: 10, fallbackAmount: 2500 });
  });

  it("parseCustomRates prüft Bereiche", () => {
    const { rates, errors } = parseCustomRates({
      pkv: { kind: "monthly", months: 30, fallbackAmount: 2500 },
      privatschutz: { kind: "percent", rate: "0,5", trail: "", defaultPremium: "700" },
      tkv: { kind: "percent", rate: -0.1, defaultPremium: 300 },
    });
    expect(rates.privatschutz).toEqual({ kind: "percent", rate: 0.5, trail: 0, defaultPremium: 700 });
    expect(rates.pkv).toBeUndefined();
    expect(rates.tkv).toBeUndefined();
    expect(errors).toHaveLength(2);
  });

  it("PKV nur bei Maklern in der Produktliste", () => {
    expect(productsForTyp("vertreter").map((p) => p.key)).toEqual(["privatschutz", "tkv"]);
    expect(productsForTyp("makler").map((p) => p.key)).toEqual(["pkv", "privatschutz", "tkv"]);
    // Vertreter mit PKV-Lead: Makler-Standard, kein Fehler
    expect(estimatedProvision("PKV-Tarifoptimierung", null, effectiveRates("vertreter"))).toBe(2500);
  });
});

describe("Vertreter: 10 % Bestand ab dem 2. Jahr", () => {
  it("Provision im 1. Jahr ohne Bestand, Makler mit Bestand", async () => {
    const { effectiveRates, estimatedProvision } = await import("@/lib/provision");
    const v = effectiveRates("vertreter");
    expect(estimatedProvision("TKV-Katze", 350, v)).toBe(192.5);
    const own = effectiveRates("vertreter", { tkv: { kind: "percent", rate: 0.5, trail: 0.1, defaultPremium: 400 } });
    expect(estimatedProvision("TKV-Katze", 400, own)).toBe(200);
  });
});
