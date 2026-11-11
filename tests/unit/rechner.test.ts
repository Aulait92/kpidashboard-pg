import { describe, expect, it } from "vitest";
import {
  berechne,
  DEFAULT_CONFIG,
  defaultInput,
  inputFromParams,
  inputToParams,
  leadGuaranteeFor,
  parseRechnerConfig,
  productsFor,
  provisionPerVertrag,
  resolveCpl,
  type RechnerInput,
  type RechnerProduct,
} from "@/lib/rechner";

const tkv = DEFAULT_CONFIG.products.find((p) => p.key === "tkv")!;
const pkv = DEFAULT_CONFIG.products.find((p) => p.key === "pkv")!;
const base = (over: Partial<RechnerInput> = {}, p: RechnerProduct = tkv, typ: "vertreter" | "makler" = "vertreter") => ({
  ...defaultInput(p, typ),
  ...over,
});

describe("Break-even-Rechner", () => {
  it("TKV-Beispiel der Präsentation: 200 Leads → 24 Verträge → ≈ 8.600 € Beitrag → ≈ 5.000 € Provision", () => {
    // 800 € Werbung bei 4 €/Lead = 200 Leads; Beitrag 358 €, 58 % Abschlussprovision
    const r = berechne(tkv, base({ budget: 800 / 30.4, beitrag: 358, rate: 0.58 }), 4);
    expect(r.leads).toBeCloseTo(200, 6);
    expect(r.kunden).toBeCloseTo(18, 6);
    expect(r.vertraege).toBeCloseTo(24, 6);
    expect(r.beitragsvolumen).toBeCloseTo(8592, 0);
    expect(r.provision).toBeGreaterThan(4900);
    expect(r.provision).toBeLessThan(5100);
    // Kosten wie Präsentation: (800 + 1.000) × 1,19 = 2.142 €
    expect(r.kosten).toBeCloseTo(2142, 0);
  });

  it("Standard TKV (6 € mit Puffer, 30 €/Tag): Leads, Verträge, Break-even", () => {
    expect(tkv.cpl).toBe(6);
    const r = berechne(tkv, base(), 6);
    expect(r.leads).toBeCloseTo(152, 6);
    expect(r.vertraege).toBeCloseTo(152 * 0.12, 6);
    expect(r.provisionJeVertrag).toBeCloseTo(350 * 0.55, 6);
    // Kosten (912 + 1.000) × 1,19 = 2.275,28 → ⌈2.275,28 / 192,5⌉ = 12 Verträge
    expect(r.kosten).toBeCloseTo(2275.28, 2);
    expect(r.breakEvenVertraege).toBe(12);
    expect(r.breakEvenAnteilLeads).toBeCloseTo(12 / 152, 6);
    expect(r.ueberschuss).toBeCloseTo(r.provision - r.kosten, 6);
  });

  it("Ohne USt. sinken nur die Kosten, Provision bleibt", () => {
    const mit = berechne(tkv, base(), 6);
    const ohne = berechne(tkv, base({ ust: false }), 6);
    expect(ohne.kosten).toBeCloseTo(mit.kosten / 1.19, 6);
    expect(ohne.provision).toBeCloseTo(mit.provision, 6);
  });

  it("Makler: keine Abschlussprovision, 22,5 % Bestand im 1. Jahr", () => {
    const i = base({}, tkv, "makler");
    expect(i.rate).toBe(0);
    expect(i.trail).toBeCloseTo(0.225, 6);
    expect(provisionPerVertrag("percent", i, 10)).toBeCloseTo(350 * 0.225, 6);
  });

  it("PKV: Monatsbeiträge × Monatsbeitrag, nur für Makler wählbar", () => {
    const cfg = { ...DEFAULT_CONFIG, products: DEFAULT_CONFIG.products.map((p) => ({ ...p, active: true })) };
    expect(productsFor(cfg, "vertreter").map((p) => p.key)).not.toContain("pkv");
    expect(productsFor(cfg, "makler").map((p) => p.key)).toContain("pkv");
    const i = base({}, pkv, "makler");
    expect(i.months).toBe(10);
    expect(provisionPerVertrag("monthly", i, 3)).toBe(2500); // 250 € × 10
  });

  it("Staffel: höchste erreichte Stufe gilt für alle Verträge", () => {
    const i = base({ staffel: [{ ab: 10, wert: 0.6 }, { ab: 30, wert: 0.7 }] });
    expect(provisionPerVertrag("percent", i, 9)).toBeCloseTo(350 * 0.55, 6);
    expect(provisionPerVertrag("percent", i, 10)).toBeCloseTo(350 * 0.6, 6);
    expect(provisionPerVertrag("percent", i, 36)).toBeCloseTo(350 * 0.7, 6);
    // Break-even berücksichtigt die Staffel (n × Satz(n) ≥ Kosten)
    const r = berechne(tkv, i, 6);
    expect(r.breakEvenVertraege).toBe(11); // 11 × 210 = 2.310 ≥ 2.275,28
  });

  it("Jahreszahlung: Betreuung und Berater × 10/12, nur mit 12 Monaten", () => {
    const monatlich = berechne(tkv, base({ berater: 5 }), 6);
    const jaehrlich = berechne(tkv, base({ berater: 5, jaehrlich: true }), 6);
    expect(monatlich.berater).toBe(98); // 2 × 49
    expect(jaehrlich.betreuung).toBeCloseTo(1000 * 10 / 12, 6);
    expect(jaehrlich.berater).toBeCloseTo(98 * 10 / 12, 6);
    // Parameter: jv ohne 12 Monate wird ignoriert
    const ohneLaufzeit = inputFromParams(DEFAULT_CONFIG, { lz: "0", jv: "1" });
    expect(ohneLaufzeit.jaehrlich).toBe(false);
  });

  it("Setup amortisiert sich: Setup ÷ Überschuss, kumuliert über 12 Monate", () => {
    const r = berechne(tkv, base(), 6);
    expect(r.setup).toBeCloseTo(990 * 1.19, 6);
    expect(r.setupMonate).toBeCloseTo(r.setup / r.ueberschuss, 6);
    expect(r.kumuliert[0]).toBeCloseTo(-r.setup, 6);
    expect(r.kumuliert[12]).toBeCloseTo(r.jahr1, 6);
    expect(r.breakEvenMonat).toBe(1);
    const ohne = berechne(tkv, base({ laufzeit: "none" }), 6);
    expect(ohne.setup).toBeCloseTo(2490 * 1.19, 6);
  });

  it("Kosten pro Lead konservativ: Daten nur, wenn höher als der Erfahrungswert", () => {
    expect(resolveCpl(tkv, { cpl: 2.1, leads: 5000 })).toMatchObject({ cpl: 6, source: "erfahrungswert" });
    expect(resolveCpl(tkv, { cpl: 2.1, leads: 5000 }).note).toMatch(/Sicherheitspuffer.*2,10/);
    expect(resolveCpl(tkv, { cpl: 5.5, leads: 5000 })).toMatchObject({ cpl: 6, source: "erfahrungswert" });
    expect(resolveCpl(tkv, { cpl: 7.2, leads: 5000 })).toMatchObject({ cpl: 7.2, source: "daten" });
    expect(resolveCpl({ ...tkv, cplOverride: true }, { cpl: 9, leads: 5000 }).cpl).toBe(6);
    expect(resolveCpl(tkv, null)).toMatchObject({ cpl: 6, source: "erfahrungswert" });
  });

  it("URL-Parameter: Hin und zurück ergibt denselben Zustand", () => {
    const i = base({ budget: 45, rate: 0.6, trail: 0.02, beitrag: 380, staffel: [{ ab: 20, wert: 0.65 }], customerRate: 0.1, contractsPerCustomer: 1.5, laufzeit: "12m", jaehrlich: true, berater: 4, ust: false });
    const back = inputFromParams(DEFAULT_CONFIG, Object.fromEntries(inputToParams(DEFAULT_CONFIG, i)));
    expect(back).toEqual({ ...i, staffel: [{ ab: 20, wert: 0.65 }] });
    // Budget wird auf den Schieberegler begrenzt, unbekanntes Produkt → erstes aktives
    expect(inputFromParams(DEFAULT_CONFIG, { budget: "999", produkt: "gibts-nicht" })).toMatchObject({ budget: 150, produkt: "tkv" });
  });

  it("URL ohne Parameter = Standardwerte (Prozente nicht doppelt umgerechnet)", () => {
    const tkv = DEFAULT_CONFIG.products[0];
    expect(inputFromParams(DEFAULT_CONFIG, {})).toEqual(defaultInput(tkv, "vertreter"));
    expect(inputFromParams(DEFAULT_CONFIG, { typ: "makler" })).toEqual(defaultInput(tkv, "makler"));
    // nur Budget im Link → Überschuss wie in der Doku (≈ 1.236 €), nicht Millionen
    const r = berechne(tkv, inputFromParams(DEFAULT_CONFIG, { budget: "30" }), 6);
    expect(r.ueberschuss).toBeGreaterThan(1200);
    expect(r.ueberschuss).toBeLessThan(1300);
    expect(inputToParams(DEFAULT_CONFIG, inputFromParams(DEFAULT_CONFIG, {})).toString()).toBe("produkt=tkv&typ=vertreter&budget=30");
  });

  it("Konfiguration: Standard = nur TKV aktiv, ungültige Werte melden, Lead-Garantie", () => {
    expect(productsFor(DEFAULT_CONFIG, "makler").map((p) => p.key)).toEqual(["tkv"]);
    const { errors } = parseRechnerConfig({
      products: [{ ...tkv, key: "TKV Katze", cpl: 0 }, { ...tkv, key: "tkv", customerRate: 2 }],
      contactUrl: "javascript:alert(1)",
    });
    expect(errors.some((e) => /Schlüssel/.test(e))).toBe(true);
    expect(errors.some((e) => /Anteil Leads/.test(e))).toBe(true);
    expect(errors.some((e) => /Kontakt-Link/.test(e))).toBe(true);
    // Lead- und Break-even-Garantie standardmäßig an (Freigabe Ole 11.11.), Produktwechsel aus
    expect(DEFAULT_CONFIG.guarantees.leads.enabled).toBe(true);
    expect(DEFAULT_CONFIG.guarantees.breakEven.enabled).toBe(true);
    expect(DEFAULT_CONFIG.guarantees.productSwap.enabled).toBe(false);
    expect(DEFAULT_CONFIG.guarantees.leads.text).toContain("mindestens 100 Leads");
    expect(DEFAULT_CONFIG.guarantees.breakEven.text).toContain("längstens 6 Monate");
    expect(leadGuaranteeFor(DEFAULT_CONFIG, tkv, 30)).toEqual({ minLeads: 100, minBudget: 20, erfuellt: true });
    expect(leadGuaranteeFor(DEFAULT_CONFIG, tkv, 15)?.erfuellt).toBe(false);
    const off = parseRechnerConfig({ ...DEFAULT_CONFIG, guarantees: { ...DEFAULT_CONFIG.guarantees, leads: { ...DEFAULT_CONFIG.guarantees.leads, enabled: false } } }).config;
    expect(leadGuaranteeFor(off, tkv, 30)).toBeNull();
    expect(off.guarantees.breakEven.enabled).toBe(true);
  });

  it("AGB-Link: Standard /rechtliches/agb, nur eigene Seite oder https", () => {
    expect(DEFAULT_CONFIG.termsUrl).toBe("/rechtliches/agb");
    expect(parseRechnerConfig({ ...DEFAULT_CONFIG, termsUrl: "https://performancegrowth.de/agb" }).config.termsUrl).toBe("https://performancegrowth.de/agb");
    for (const bad of ["javascript:alert(1)", "//evil.example", "http://x.de"]) {
      const res = parseRechnerConfig({ ...DEFAULT_CONFIG, termsUrl: bad });
      expect(res.errors.some((e) => /AGB-Link/.test(e))).toBe(true);
      expect(res.config.termsUrl).toBe("/rechtliches/agb");
    }
    // alte gespeicherte Einstellungen ohne Feld → Standard
    const legacy: Record<string, unknown> = { ...DEFAULT_CONFIG };
    delete legacy.termsUrl;
    expect(parseRechnerConfig(legacy).config.termsUrl).toBe("/rechtliches/agb");
  });
});
