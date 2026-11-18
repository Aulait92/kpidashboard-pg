// Admin › Betreuen › Kunden: Warnung „Nächster Schritt x %“ nur für Kunden mit Software (Ole, 18.11.2026).
import { describe, expect, it } from "vitest";
import { istNurPayPerLead, mitCrm, naechsterSchrittWarnung } from "@/lib/customer-package";

const software = { plan: "software", retainerMonthly: 990, onboarding: { id: "o1" } };
const ppl = { plan: "software", retainerMonthly: null, onboarding: null };
const betreuung = { plan: "service", retainerMonthly: 700, onboarding: { id: "o2" } };
const schlecht = { rate: 0, open: 12 };

describe("Warnung „Nächster Schritt“ in der Kundenliste", () => {
  it("Software-Kunde mit niedriger Quote: Warnung", () => {
    expect(mitCrm(software)).toBe(true);
    expect(naechsterSchrittWarnung(software, schlecht)).toBe("Nächster Schritt 0 %");
    expect(naechsterSchrittWarnung(software, { rate: 0.5, open: 5 })).toBe("Nächster Schritt 50 %");
  });

  it("reiner Pay-per-Lead-Kunde (ohne CRM) und „Nur Betreuung“: keine Warnung", () => {
    expect(istNurPayPerLead(ppl)).toBe(true);
    expect(naechsterSchrittWarnung(ppl, schlecht)).toBeNull();
    expect(naechsterSchrittWarnung(betreuung, schlecht)).toBeNull();
  });

  it("wenige offene Leads, gute Quote oder ohne Zahl: keine Warnung", () => {
    expect(naechsterSchrittWarnung(software, { rate: 0, open: 4 })).toBeNull();
    expect(naechsterSchrittWarnung(software, { rate: 0.9, open: 20 })).toBeNull();
    expect(naechsterSchrittWarnung(software, { rate: null, open: 20 })).toBeNull();
    expect(naechsterSchrittWarnung(software, undefined)).toBeNull();
  });
});
