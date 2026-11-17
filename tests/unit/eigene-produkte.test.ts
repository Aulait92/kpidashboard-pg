// Eigenes Produkt bei Sparte „Sonstiges“ (Ole, 14.11.2026)
import { describe, expect, it } from "vitest";
import { asEigeneProdukte, decodeSparte, encodeSparte, mitProdukt, prozentAnteil } from "@/lib/eigene-produkte";
import { contractLabel, contractProvision } from "@/lib/provision";
import { parseContractInput } from "@/lib/vertraege";

describe("eigene Produkte", () => {
  it("rechnet mit den Sätzen am Vertrag, Bestand ab dem 2. Jahr", () => {
    const p = contractProvision({ sparte: "sonstiges", premium: 500, productName: "Rechtsschutz Gewerbe", rateAbschluss: 0.2, rateBestand: 0.1 });
    expect(p).toMatchObject({ abschluss: 100, trailPerYear: 50, trailFromYear2: true, firstYear: 100 });
    // ohne eigene Sätze wie bisher (Sonstiges-Standard)
    expect(contractProvision({ sparte: "sonstiges", premium: 500 }).abschluss).toBe(275);
    // andere Sparten ignorieren eigene Sätze
    expect(contractProvision({ sparte: "hausrat", premium: 500, rateAbschluss: 0.9 }).abschluss).toBe(275);
  });

  it("zeigt den Produktnamen statt „Sonstiges“", () => {
    expect(contractLabel({ sparte: "sonstiges", productName: "Kfz Flotte" })).toBe("Kfz Flotte");
    expect(contractLabel({ sparte: "sonstiges", productName: null })).toBe("Sonstiges");
    // Eigene Produkte mit Art Leben bzw. Kranken liegen in deren Sparte und heißen trotzdem wie angelegt
    expect(contractLabel({ sparte: "leben_bu", productName: "Fondsrente XY" })).toBe("Fondsrente XY");
    expect(contractLabel({ sparte: "hausrat", productName: null })).toBe("Hausrat");
  });

  it("Produkt ist bei „Sonstiges“ Pflicht, Sätze in Prozent", () => {
    expect(parseContractInput({ sparte: "sonstiges", premium: "400" })).toMatchObject({ ok: false });
    const r = parseContractInput({ sparte: "sonstiges", premium: "400", productName: "  Hausrat  Plus ", rateAbschluss: "20,5", rateBestand: "10" });
    expect(r).toMatchObject({ ok: true, value: { productName: "Hausrat Plus", rateAbschluss: 0.205, rateBestand: 0.1 } });
    expect(parseContractInput({ sparte: "sonstiges", productName: "X Y", rateAbschluss: "abc" })).toMatchObject({ ok: false });
    expect(parseContractInput({ sparte: "hausrat", premium: "400", productName: "egal" })).toMatchObject({ ok: true, value: { productName: null } });
  });

  it("Liste: Name eindeutig (Groß/klein egal), sortiert; Prozent → Anteil", () => {
    const l = mitProdukt(asEigeneProdukte([{ name: "Kfz", rateAbschluss: 0.05, rateBestand: 0.05 }]), { name: "kfz", art: "sach", rateAbschluss: 0.07, rateBestand: 0.04 });
    expect(l).toEqual([{ name: "kfz", art: "sach", rateAbschluss: 0.07, rateBestand: 0.04 }]);
    expect(prozentAnteil("12,5", 100)).toBe(0.125);
    expect(prozentAnteil("", 100)).toBeNull();
    expect(prozentAnteil("500", 100)).toBe("invalid");
  });

  it("Sparte mit Produkt als ein Wert für den Abschluss-Dialog", () => {
    const v = encodeSparte("sonstiges", { productName: "Hausrat Plus", rateAbschluss: "20", rateBestand: "10" });
    expect(decodeSparte(v)).toEqual({ sparte: "sonstiges", product: { name: "Hausrat Plus", art: "sach", rateAbschluss: 0.2, rateBestand: 0.1 } });
    expect(encodeSparte("hausrat", { productName: "x", rateAbschluss: "1", rateBestand: "1" })).toBe("hausrat");
    expect(decodeSparte("katze")).toEqual({ sparte: "katze", product: null });
    expect(decodeSparte("sonstiges:kaputt")).toEqual({ sparte: "sonstiges", product: null });
  });

  // Art Leben bzw. Kranken (Ole, 17.11.2026: „bei jedem muss die Berechnung passen“)
  it("Leben: ‰ der Beitragssumme in der Sparte Leben (Monatsbeitrag × 12 × Laufzeit)", () => {
    const v = encodeSparte("sonstiges", { productName: "Fondsrente XY", rateAbschluss: "30", rateBestand: "2", art: "leben" });
    expect(decodeSparte(v)).toEqual({ sparte: "leben_bu", product: { name: "Fondsrente XY", art: "leben", rateAbschluss: 30, rateBestand: 0.02 } });
    // 100 € im Monat, 20 Jahre: 24.000 € Beitragssumme → 30 ‰ = 720 €, Bestand 2 % von 1.200 € = 24 €
    const p = contractProvision({ sparte: "leben_bu", premium: 1200, termYears: 20, productName: "Fondsrente XY", rateAbschluss: 30, rateBestand: 0.02 });
    expect(p).toMatchObject({ basis: "beitragssumme", beitragssumme: 24000, abschluss: 720, trailPerYear: 24, firstYear: 744 });
    // Formular: „Anderes Produkt“ mit Art Leben → Vertrag in Leben, Monatsbeitrag × 12, Promille
    const r = parseContractInput({ sparte: "sonstiges", art: "leben", premium: "100", termYears: "20", productName: "Fondsrente XY", rateAbschluss: "30", rateBestand: "2" });
    expect(r).toMatchObject({ ok: true, value: { sparte: "leben_bu", premium: 1200, termYears: 20, productName: "Fondsrente XY", rateAbschluss: 30, rateBestand: 0.02 } });
    expect(parseContractInput({ sparte: "sonstiges", art: "leben", productName: "XY", rateAbschluss: "500" })).toMatchObject({ ok: false });
  });

  it("Kranken: Monatsbeiträge in der Sparte Krankenzusatz", () => {
    const v = encodeSparte("sonstiges", { productName: "Zahn Premium", rateAbschluss: "8", rateBestand: "3", art: "kranken" });
    expect(decodeSparte(v)).toEqual({ sparte: "krankenzusatz", product: { name: "Zahn Premium", art: "kranken", rateAbschluss: 8, rateBestand: 0.03 } });
    // 40 € im Monat: 8 × 40 = 320 € Abschluss, 3 % von 480 € = 14,40 € Bestand pro Jahr
    const p = contractProvision({ sparte: "krankenzusatz", premium: 40, productName: "Zahn Premium", rateAbschluss: 8, rateBestand: 0.03 });
    expect(p).toMatchObject({ basis: "monatsbeitraege", abschluss: 320, trailPerYear: 14.4, firstYear: 334.4 });
    const r = parseContractInput({ sparte: "sonstiges", art: "kranken", premium: "40", productName: "Zahn Premium", rateAbschluss: "8", rateBestand: "3" });
    expect(r).toMatchObject({ ok: true, value: { sparte: "krankenzusatz", premium: 40, rateAbschluss: 8, rateBestand: 0.03 } });
  });

  it("alte eigene Produkte ohne Art gelten als Sach und rechnen unverändert", () => {
    expect(asEigeneProdukte([{ name: "Glas", rateAbschluss: 0.3, rateBestand: 0.05 }])).toEqual([{ name: "Glas", art: "sach", rateAbschluss: 0.3, rateBestand: 0.05 }]);
    expect(decodeSparte(`sonstiges:${JSON.stringify({ n: "Glas", a: "30", b: "5" })}`)).toEqual({ sparte: "sonstiges", product: { name: "Glas", art: "sach", rateAbschluss: 0.3, rateBestand: 0.05 } });
  });
});
