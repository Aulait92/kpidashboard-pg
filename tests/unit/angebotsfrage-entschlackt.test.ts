import { describe, expect, it } from "vitest";
import { angebotsfrageEntschlackt as f } from "@/lib/whatsapp/gespraech";

describe("angebotsfrageEntschlackt (Ole, 22.11.2026)", () => {
  it("Floskel „Danke, das notiere ich.“: einmal „Danke!“, danach gar nicht mehr", () => {
    expect(f("Danke, das notiere ich. In welchem Jahr haben Sie Ihren Führerschein gemacht?", "Wie alt sind Sie?")).toBe("Danke! In welchem Jahr haben Sie Ihren Führerschein gemacht?");
    expect(f("Danke, das notiere ich. Fährt außer Ihnen noch jemand das Fahrzeug?", "Danke! Dafür brauche ich das Jahr.")).toBe("Fährt außer Ihnen noch jemand das Fahrzeug?");
    expect(f("Danke! Ist das Fahrzeug bezahlt, finanziert oder geleast?", "Danke! Wie viele Kilometer?")).toBe("Ist das Fahrzeug bezahlt, finanziert oder geleast?");
  });
  it("erneute Terminbestätigung fällt weg", () => {
    expect(f("Danke, das notiert. Ihr Termin mit Herrn Kannapinn steht: Montag, 23.11., 10:00 Uhr per Video. Wie viele Kilometer fahren Sie ungefähr im Jahr?", "Danke, das notiere ich. Fährt noch jemand?")).toBe(
      "Wie viele Kilometer fahren Sie ungefähr im Jahr?",
    );
  });
  it("lässt normale Fragen und Antworten stehen", () => {
    expect(f("Wie viele Kilometer fahren Sie ungefähr im Jahr?", "Danke!")).toBe("Wie viele Kilometer fahren Sie ungefähr im Jahr?");
    expect(f("Danke!", "Danke!")).toBe("Danke!");
  });
});
