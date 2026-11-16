// Neue Terminvorbereitung (Ole, 15.11.2026): Schalter, „Das will der Kunde“, „Noch klären“, Sparten aus dem Formular.
import { describe, expect, it } from "vitest";
import {
  KLAEREN_MAX,
  kundeWill,
  klaerenPunkte,
  neueTerminvorbereitung,
  neuigkeitVersteckt,
  NEUIGKEIT_TERMINVORBEREITUNG,
  spartenFuerTermin,
  TERMINVORBEREITUNG_NEU_FUER_ALLE,
} from "@/lib/terminvorbereitung-neu";
import type { VorbereitungDaten } from "@/lib/termin-vorbereitung";

const d = (x: Partial<VorbereitungDaten> & { angaben?: Record<string, string> } = {}): VorbereitungDaten => ({
  lead: { name: "Verena Martin", telefon: null, email: null, adresse: null, produkt: "Privatschutz" },
  termin: { startsAt: new Date("2026-11-16T09:00:00Z"), mode: "phone", berater: "Max Berger", meetUrl: null },
  zusammenfassung: null,
  formular: [],
  angaben: {},
  vorbereitetAm: null,
  ...x,
});

describe("Schalter", () => {
  it("für alle freigeschaltet (Ole, 16.11.2026): jeder Kunde, Neuigkeit sichtbar", () => {
    expect(TERMINVORBEREITUNG_NEU_FUER_ALLE).toBe(true);
    expect(neueTerminvorbereitung({ customerId: "cmwhmxr7w03g436lb34w6xtsk" }, "")).toBe(true);
    expect(neueTerminvorbereitung({ customerId: "x", preview: true }, "")).toBe(true);
    expect(neueTerminvorbereitung({ customerId: "x" }, "")).toBe(true);
    expect(neuigkeitVersteckt(NEUIGKEIT_TERMINVORBEREITUNG)).toBe(false);
    expect(neuigkeitVersteckt("upd_andere")).toBe(false);
  });
});

describe("Sparten aus Formular und Angaben", () => {
  it("Privatschutz nach Interesse, Tiere nach Tierart und Wunsch", () => {
    expect(spartenFuerTermin(d({ formular: [{ label: "Versicherungsinteresse", value: "Hausrat, Rechtsschutz" }] }))).toEqual(["hausrat", "rechtsschutz"]);
    expect(spartenFuerTermin(d())).toEqual(["haftpflicht", "hausrat"]);
    expect(spartenFuerTermin(d({ angaben: { interesse: "Tierhalterhaftpflicht für den Hund" } }))).toEqual(["tierhalter-hund"]);
    expect(spartenFuerTermin(d({ lead: { ...d().lead, produkt: "Katzenversicherung" }, angaben: { tarifwunsch: "nur OP-Schutz" } }))).toEqual(["katze-op"]);
    expect(spartenFuerTermin(d({ lead: { ...d().lead, produkt: "Tierkrankenversicherung" }, formular: [{ label: "Tierart", value: "Hund" }] }))).toEqual(["hund-kranken"]);
  });

  it("Pferde-Leads bekommen Pferde-OP bzw. Pferdekranken (16.11.2026)", () => {
    const produkt = (p: string, x: Partial<VorbereitungDaten> & { angaben?: Record<string, string> } = {}) => spartenFuerTermin(d({ lead: { ...d().lead, produkt: p }, ...x }));
    expect(produkt("Pferde-OP-Versicherung")).toEqual(["pferd-op"]);
    expect(produkt("Pferdekrankenversicherung")).toEqual(["pferd-kranken"]);
    expect(produkt("Pferdeversicherung")).toEqual(["pferd-op"]);
    expect(produkt("Pferdehalterhaftpflicht")).toEqual(["tierhalter-pferd"]);
    expect(produkt("Tierkrankenversicherung", { formular: [{ label: "Tierart", value: "Pferd" }] })).toEqual(["pferd-kranken"]);
    expect(produkt("Tier-OP-Versicherung", { angaben: { tier: "Pferd, 12 Jahre" } })).toEqual(["pferd-op"]);
    // Privatschutz mit Tieren: Pferd mit Krankenschutz und Haftpflicht
    expect(spartenFuerTermin(d({ angaben: { interesse: "Tierkrankenversicherung und Tierhalterhaftpflicht", tier: "Pferd" } }))).toEqual(["pferd-kranken", "tierhalter-pferd"]);
  });
});

describe("Das will der Kunde, Noch klären", () => {
  it("höchstens 5 Punkte in Alltagssprache, Quelle in einer Zeile", () => {
    const w = kundeWill(
      d({
        formular: [{ label: "Lebenssituation", value: "Paar, Kinder aus dem Haus" }, { label: "Versicherungsinteresse", value: "Hausrat, Rechtsschutz" }],
        angaben: { versichern: "beide", vorhanden: "keine", anlass: "Umzug", tarifwunsch: "guter Schutz", einwaende: "Preis" },
      }),
    );
    expect(w.punkte).toHaveLength(5);
    expect(w.punkte[0]).toBe("Hausrat, Rechtsschutz");
    expect(w.punkte).toContain("Versichert werden soll: beide");
    expect(w.quelle).toBe("Aus Formular und WhatsApp-Chat");
    expect(kundeWill(d({ formular: [{ label: "Versicherungsinteresse", value: "Hausrat" }] })).quelle).toBe("Aus dem Formular");
  });

  it("offene Angaben zusammengeführt, ohne Doppelungen; Wer und Geburtsdaten als ein Punkt", () => {
    const p = klaerenPunkte(d({ formular: [{ label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat, Rechtsschutz" }] }));
    expect(p).toContain("Wer wird mitversichert? Geburtsdaten");
    expect(p).not.toContain("Geburtsdaten");
    expect(p).toContain("Adresse und PLZ");
    expect(p).toContain("Schäden in den letzten 5 Jahren");
    expect(p.filter((x) => x === "Schäden in den letzten 5 Jahren")).toHaveLength(1);
    expect(p.filter((x) => /^Beruf/.test(x))).toHaveLength(1);
    expect(p.length).toBeGreaterThan(KLAEREN_MAX); // der Rest steht unter „Mehr zum Kunden“
  });
});
