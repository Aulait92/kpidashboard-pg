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
  it("Nachfassen konkret statt allgemein (Ole, 17.11.2026)", () => {
    const nach = anrufZiel({ kind: "followup", reason: "Nochmal anrufen", source: "Rechtsschutz", letzterTermin: new Date("2026-11-12T10:00:00Z") });
    expect(nach.ziel).toBe("Entscheidung nach dem Termin");
    expect(nach.schritte[0]).toContain("Termin vom 12.11.");
    expect(nach.schritte[0]).toContain("Rechtsschutz");
    expect(nach.schritte.join(" ")).not.toContain("Nächsten Schritt festlegen");
    const ohne = anrufZiel({ kind: "followup", reason: "Will mit Partnerin sprechen", source: "Hausrat" });
    expect(ohne.ziel).toBe("Termin vereinbaren");
    expect(ohne.schritte[1]).toBe("Ihre Notiz dazu: „Will mit Partnerin sprechen“");
  });
  it("Notiz als Frage ist das Ziel des Anrufs (Ole, 18.11.2026)", () => {
    const z = anrufZiel({ kind: "followup", reason: "Police da und erste Zahlung erfolgt?", source: "Privatschutz" });
    expect(z.ziel).toBe("Ihre Frage klären");
    expect(z.schritte[0]).toBe("Fragen: „Police da und erste Zahlung erfolgt?“");
    expect(z.schritte.join(" ")).not.toMatch(/Bezug nehmen|aufgreifen/);
  });
});
