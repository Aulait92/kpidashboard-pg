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
