import { describe, expect, it } from "vitest";
import {
  berechne,
  berechneBestand,
  DEFAULT_CONFIG,
  defaultInput,
  inputFromParams,
  inputToParams,
  leadGuaranteeFor,
  maklerModus,
  budgetVergleich,
  BUDGET_STANDARD,
  CROSS_SELL_VERZOEGERUNG,
  DAYS_PER_MONTH,
  parseRechnerConfig,
  productsFor,
  provisionPerVertrag,
  resolveCpl,
  VERTRAGS_GARANTIE_MIN_VERTRAEGE,
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
    expect(DEFAULT_CONFIG.guarantees.leads.text).toContain("sonst sind Betreuung und Software im Folgemonat kostenlos");
    expect(VERTRAGS_GARANTIE_MIN_VERTRAEGE).toBe(15);
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

describe("Bestandssicht (Makler TKV, Storno)", () => {
  // Referenzrechnung mit 30 €/Tag (Makler-Standard ist 40 €/Tag), ohne Cross-Selling (eigener Block unten)
  const makler = (over: Partial<RechnerInput> = {}) => base({ budget: 30, xs: false, ...over }, tkv, "makler");
  const rel = (a: number, b: number) => Math.abs(a - b) / b;

  it("Referenz Ole 11.11. (30 €/Tag, 6 €/Lead, 12 Monate, inkl. USt.)", () => {
    const i = makler();
    expect(maklerModus(tkv, i)).toBe(true);
    expect(i.storno).toBe(0.1);
    expect(i.kampagne).toBe(12);
    expect(i.horizont).toBe(5);
    const r = berechne(tkv, i, 6);
    expect(r.vertraege).toBeCloseTo(18.24, 6); // Referenz rechnet mit 18,2
    expect(r.setup).toBeCloseTo(1178.1, 1);
    expect(r.kosten).toBeCloseTo(2275.28, 2);
    const b = berechneBestand(tkv, i, r)!;
    // Referenzwerte mit 1 % Toleranz
    expect(rel(b.vertraegeNachKampagne, 208)).toBeLessThan(0.01);
    expect(rel(b.courtageJahrNachKampagne, 16396)).toBeLessThan(0.01);
    expect(rel(b.courtageKampagne, 9024)).toBeLessThan(0.01);
    expect(rel(b.courtageNachlauf, 64006)).toBeLessThan(0.01);
    expect(b.lebenszeitJeVertrag).toBeCloseTo(787.5, 6);
    expect(rel(b.kostenJeVertrag!, 125)).toBeLessThan(0.01);
    expect(b.gesamtKosten).toBeCloseTo(12 * r.kosten + r.setup, 6); // ≈ 28.500 €
    expect(rel(b.gesamtKosten, 28500)).toBeLessThan(0.01);
    expect(rel(b.gesamtCourtage, 73000)).toBeLessThan(0.01);
    expect(b.faktor).toBeGreaterThan(2.5);
    expect(b.faktor).toBeLessThan(2.6);
    // laufend gedeckt erst ab Monat 21 → in 12 Monaten Kampagne nicht erreicht
    expect(b.laufendGedecktMonat).toBeNull();
    expect(b.breakEvenMonat).toBeGreaterThan(12);
    expect(b.kumCourtage[b.breakEvenMonat!]).toBeGreaterThanOrEqual(b.kumKosten[b.breakEvenMonat!]);
    expect(b.kumCourtage[b.breakEvenMonat! - 1]).toBeLessThan(b.kumKosten[b.breakEvenMonat! - 1]);
  });

  it("genau mit 18,2 Verträgen/Monat: Modellwerte", () => {
    const i = makler({ customerRate: 18.2 / 152 / (4 / 3) });
    const r = berechne(tkv, i, 6);
    expect(r.vertraege).toBeCloseTo(18.2, 9);
    const b = berechneBestand(tkv, i, r)!;
    expect(b.vertraegeNachKampagne).toBeCloseTo(208.2, 1);
    expect(b.courtageJahrNachKampagne).toBeCloseTo(16395.7, 0);
    expect(b.courtageKampagne).toBeCloseTo(9023.9, 0);
    // Nachlauf: erster Monat nach Kampagnenende bereits mit Storno → 63.447 € (Referenz 64.006 € ohne diesen Monat Storno)
    expect(b.courtageNachlauf).toBeCloseTo(63446.7, 0);
  });

  it("laufend gedeckt ab Monat 21 bei 24 Monaten Kampagne", () => {
    const i = makler({ kampagne: 24 });
    const b = berechneBestand(tkv, i, berechne(tkv, i, 6))!;
    expect(b.laufendGedecktMonat).toBe(21);
    expect(b.courtageMonat[21]).toBeGreaterThanOrEqual(b.kostenMonat[21]);
    expect(b.courtageMonat[20]).toBeLessThan(b.kostenMonat[20]);
    expect(b.monate).toBe(24 + 60);
  });

  it("Bestandsaufbau: N(m) = N(m−1) × (1−Storno)^(1/12) + neu", () => {
    const i = makler();
    const r = berechne(tkv, i, 6);
    const b = berechneBestand(tkv, i, r)!;
    const q = Math.pow(0.9, 1 / 12);
    expect(b.bleibeMonat).toBeCloseTo(q, 12);
    expect(b.bestand[1]).toBeCloseTo(r.vertraege, 9);
    expect(b.bestand[2]).toBeCloseTo(r.vertraege * q + r.vertraege, 9);
    expect(b.bestand[12]).toBeCloseTo(r.vertraege * (1 - 0.9) / (1 - q), 6);
    expect(b.courtageMonat[5]).toBeCloseTo(b.bestand[5] * 350 * 0.225 / 12, 9);
  });

  it("Storno: höherer Storno = weniger Bestand, Lebenszeit = Jahrescourtage ÷ Storno", () => {
    const r = berechne(tkv, makler(), 6);
    const b10 = berechneBestand(tkv, makler(), r)!;
    const b20 = berechneBestand(tkv, makler({ storno: 0.2 }), r)!;
    expect(b20.vertraegeNachKampagne).toBeLessThan(b10.vertraegeNachKampagne);
    expect(b20.gesamtCourtage).toBeLessThan(b10.gesamtCourtage);
    expect(b20.lebenszeitJeVertrag).toBeCloseTo(350 * 0.225 / 0.2, 6);
    // ein Jahr ohne Zugang: Bestand fällt um genau den Storno
    expect(b10.bestand[24] / b10.bestand[12]).toBeCloseTo(0.9, 9);
  });

  it("Nachlauf: nach der Kampagne keine Kosten, Courtage läuft weiter; Horizont 3/5/10", () => {
    const r = berechne(tkv, makler(), 6);
    const b = berechneBestand(tkv, makler(), r)!;
    expect(b.kostenMonat.slice(13).every((k) => k === 0)).toBe(true);
    expect(b.courtageMonat.slice(13).every((c) => c > 0)).toBe(true);
    expect(b.kumKosten[b.monate]).toBeCloseTo(b.kumKosten[12], 9);
    const h3 = berechneBestand(tkv, makler({ horizont: 3 }), r)!;
    const h10 = berechneBestand(tkv, makler({ horizont: 10 }), r)!;
    expect(h3.courtageNachlauf).toBeLessThan(b.courtageNachlauf);
    expect(h10.courtageNachlauf).toBeGreaterThan(b.courtageNachlauf);
    expect(h3.courtageKampagne).toBeCloseTo(b.courtageKampagne, 9);
    // 6 Monate Kampagne bei 12 Monaten Laufzeit: Betreuung läuft bis Monat 12, Werbung nur 6 Monate
    const k6 = berechneBestand(tkv, makler({ kampagne: 6 }), r)!;
    expect(k6.kostenMonat[6]).toBeCloseTo(r.kosten, 6);
    expect(k6.kostenMonat[7]).toBeCloseTo((r.betreuung + r.berater) * 1.19, 6);
    expect(k6.kostenMonat[13]).toBe(0);
    const k6o = berechneBestand(tkv, makler({ kampagne: 6, laufzeit: "none" }), berechne(tkv, makler({ laufzeit: "none" }), 6))!;
    expect(k6o.kostenMonat[7]).toBe(0);
  });

  it("Mischfall: Abschlussprovision im Abschlussmonat + Bestand, kein Makler-Modus", () => {
    const i = makler({ rate: 0.3 });
    expect(maklerModus(tkv, i)).toBe(false);
    const r = berechne(tkv, i, 6);
    const b = berechneBestand(tkv, i, r)!;
    expect(b.courtageMonat[1]).toBeCloseTo(r.vertraege * 350 * 0.3 + b.bestand[1] * 350 * 0.225 / 12, 9);
    expect(b.courtageMonat[13]).toBeCloseTo(b.bestand[13] * 350 * 0.225 / 12, 9);
    expect(b.lebenszeitJeVertrag).toBeCloseTo(350 * 0.3 + 787.5, 6);
    // Staffel mit Satz > 0 zählt als Abschluss → kein Makler-Modus
    expect(maklerModus(tkv, makler({ staffel: [{ ab: 5, wert: 0.1 }] }))).toBe(false);
  });

  it("Vertreter unverändert: kein Makler-Modus, ohne Bestand keine Bestandssicht", () => {
    const i = base();
    expect(maklerModus(tkv, i)).toBe(false);
    const r = berechne(tkv, i, 6);
    expect(berechneBestand(tkv, i, r)).toBeNull();
    expect(berechneBestand(pkv, base({}, pkv, "makler"), berechne(pkv, base({}, pkv, "makler"), 25))).toBeNull();
    // Vertreter mit Bestandsprovision: Bestand wird gerechnet, Ansicht bleibt (kein Makler-Modus)
    const vb = base({ trail: 0.02 });
    expect(maklerModus(tkv, vb)).toBe(false);
    expect(berechneBestand(tkv, vb, berechne(tkv, vb, 6))!.vertraegeNachKampagne).toBeGreaterThan(200);
    // Vertreter-Rechnung selbst unberührt von Storno/Kampagne/Horizont
    expect(berechne(tkv, base({ storno: 0.3, kampagne: 24, horizont: 10 }), 6)).toEqual(r);
  });

  it("URL: Storno, Kampagnendauer, Horizont hin und zurück; Standard ohne Parameter", () => {
    const i = makler({ storno: 0.15, kampagne: 24, horizont: 10 });
    const q = inputToParams(DEFAULT_CONFIG, i);
    expect(q.get("st")).toBe("15");
    expect(q.get("km")).toBe("24");
    expect(q.get("hz")).toBe("10");
    expect(inputFromParams(DEFAULT_CONFIG, Object.fromEntries(q))).toEqual(i);
    expect(inputToParams(DEFAULT_CONFIG, base({}, tkv, "makler")).toString()).toBe("produkt=tkv&typ=makler&budget=40");
    // ungültige Werte → Standard
    expect(inputFromParams(DEFAULT_CONFIG, { typ: "makler", km: "7", hz: "4", st: "90" })).toMatchObject({ kampagne: 12, horizont: 5, storno: 0.1 });
  });

  it("Makler: Standardbudget 40 €/Tag ohne budget-Parameter, Vertreter 30 €", () => {
    expect(BUDGET_STANDARD).toEqual({ vertreter: 30, makler: 40 });
    expect(inputFromParams(DEFAULT_CONFIG, { produkt: "tkv", typ: "makler" }).budget).toBe(40);
    expect(inputFromParams(DEFAULT_CONFIG, { produkt: "tkv", typ: "makler", budget: "40" }).budget).toBe(40);
    expect(inputFromParams(DEFAULT_CONFIG, { produkt: "tkv", typ: "makler", budget: "25" }).budget).toBe(25);
    expect(inputFromParams(DEFAULT_CONFIG, {}).budget).toBe(30);
  });

  it("Kosten je Vertrag: Präsentations-Annahmen (4 €/Lead, 12 % Verträge, 1.000 € Betreuung, USt.)", () => {
    const i = base({ customerRate: 0.09, xs: false }, tkv, "makler"); // 9 % × 4/3 = 12 % Verträge je Lead; ohne Cross-Selling
    const v = budgetVergleich(tkv, i, 4, [27, 40, 60, 98, 100]);
    const kjv = Object.fromEntries(v.map((z) => [z.budget, z.kostenJeVertrag!]));
    expect(kjv[27]).toBeCloseTo(89, -0.5); // ≈ 89 €
    expect(kjv[40]).toBeCloseTo(73, -0.5); // ≈ 73 €
    expect(kjv[60]).toBeCloseTo(62, -0.5); // ≈ 62 €
    // 98 €/Tag = 2.979 € Werbebudget, noch erste Betreuungsstufe ≈ 53 €
    expect(kjv[98]).toBeCloseTo(53, -0.5);
    // 100 €/Tag = 3.040 € > 3.000 € → Betreuung 1.400 € (zweite Stufe), daher ≈ 58 € statt 53 €
    expect(v.find((z) => z.budget === 100)!.betreuung).toBe(1400);
    expect(kjv[100]).toBeGreaterThan(57);
    expect(kjv[100]).toBeLessThan(59);
    // mehr Budget = mehr Bestand
    expect(v[2].courtageJahrNach12).toBeGreaterThan(v[1].courtageJahrNach12);
    // Rechner-Standard (6 €/Lead): höher, Vergleich 40/60/95 wie angezeigt
    const std = budgetVergleich(tkv, base({ xs: false }, tkv, "makler"), 6);
    expect(std.map((z) => z.budget)).toEqual([40, 60, 95]);
    expect(std[0].kostenJeVertrag!).toBeGreaterThan(kjv[40]);
    expect(std[0].kostenJeVertrag!).toBeGreaterThan(std[1].kostenJeVertrag!);
  });
});

describe("Kosten pro Lead im Makler-Modus (4 € reales Ergebnis, Ole 11.11.)", () => {
  it("TKV: Vertreter 6 € Puffer, Makler 4 €; teurere echte Daten gewinnen in beiden Fällen", () => {
    expect(tkv.cplMakler).toBe(4);
    const ohne = resolveCpl(tkv, null);
    expect(ohne).toMatchObject({ cpl: 6, source: "erfahrungswert" });
    expect(ohne.makler).toMatchObject({ cpl: 4, source: "erfahrungswert", note: "reales Ergebnis" });
    const billig = resolveCpl(tkv, { cpl: 2.1, leads: 5000 });
    expect(billig.cpl).toBe(6);
    expect(billig.makler!.cpl).toBe(4);
    const mittel = resolveCpl(tkv, { cpl: 5, leads: 5000 });
    expect(mittel.cpl).toBe(6);
    expect(mittel.makler).toMatchObject({ cpl: 5, source: "daten" });
    const teuer = resolveCpl(tkv, { cpl: 7.2, leads: 5000 });
    expect(teuer.makler).toMatchObject({ cpl: 7.2, source: "daten" });
    // Produkte ohne eigenen Makler-Wert: kein makler-Eintrag (= wie cpl)
    expect(resolveCpl(pkv, null).makler).toBeUndefined();
  });

  it("Konfiguration: fehlendes Feld → Standard, leer → wie cpl, ungültig → Fehler", () => {
    const raw = (over: Record<string, unknown>) => ({ ...DEFAULT_CONFIG, products: DEFAULT_CONFIG.products.map((p) => (p.key === "tkv" ? { ...p, ...over } : p)) });
    const alt = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    for (const p of alt.products) {
      delete p.cplMakler;
      delete p.cplMaklerNote;
    }
    const a = parseRechnerConfig(alt);
    expect(a.errors).toEqual([]);
    expect(a.config.products.find((p) => p.key === "tkv")!.cplMakler).toBe(4);
    expect(a.config.products.find((p) => p.key === "tkv")!.cplMaklerNote).toBe("reales Ergebnis");
    expect(parseRechnerConfig(raw({ cplMakler: "" })).config.products.find((p) => p.key === "tkv")!.cplMakler).toBeNull();
    expect(parseRechnerConfig(raw({ cplMakler: "3,5" })).config.products.find((p) => p.key === "tkv")!.cplMakler).toBe(3.5);
    expect(parseRechnerConfig(raw({ cplMakler: "0" })).errors.join()).toMatch(/Makler/);
  });

  it("Kontrolle Präsentation: 40 €/Tag, 4 €/Lead, 358 € → ≈ 300 Leads, gedeckt ≈ Monat 12, alles zurück ≈ Monat 18, ≈ 4,5 ×", () => {
    const i = base({ budget: 40, beitrag: 358, xs: false }, tkv, "makler");
    expect(maklerModus(tkv, i)).toBe(true);
    const r = berechne(tkv, i, resolveCpl(tkv, null).makler!.cpl);
    expect(r.leads).toBeCloseTo(304, 0); // 40 € × 30,4 Tage ÷ 4 €
    expect(r.vertraege).toBeCloseTo(36.48, 2);
    const b = berechneBestand(tkv, i, r)!;
    expect(b.laufendGedecktMonat).toBeGreaterThanOrEqual(11);
    expect(b.laufendGedecktMonat).toBeLessThanOrEqual(12);
    expect(b.breakEvenMonat).toBeGreaterThanOrEqual(17);
    expect(b.breakEvenMonat).toBeLessThanOrEqual(18);
    expect(b.faktor).toBeGreaterThan(4.4);
    expect(b.faktor).toBeLessThan(4.6);
    expect(b.vertraegeNachKampagne).toBeGreaterThan(410);
    expect(b.vertraegeNachKampagne).toBeLessThan(425);
  });
});

describe("Cross-Selling im Makler-Modus (Allianz-Erfahrungswert, Ole 11.11.)", () => {
  // Folien-Rechnung: 30 Tage/Monat, 4 €/Lead, 12 % Verträge, 358 € Katze, 300 € Zusatz, 22,5 %, 10 % Storno
  // Rechner nutzt 30,4 Tage – Tagesbudget so skalieren, dass das Monatsbudget wie auf der Folie 40 € × 30 = 1.200 € ist
  const tage = 30 / DAYS_PER_MONTH;
  const folie = (over: Partial<RechnerInput> = {}) => base({ budget: 40 * tage, beitrag: 358, ...over }, tkv, "makler");
  const r30 = (i: RechnerInput) => berechne(tkv, i, 4);
  const rel = (a: number, b: number) => Math.abs(a - b) / b;

  it("Standard: an für TKV, 1 Zusatzvertrag, 300 €, 22,5 %, direkt beim Abschluss", () => {
    expect(tkv.crossSell).toEqual({ rate: 1, beitrag: 300, trail: 0.225 });
    expect(CROSS_SELL_VERZOEGERUNG).toBe(0);
    const i = defaultInput(tkv, "makler");
    expect(i).toMatchObject({ xs: true, xRate: 1, xBeitrag: 300, xTrail: 0.225 });
    expect(defaultInput(pkv, "makler").xs).toBe(false);
  });

  it("Kontrollwerte Folie: gedeckt Monat 7, alles zurück Monat 12, ≈ 8,3 ×", () => {
    const i = folie();
    const r = r30(i);
    expect(r.vertraege).toBeCloseTo(36, 6);
    const b = berechneBestand(tkv, i, r)!;
    expect(b.crossSell).toBe(true);
    expect(b.laufendGedecktMonat).toBe(7);
    expect(b.breakEvenMonat).toBe(12);
    expect(rel(b.vertraegeNachKampagne, 412)).toBeLessThan(0.01);
    expect(rel(b.zusatzNachKampagne, 412)).toBeLessThan(0.01);
    expect(rel(b.courtageJahrNachKampagne, 60970)).toBeLessThan(0.01);
    expect(rel(b.gesamtCourtage, 269500)).toBeLessThan(0.01);
    expect(rel(b.courtageHaupt, 146600)).toBeLessThan(0.01);
    expect(rel(b.courtageZusatz, 122900)).toBeLessThan(0.01);
    expect(rel(b.gesamtKosten, 32600)).toBeLessThan(0.01);
    expect(b.faktor).toBeGreaterThan(8.2);
    expect(b.faktor).toBeLessThan(8.4);
    // ohne Cross-Selling unverändert
    expect(b.ohneCrossSell!.laufendGedecktMonat).toBe(12);
    expect(b.ohneCrossSell!.breakEvenMonat).toBe(18);
    expect(rel(b.ohneCrossSell!.gesamtCourtage, 146600)).toBeLessThan(0.01);
    expect(b.ohneCrossSell!.crossSell).toBe(false);
  });

  it("mit Rechner-Standards (30,4 Tage, 350 €) nahe an der Folie", () => {
    const i = defaultInput(tkv, "makler");
    const b = berechneBestand(tkv, i, berechne(tkv, i, 4))!;
    expect(b.laufendGedecktMonat).toBeGreaterThanOrEqual(7);
    expect(b.laufendGedecktMonat).toBeLessThanOrEqual(8);
    expect(b.breakEvenMonat).toBeGreaterThanOrEqual(12);
    expect(b.breakEvenMonat).toBeLessThanOrEqual(13);
    expect(b.faktor).toBeGreaterThan(8);
  });

  it("aus = genau die Rechnung ohne Cross-Selling", () => {
    const an = folie();
    const aus = folie({ xs: false });
    const bAus = berechneBestand(tkv, aus, r30(aus))!;
    const bAn = berechneBestand(tkv, an, r30(an))!;
    expect(bAus.crossSell).toBe(false);
    expect(bAus.ohneCrossSell).toBeNull();
    expect(bAus.courtageZusatz).toBe(0);
    expect(bAus.gesamtCourtage).toBeCloseTo(bAn.ohneCrossSell!.gesamtCourtage, 6);
    expect(bAus.kumCourtage).toEqual(bAn.ohneCrossSell!.kumCourtage);
    // 0 Zusatzverträge wirkt wie aus
    expect(berechneBestand(tkv, folie({ xRate: 0 }), r30(folie()))!.crossSell).toBe(false);
    // Vertreter (Abschlussprovision) bleibt unverändert, auch mit Schalter an
    const v = base({ xs: true }, tkv, "vertreter");
    expect(maklerModus(tkv, v)).toBe(false);
  });

  it("Zusatzverträge nur in den Kampagnenmonaten, gleicher Storno wie Hauptprodukt", () => {
    const i = folie();
    const b = berechneBestand(tkv, i, r30(i))!;
    // ohne Verzögerung: Zusatz-Bestand = Haupt-Bestand × Rate, in jedem Monat
    for (let m = 0; m <= b.monate; m++) expect(b.bestandZusatz[m]).toBeCloseTo(b.bestand[m], 6);
    // nach Kampagnenende kein Zugang mehr, nur Storno
    expect(b.bestandZusatz[13]).toBeCloseTo(b.bestandZusatz[12] * b.bleibeMonat, 6);
    // höherer Storno trifft auch die Zusatzverträge
    const hoch = folie({ storno: 0.2 });
    expect(berechneBestand(tkv, hoch, r30(hoch))!.zusatzNachKampagne).toBeLessThan(b.zusatzNachKampagne);
    // halbe Rate = halber Zusatz-Bestand
    const halb = folie({ xRate: 0.5 });
    expect(berechneBestand(tkv, halb, r30(halb))!.zusatzNachKampagne).toBeCloseTo(b.zusatzNachKampagne / 2, 6);
  });

  it("Budget-Vergleich rechnet Cross-Selling ein, wenn an (Kosten ÷ Verträge + Zusatzverträge)", () => {
    const v = budgetVergleich(tkv, folie(), 4, [40 * tage, 60 * tage, 95 * tage]);
    expect(v.every((z) => z.crossSell)).toBe(true);
    expect(v[0].kostenJeVertrag!).toBeCloseTo(36.4, 0);
    expect(v[1].kostenJeVertrag!).toBeCloseTo(30.9, 0);
    expect(v[2].kostenJeVertrag!).toBeCloseTo(26.8, 0);
    expect(rel(v[0].courtageJahrNach12, 61000)).toBeLessThan(0.01);
    expect(rel(v[1].courtageJahrNach12, 91500)).toBeLessThan(0.01);
    expect(rel(v[2].courtageJahrNach12, 144800)).toBeLessThan(0.01);
    const aus = budgetVergleich(tkv, folie({ xs: false }), 4, [40 * tage]);
    expect(aus[0].crossSell).toBe(false);
    expect(aus[0].kostenJeVertrag!).toBeCloseTo(72.7, 0);
  });

  it("URL: nur Abweichungen, Roundtrip", () => {
    const d = defaultInput(tkv, "makler");
    const q0 = inputToParams(DEFAULT_CONFIG, d);
    expect(["xs", "xr", "xb", "xp"].some((k) => q0.has(k))).toBe(false);
    const i = { ...d, xs: false };
    const q1 = inputToParams(DEFAULT_CONFIG, i);
    expect(q1.get("xs")).toBe("0");
    expect(inputFromParams(DEFAULT_CONFIG, Object.fromEntries(q1))).toEqual(i);
    const j = { ...d, xRate: 0.7, xBeitrag: 250, xTrail: 0.2 };
    const q2 = inputToParams(DEFAULT_CONFIG, j);
    expect(q2.get("xr")).toBe("0.7");
    expect(q2.get("xb")).toBe("250");
    expect(q2.get("xp")).toBe("20");
    expect(inputFromParams(DEFAULT_CONFIG, Object.fromEntries(q2))).toEqual(j);
    // Produkt ohne Cross-Selling-Standard: einschalten wird als xs=1 gespeichert
    const p = { ...defaultInput(pkv, "makler"), xs: true };
    expect(inputToParams(DEFAULT_CONFIG, p).get("xs")).toBe("1");
  });

  it("Konfiguration: fehlendes Feld → Standard, null → aus, ungültig → Fehler", () => {
    const alt = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    for (const p of alt.products) delete p.crossSell;
    const a = parseRechnerConfig(alt);
    expect(a.errors).toEqual([]);
    expect(a.config.products.find((p) => p.key === "tkv")!.crossSell).toEqual({ rate: 1, beitrag: 300, trail: 0.225 });
    expect(a.config.products.find((p) => p.key === "pkv")!.crossSell).toBeNull();
    const raw = (x: unknown) => ({ ...DEFAULT_CONFIG, products: DEFAULT_CONFIG.products.map((p) => (p.key === "tkv" ? { ...p, crossSell: x } : p)) });
    expect(parseRechnerConfig(raw(null)).config.products.find((p) => p.key === "tkv")!.crossSell).toBeNull();
    expect(parseRechnerConfig(raw({ rate: "0,5", beitrag: "250", trail: 0.2 })).config.products.find((p) => p.key === "tkv")!.crossSell).toEqual({ rate: 0.5, beitrag: 250, trail: 0.2 });
    expect(parseRechnerConfig(raw({ rate: 5, beitrag: 300, trail: 0.225 })).errors.join()).toMatch(/Cross-Selling/);
  });
});
