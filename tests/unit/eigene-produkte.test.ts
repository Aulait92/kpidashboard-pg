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
    expect(contractLabel({ sparte: "hausrat", productName: "egal" })).toBe("Hausrat");
  });

  it("Produkt ist bei „Sonstiges“ Pflicht, Sätze in Prozent", () => {
    expect(parseContractInput({ sparte: "sonstiges", premium: "400" })).toMatchObject({ ok: false });
    const r = parseContractInput({ sparte: "sonstiges", premium: "400", productName: "  Hausrat  Plus ", rateAbschluss: "20,5", rateBestand: "10" });
    expect(r).toMatchObject({ ok: true, value: { productName: "Hausrat Plus", rateAbschluss: 0.205, rateBestand: 0.1 } });
    expect(parseContractInput({ sparte: "sonstiges", productName: "X Y", rateAbschluss: "abc" })).toMatchObject({ ok: false });
    expect(parseContractInput({ sparte: "hausrat", premium: "400", productName: "egal" })).toMatchObject({ ok: true, value: { productName: null } });
  });

  it("Liste: Name eindeutig (Groß/klein egal), sortiert; Prozent → Anteil", () => {
    const l = mitProdukt(asEigeneProdukte([{ name: "Kfz", rateAbschluss: 0.05, rateBestand: 0.05 }]), { name: "kfz", rateAbschluss: 0.07, rateBestand: 0.04 });
    expect(l).toEqual([{ name: "kfz", rateAbschluss: 0.07, rateBestand: 0.04 }]);
    expect(prozentAnteil("12,5", 100)).toBe(0.125);
    expect(prozentAnteil("", 100)).toBeNull();
    expect(prozentAnteil("500", 100)).toBe("invalid");
  });

  it("Sparte mit Produkt als ein Wert für den Abschluss-Dialog", () => {
    const v = encodeSparte("sonstiges", { productName: "Hausrat Plus", rateAbschluss: "20", rateBestand: "10" });
    expect(decodeSparte(v)).toEqual({ sparte: "sonstiges", product: { name: "Hausrat Plus", rateAbschluss: 0.2, rateBestand: 0.1 } });
    expect(encodeSparte("hausrat", { productName: "x", rateAbschluss: "1", rateBestand: "1" })).toBe("hausrat");
    expect(decodeSparte("katze")).toEqual({ sparte: "katze", product: null });
    expect(decodeSparte("sonstiges:kaputt")).toEqual({ sparte: "sonstiges", product: null });
  });
});
