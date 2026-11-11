import { describe, expect, it } from "vitest";
import { bestandTerms } from "@/lib/bestand/terms";
import { AGB } from "@/lib/legal-texts";

describe("Bestandskunden-Modul: Bedingungen je Zahlweise", () => {
  it("monatlich: kündbar zum Ende des Abrechnungsmonats", () => {
    const t = bestandTerms({ annual: false, monthlyNet: 149, freeMonths: 2 });
    expect(t.cancel).toContain("Ende des Abrechnungsmonats");
    expect(t.charge).toContain("monatlich");
  });
  it("jährlich: Jahresbetrag, Kündigung zum Ende des bezahlten Jahres, keine Erstattung", () => {
    const t = bestandTerms({ annual: true, monthlyNet: 149, freeMonths: 2 });
    expect(t.charge).toContain("1.490,00");
    expect(t.cancel).toContain("Ende des bezahlten Abrechnungsjahres");
    expect(t.cancel).toContain("keine anteilige Erstattung");
    expect(t.cancelDialog).toContain("Erstattung gibt es nicht");
  });
  it("AGB nennen beide Zahlweisen", () => {
    const text = JSON.stringify(AGB);
    expect(text).toContain("bei jährlicher Vorauszahlung zum Ende des bezahlten Abrechnungsjahres");
  });
});
