import { describe, expect, it } from "vitest";
import { belegeZuordnen, type AbgleichBeleg, type AbgleichUmsatz } from "@/lib/belege/abgleich";
import { zuordnungPruefen } from "@/lib/belege/zuordnen";

// Ole, 24.11.2026: gleichartige Meta-Belege, weites Fenster bei Eindeutigkeit, Zuordnung von Hand

const u = (id: string, datum: string, betrag: number, gegenpartei: string): AbgleichUmsatz => ({ id, datum, betrag, gegenpartei, zweck: null, status: "zugeordnet" });
const b = (id: string, datum: string, brutto: number, firma: string, nummer: string | null = null): AbgleichBeleg => ({
  id,
  typ: "INCOMING_INVOICE",
  firma,
  datum,
  brutto,
  waehrung: "EUR",
  nummer,
});
const paare = (us: AbgleichUmsatz[], bs: AbgleichBeleg[]) => belegeZuordnen(us, bs).map((p) => `${p.umsatzId}:${p.belegId}`).sort();

describe("gleichartige Belege mit eigener Nummer (Meta)", () => {
  it("drei Abbuchungen über 4,00 € am selben Tag bekommen je einen Beleg", () => {
    const us = [u("u1", "2026-06-27", -4, "META PLATFORMS IRELAND"), u("u2", "2026-06-27", -4, "META PLATFORMS IRELAND"), u("u3", "2026-06-27", -4, "META PLATFORMS IRELAND")];
    const bs = [b("b1", "2026-06-27", 4, "Meta Platforms Ireland Limited", "FBADS-1"), b("b2", "2026-06-27", 4, "Meta Platforms Ireland Limited", "FBADS-2"), b("b3", "2026-06-27", 4, "Meta Platforms Ireland Limited", "FBADS-3")];
    expect(belegeZuordnen(us, bs)).toHaveLength(3);
  });
  it("doppelt erfasster Beleg (gleiche Nummer) zählt weiter als einer", () => {
    const us = [u("u1", "2026-03-05", -20, "Railway"), u("u2", "2026-03-05", -20, "Railway")];
    const bs = [b("b1", "2026-03-05", 20, "Railway Corp", "R-7"), b("b2", "2026-03-05", 20, "Railway Corp", "R-7")];
    expect(belegeZuordnen(us, bs)).toHaveLength(1);
  });
});

describe("weites Fenster nur bei Eindeutigkeit", () => {
  it("Steuerbüro: Rechnung 47 Tage vor der Zahlung", () => {
    expect(paare([u("u1", "2026-05-13", -3430.98, "PhDr. Mueller Treuhand GmbH")], [b("b1", "2026-03-27", 3430.98, "PhDr. Müller Treuhand GmbH", "0327")])).toEqual(["u1:b1"]);
  });
  it("Rechnung deutlich nach der Abbuchung (Folgemonat) auch im zweiten Durchgang nie", () => {
    expect(belegeZuordnen([u("u1", "2026-01-26", -49.95, "Telekom Deutschland GmbH")], [b("b1", "2026-02-11", 49.95, "Telekom Deutschland GmbH", "36 0506")])).toEqual([]);
  });
  it("Duplikat mit anders geschriebener Nummer landet nicht bei der Vormonats-Zahlung", () => {
    const us = [u("u1", "2026-01-26", -49.95, "Telekom Deutschland GmbH"), u("u2", "2026-02-23", -49.95, "Telekom Deutschland GmbH")];
    const bs = [b("b1", "2026-02-11", 49.95, "Telekom Deutschland GmbH", "36050663000571"), b("b2", "2026-02-11", 49.95, "Telekom Deutschland GmbH", "36 0506 6300 0571")];
    expect(belegeZuordnen(us, bs)).toHaveLength(1);
    expect(belegeZuordnen(us, bs)[0].umsatzId).toBe("u2");
  });
  it("zwei passende Rechnungen im weiten Fenster: nicht raten", () => {
    const us = [u("u1", "2026-01-23", -595, "Ivo Mätzig")];
    const bs = [b("b1", "2025-11-20", 595, "Ivo Mätzig", "2025-006"), b("b2", "2025-12-01", 595, "Ivo Mätzig", "2025-007")];
    expect(belegeZuordnen(us, bs)).toEqual([]);
  });
  it("Monatsrechnungen: jede Zahlung im normalen Fenster, die übrige Rechnung bleibt frei", () => {
    const us = [u("u1", "2026-01-26", -49.95, "Telekom Deutschland GmbH"), u("u2", "2026-02-26", -49.95, "Telekom Deutschland GmbH")];
    const bs = [b("b1", "2026-01-11", 49.95, "Telekom Deutschland GmbH", "1"), b("b2", "2026-02-11", 49.95, "Telekom Deutschland GmbH", "2")];
    expect(paare(us, bs)).toEqual(["u1:b1", "u2:b2"]);
  });
  it("ohne Anbieter nie im weiten Fenster", () => {
    expect(belegeZuordnen([u("u1", "2026-05-13", -120, "Unbekannt GmbH")], [b("b1", "2026-03-27", 120, "Andere Firma AG")])).toEqual([]);
  });
});

describe("Zuordnung von Hand: Eingabe", () => {
  it("1 bis 5 verschiedene Zahlungen", () => {
    expect(zuordnungPruefen(["a"])).toBeNull();
    expect(zuordnungPruefen(["a", "b"])).toBeNull();
    expect(zuordnungPruefen([])).not.toBeNull();
    expect(zuordnungPruefen(["a", "a"])).not.toBeNull();
    expect(zuordnungPruefen(["a", "b", "c", "d", "e", "f"])).not.toBeNull();
    expect(zuordnungPruefen("a")).not.toBeNull();
  });
});
