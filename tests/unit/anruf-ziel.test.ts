// Anrufliste: Ziel und Schritte je Anlass (Ole, 16.11.2026)
import { describe, expect, it } from "vitest";
import { anrufZiel, bedarfsfragen } from "@/lib/anruf-ziel";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

describe("Ziel des Anrufs", () => {
  it("neuer Lead: vorstellen, Bedarf, Termin", () => {
    const z = anrufZiel({ kind: "callback", reason: "Keine Reaktion auf WhatsApp · vor 2 Tagen", source: "Katzenversicherung" });
    expect(z.ziel).toBe("Termin vereinbaren");
    expect(z.schritte[0]).toContain("Katzenversicherung");
    expect(z.schritte[1]).toContain("Tierart");
  });
  it("Absage bzw. nicht erschienen: neuer Termin", () => {
    expect(anrufZiel({ kind: "callback", reason: "Nicht zum Termin erschienen, neuen Termin vereinbaren", source: null }).ziel).toBe("Neuen Termin vereinbaren");
    expect(anrufZiel({ kind: "callback", reason: "Lead hat den Termin abgesagt, kurz nachfassen", source: null }).ziel).toBe("Neuen Termin vereinbaren");
  });
  it("Angebot nachfassen: Entscheidung", () => {
    expect(anrufZiel({ kind: "followup", reason: "Angebot nachfassen", source: "Privatschutz" }).ziel).toBe("Entscheidung zum Angebot");
  });
  it("weiß der Assistent schon etwas: bestätigen statt neu abfragen", () => {
    const z = anrufZiel({ kind: "callback", reason: "Keine Reaktion", source: "Privatschutz", known: "Paar, Hausrat" });
    expect(z.schritte[1]).toBe("Bekanntes kurz bestätigen, nur Fehlendes fragen");
    expect(anrufZiel({ kind: "callback", reason: "Keine Reaktion", source: "Privatschutz", known: null }).schritte[1]).toContain("Sparten");
  });
  it("Bedarfsfragen je Produkt, ohne Gedankenstriche", () => {
    expect(bedarfsfragen("Privatschutz")).toContain("Sparten");
    expect(bedarfsfragen("PKV")).toContain("Beruf");
    for (const p of ["Katze", "Privatschutz", "PKV", "BU", null]) expect(hatGedankenstrich(bedarfsfragen(p))).toBe(false);
  });
});
