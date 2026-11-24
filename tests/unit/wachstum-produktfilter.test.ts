// Produktfilter auf „Wachstum“ (Ole, 24.11.2026): Werbebudget und Betreuung gibt es nur je Kunde, darum anteilig nach
// den bezahlten Leads des Produkts. Rein, ohne Datenbank.
import { describe, expect, it } from "vitest";
import { agencyAnteilig } from "@/lib/ertrag";

describe("agencyAnteilig", () => {
  const a = { betreuung: 200, logins: 20, module: 30, whatsapp: 10, setup: 40, gutschrift: 0, total: 300, baseInLeadCosts: false };
  it("skaliert alle Posten und die Summe, Rest bleibt", () => {
    expect(agencyAnteilig(a, 0.25)).toEqual({ betreuung: 50, logins: 5, module: 7.5, whatsapp: 2.5, setup: 10, gutschrift: 0, total: 75, baseInLeadCosts: false });
  });
  it("Anteil 0 (keine Leads des Produkts): keine Kosten; 1: unverändert", () => {
    expect(agencyAnteilig(a, 0).total).toBe(0);
    expect(agencyAnteilig(a, 1)).toEqual(a);
  });
});

import { produktAusKampagne, werbeAnteil } from "@/lib/werbebudget-produkt";

describe("werbeAnteil: Werbebudget aus den Kampagnen des Produkts (Ole, 24.11.2026)", () => {
  const kampagnen = [
    { name: "Privatschutz | Lohmann", spend: 300 },
    { name: "Kfz | Lohmann", spend: 100 },
    { name: "Test ohne Zuordnung", spend: 100 },
  ];
  const produktVon = (n: string) => (n.startsWith("Privatschutz") ? "Privatschutz" : n.startsWith("Kfz") ? "Kfz-Versicherung" : null);
  it("eigene Kampagnen exakt, nicht zugeordnete anteilig nach Leads", () => {
    // Kfz: 100 eigene + 100 × 0,4 offene = 140 von 500
    expect(werbeAnteil(kampagnen, produktVon, "Kfz-Versicherung", 0.4)).toBeCloseTo(0.28);
    // Privatschutz: 300 + 100 × 0,6 = 360 von 500
    expect(werbeAnteil(kampagnen, produktVon, "Privatschutz", 0.6)).toBeCloseTo(0.72);
  });
  it("Summe über die Produkte ergibt 1 (Kontosumme bleibt gleich)", () => {
    expect(werbeAnteil(kampagnen, produktVon, "Kfz-Versicherung", 0.4)! + werbeAnteil(kampagnen, produktVon, "Privatschutz", 0.6)!).toBeCloseTo(1);
  });
  it("ohne Kampagnenkosten: null (Rückfall auf Anteil nach Leads)", () => {
    expect(werbeAnteil([], produktVon, "Kfz-Versicherung", 0.4)).toBeNull();
    expect(werbeAnteil([{ name: "Kfz", spend: 0 }], produktVon, "Kfz-Versicherung", 0.4)).toBeNull();
  });
});

describe("produktAusKampagne: Kampagnenname → Produkt des Kunden", () => {
  const produkte = ["Privatschutz", "Kfz-Versicherung", "TKV-Katze"];
  it("ordnet über die Produkterkennung zu (nicht „Kfz Wechsel“ → PKV)", () => {
    expect(produktAusKampagne("Lohmann Kfz Wechsel", produkte)).toBe("Kfz-Versicherung");
    expect(produktAusKampagne("Lohmann Privatschutz Leadform", produkte)).toBe("Privatschutz");
    expect(produktAusKampagne("Hausrat Neukunden Nov", produkte)).toBe("Privatschutz");
    expect(produktAusKampagne("Katze OP-Schutz", produkte)).toBe("TKV-Katze");
  });
  it("nicht zuzuordnen bzw. mehrdeutig: null", () => {
    expect(produktAusKampagne("Testkampagne", produkte)).toBeNull();
    // zwei Privatschutz-Produkte: nur der genau genannte gewinnt
    expect(produktAusKampagne("Hausrat Herbst", ["Privatschutz", "Hausrat"])).toBe("Hausrat");
    expect(produktAusKampagne("Haftpflicht Herbst", ["Privatschutz", "Hausrat"])).toBeNull();
  });
});
