// Diagnose q=journey (Ole, 19.11.2026, lib/ops/journey.ts): Trichter je Vermittler, rein, ohne Personendaten.
import { describe, expect, it } from "vitest";
import { journeyAuswerten, trichter, type JourneyLead } from "@/lib/ops/journey";

const lead = (customerId: string, x: Partial<JourneyLead> = {}): JourneyLead => ({ customerId, antwort: false, vorschlag: false, vorschlagGelesen: false, termin: null, ...x });
const termin = (x: Partial<NonNullable<JourneyLead["termin"]>> = {}) => ({ via: "bot", komplettcheck: null, vorbei: false, erschienen: false, stundenBisBuchung: 2, ...x });

describe("Journey-Trichter", () => {
  const leads: JourneyLead[] = [
    lead("k1", { antwort: true, vorschlag: true, vorschlagGelesen: true, termin: termin({ komplettcheck: true, vorbei: true, erschienen: true, stundenBisBuchung: 1 }) }),
    lead("k1", { antwort: true, vorschlag: true, vorschlagGelesen: true, termin: termin({ komplettcheck: false, vorbei: true, stundenBisBuchung: 3 }) }),
    lead("k1", { antwort: true, vorschlag: true }),
    lead("k1"),
    lead("k2", { antwort: true, vorschlag: true, termin: termin({ via: "booking_page", stundenBisBuchung: 5 }) }),
  ];

  it("zählt jede Stufe und rechnet Quoten in Prozent", () => {
    const t = trichter(leads);
    expect(t.leads).toBe(5);
    expect(t.ersteAntwort).toBe(4);
    expect(t.vorschlagErhalten).toBe(4);
    expect(t.vorschlagGelesen).toBe(2);
    expect(t.gebucht).toBe(3);
    expect(t.komplettcheckGefragt).toBe(2);
    expect(t.komplettcheckJa).toBe(1);
    expect(t.terminVorbei).toBe(2);
    expect(t.erschienen).toBe(1);
    expect(t.quoten.terminJeLead).toBe(60);
    expect(t.quoten.terminJeAntwort).toBe(75);
    expect(t.quoten.komplettcheckJaJeTermin).toBe(33.3);
    expect(t.quoten.komplettcheckJaJeGefragt).toBe(50);
    expect(t.quoten.erschienenJeVorbei).toBe(50);
    expect(t.medianStundenBisTermin).toBe(3);
  });

  it("je Weg: Buchungsseite ohne Komplettcheck-Frage fällt auf", () => {
    const t = trichter(leads);
    expect(t.jeWeg.booking_page).toEqual({ gebucht: 1, komplettcheckGefragt: 0, komplettcheckJa: 0 });
    expect(t.jeWeg.bot.gebucht).toBe(2);
  });

  it("je Vermittler mit Kürzel, nach Leads sortiert, ohne Namen", () => {
    const r = journeyAuswerten(leads);
    expect(r.jeVermittler.map((v) => [v.kuerzel, v.customerId, v.leads])).toEqual([
      ["V1", "k1", 4],
      ["V2", "k2", 1],
    ]);
    expect(r.gesamt.leads).toBe(5);
  });

  it("leer: Quoten null statt Division durch null", () => {
    const t = trichter([]);
    expect(t.quoten.terminJeLead).toBeNull();
    expect(t.medianStundenBisTermin).toBeNull();
  });
});
