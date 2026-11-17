import { describe, expect, it } from "vitest";
import { PROVISION_PRODUCTS, closeValueField, closeValueLabel, effectiveRates, estimatedProvision, includesTrail, parseCustomRates, productKeyFor, productsForTyp, ruleFor, spartenAuswahl, standardRate, sumProvision } from "@/lib/provision";

describe("Provision je Abschluss", () => {
  it("PKV-Tarifoptimierung (§ 204 VVG): Honorar = Ersparnis × 6, ohne Angabe 100 € Ersparnis", () => {
    expect(ruleFor("PKV-Tarifoptimierung").kind).toBe("honorar");
    expect(ruleFor("Wechsel").kind).toBe("honorar");
    expect(ruleFor("PKV Wechsel").kind).toBe("honorar");
    expect(estimatedProvision("pkv-tarifoptimierung", null)).toBe(600);
    expect(estimatedProvision("PKV-Tarifoptimierung", 120)).toBe(720);
    expect(closeValueField("PKV-Tarifoptimierung")?.label).toBe("Monatliche Ersparnis des Kunden (optional)");
    expect(closeValueField("PKV-Tarifoptimierung")?.hint).toContain("Honorarvereinbarung");
  });

  it("PKV-Neugeschäft: 9 Monatsbeiträge, ohne Angabe 2.500 €", () => {
    expect(ruleFor("PKV-Neugeschäft").kind).toBe("monthly");
    expect(ruleFor("Neugeschäft").kind).toBe("monthly");
    expect(estimatedProvision("PKV-Neugeschäft", 300)).toBe(2700);
    expect(estimatedProvision("PKV", null)).toBe(2500);
    expect(closeValueField("PKV")?.hint).toContain("9 Monatsbeiträge");
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
    expect(estimatedProvision("Handyversicherung", 1200)).toBe(1200);
    expect(estimatedProvision(null, null)).toBeNull();
    expect(closeValueField("Handyversicherung")?.label).toBe("Wert des Abschlusses (optional)");
  });

  it("Kindersparplan rechnet nach Beitragssumme (50 € × 12 × 18 Jahre, 25 ‰ + 1,5 % Bestand)", () => {
    // ohne Angabe: 10.800 € Beitragssumme → 270 € + 9 € Bestand im 1. Jahr
    expect(estimatedProvision("Kindersparplan", null)).toBe(279);
    // closeValue = Jahresbeitrag (1.200 € = 100 € im Monat) → 21.600 € → 540 € + 18 €
    expect(estimatedProvision("Kindersparplan", 1200)).toBe(558);
    expect(closeValueField("Kindersparplan")).toMatchObject({ label: "Monatsbeitrag (optional)", factor: 12 });
  });

  it("Kartentext nennt Beitrag und Provision", () => {
    const lbl = (src: string, v: number | null) => closeValueLabel(src, v)?.replace(/\u00a0/g, " ") ?? null;
    expect(lbl("Privatschutz", 600)).toBe("Beitrag 600 € · Provision ≈ 330 €");
    expect(lbl("PKV-Tarifoptimierung", null)).toBe("Honorar ≈ 600 €");
    expect(lbl("PKV-Tarifoptimierung", 120)).toBe("Ersparnis 120 €/Monat · Honorar ≈ 720 €");
    expect(lbl("PKV-Neugeschäft", 300)).toBe("Beitrag 300 €/Monat · Provision ≈ 2.700 €");
    expect(lbl("BU", 960)).toBe("Beitrag 80 €/Monat · Provision ≈ 734 €");
    expect(lbl("Handyversicherung", null)).toBeNull();
  });

  it("kundenspezifische Sätze gelten vor dem Standard", () => {
    const own = { privatschutz: { kind: "percent" as const, rate: 0.6, defaultPremium: 500 }, pkv: { kind: "fixed" as const, amount: 3000 } };
    expect(estimatedProvision("PKV", 300, { pkv: { kind: "monthly", months: 10, fallbackAmount: 2000 } })).toBe(3000);
    expect(estimatedProvision("PKV", null, { pkv: { kind: "monthly", months: 10, fallbackAmount: 2000 } })).toBe(2000);
    expect(closeValueField("PKV", own)).toBeNull();
    expect(estimatedProvision("Privatschutz", null, own)).toBe(300);
    expect(estimatedProvision("Privatschutz", 1000, own)).toBe(600);
    expect(estimatedProvision("PKV-Neugeschäft", null, own)).toBe(3000);
    // Tarifoptimierung hat einen eigenen Satz (Honorar), der PKV-Satz gilt dort nicht
    expect(estimatedProvision("PKV-Tarifoptimierung", null, own)).toBe(600);
    expect(estimatedProvision("TKV", null, own)).toBe(192.5);
    expect(closeValueField("Privatschutz", own)?.hint).toContain("60 %");
    expect(closeValueField("PKV", { pkv: { kind: "percent", rate: 0.5, defaultPremium: 100 } })?.label).toBe("Jahresbeitrag netto (optional)");
  });

  it("Produktliste mit stabilen Schlüsseln, Summen", () => {
    expect(PROVISION_PRODUCTS.map((p) => p.key)).toEqual(["pkv", "pkv_tarif", "privatschutz", "tkv", "unfall", "hausrat", "wohngebaeude", "rechtsschutz", "kfz", "leben_bu", "bu", "kindersparplan", "risikoleben", "grundfaehigkeit", "basisrente", "sterbegeld", "zahnzusatz", "krankenzusatz", "pflegezusatz", "krankentagegeld", "sonstiges"]);
    expect(productKeyFor("Allianz TKV Hund")).toBe("tkv");
    expect(productKeyFor("Hund-OP")).toBe("tkv");
    expect(productKeyFor("Kindersparplan")).toBe("kindersparplan");
    expect(productKeyFor("Empfehlung")).toBeNull();
    expect(sumProvision([{ source: "PKV-Tarifoptimierung", closeValue: null }, { source: "Privatschutz", closeValue: 800 }, { source: "x", closeValue: 100 }])).toBe(1140);
    expect(sumProvision([{ source: "PKV-Neugeschäft", closeValue: 250 }])).toBe(2250);
  });

  it("Makler: Sach nur Bestandsprovision 22,5 % pro Jahr, PKV 9 Monatsbeiträge", () => {
    const m = effectiveRates("makler");
    expect(estimatedProvision("Privatschutz", 600, m)).toBe(135);
    expect(estimatedProvision("Privatschutz", null, m)).toBe(135);
    expect(estimatedProvision("TKV", null, m)).toBe(78.75);
    expect(estimatedProvision("PKV-Neugeschäft", 400, m)).toBe(3600);
    expect(closeValueField("Privatschutz", m)?.hint).toContain("Bestandsprovision (22,5 % pro Jahr)");
    expect(closeValueLabel("Privatschutz", 600, m)?.replace(/\u00a0/g, " ")).toBe("Beitrag 600 € · Bestand ≈ 135 €/Jahr");
    expect(includesTrail(m)).toBe(true);
    // Vertreter bei Sach: Bestand erst ab dem 2. Jahr
    expect(includesTrail({ privatschutz: effectiveRates("vertreter").privatschutz })).toBe(false);
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
    expect(r.pkv).toEqual({ kind: "monthly", months: 9, fallbackAmount: 2500 });
  });

  it("parseCustomRates prüft Bereiche", () => {
    const { rates, errors } = parseCustomRates({
      pkv: { kind: "monthly", months: 30, fallbackAmount: 2500 },
      privatschutz: { kind: "percent", rate: "0,5", trail: "", defaultPremium: "700" },
      tkv: { kind: "percent", rate: -0.1, defaultPremium: 300 },
    });
    expect(rates.privatschutz).toEqual({ kind: "percent", rate: 0.5, trail: 0, defaultPremium: 700 });
    // § 50 VAG: über 9,9 Monatsbeiträge → Fehler, beim Laden auf 9,9 begrenzt
    expect(rates.pkv).toEqual({ kind: "monthly", months: 9.9, fallbackAmount: 2500 });
    expect(rates.tkv).toBeUndefined();
    expect(errors).toHaveLength(2);
  });

  it("PKV nur als Tarifoptimierung (§ 204 VVG) und nur bei Maklern, PKV-Neugeschäft bei keinem", () => {
    expect(productsForTyp("vertreter").map((p) => p.key)[0]).toBe("privatschutz");
    expect(productsForTyp("vertreter").some((p) => p.key === "pkv_tarif" || p.key === "pkv")).toBe(false);
    expect(productsForTyp("makler").map((p) => p.key).slice(0, 2)).toEqual(["pkv_tarif", "privatschutz"]);
    expect(productsForTyp("makler").some((p) => p.key === "pkv")).toBe(false);
    // Auswahl beim Abschluss: ohne Neugeschäft, außer der Vertrag hat die Sparte schon
    expect(spartenAuswahl().some((s) => s.key === "pkv")).toBe(false);
    expect(spartenAuswahl("pkv").some((s) => s.key === "pkv")).toBe(true);
    // Vertreter mit Tarifoptimierungs-Lead: Standard, kein Fehler
    expect(estimatedProvision("PKV-Tarifoptimierung", null, effectiveRates("vertreter"))).toBe(600);
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
