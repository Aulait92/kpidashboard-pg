// Fachbegriffe in einem Satz (Usability-Check 18.11.2026): je ein Satz, ohne Gedankenstriche, ohne „Garantie“-Versprechen
// über die AGB hinaus, Fristen aus der Rechner-Konfiguration.
import { describe, expect, it } from "vitest";
import * as B from "@/lib/begriffe";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { GARANTIE_FRISTEN } from "@/lib/rechner";

const saetze = [
  B.BETREUUNG_ERKLAERT,
  B.PREISSTUFE_ERKLAERT,
  B.BEDENKZEIT_ERKLAERT,
  B.BREAKEVEN_ERKLAERT,
  B.VERTRAGSGARANTIE_ERKLAERT,
  B.SICHT_ERKLAERT,
  B.NRR_ERKLAERT,
  B.CLV_ERKLAERT,
  B.bestandErklaert("Bestandsprovision"),
];

describe("Begriffe in einem Satz", () => {
  it("je genau ein Satz, ohne Gedankenstriche", () => {
    for (const s of saetze) {
      expect(hatGedankenstrich(s)).toBe(false);
      expect(s.trim().endsWith(".")).toBe(true);
      expect(s.replace(/\b(z|d|u)\. ?[a-zA-Z]\./g, "").split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length).toBe(1);
    }
  });

  it("Fristen der Garantien aus der Konfiguration, Hinweis auf die AGB", () => {
    expect(B.BREAKEVEN_ERKLAERT).toContain(`${GARANTIE_FRISTEN.breakEvenTage} aktiven Tagen`);
    expect(B.VERTRAGSGARANTIE_ERKLAERT).toContain(`${GARANTIE_FRISTEN.vertragTage} aktiven Tagen`);
    for (const s of [B.BREAKEVEN_ERKLAERT, B.VERTRAGSGARANTIE_ERKLAERT]) expect(s).toContain("laut AGB");
  });

  it("Bestand: pro Jahr (ganzer Bestand) und 5 Jahre (Verträge aus dem Zeitraum) in einem Satz", () => {
    expect(B.bestandErklaert("Bestandscourtage")).toBe(
      "Bestandscourtage pro Jahr zählt Ihren ganzen laufenden Bestand für ein Jahr, „Bestandscourtage (5 Jahre)“ nur die Verträge aus diesem Zeitraum über die nächsten 5 Jahre.",
    );
  });
});
