import { describe, expect, it } from "vitest";
import { erstinfoName, siehtNachPersonAus } from "@/lib/erstinformation-shared";

// Go-Live-Check 19.11.2026 (B1): kein Firmenname als Personenname in der Erstinformation
describe("erstinfoName", () => {
  it("Firmenname des Kunden wird nicht als Personenname vorgeschlagen", () => {
    expect(erstinfoName(null, {}, "Versicherungsbüro Muster")).toBe("");
    expect(erstinfoName(null, {}, "Agentur Muster GmbH")).toBe("");
    // Versicherer- und Agenturwörter vorn werden abgeschnitten, übrig bleibt die Person
    expect(erstinfoName(null, {}, "Allianz Hauptvertretung Max Muster")).toBe("Max Muster");
  });
  it("Personenname wird übernommen", () => {
    expect(erstinfoName(null, {}, "Max Muster")).toBe("Max Muster");
  });
  it("Inhaber laut Impressum hat Vorrang, Gespeichertes immer", () => {
    expect(erstinfoName(null, { representative: "Erika Beispiel" }, "Agentur Muster")).toBe("Erika Beispiel");
    expect(erstinfoName("Eigener Name", { representative: "Erika Beispiel" }, "Max Muster")).toBe("Eigener Name");
  });
  it("siehtNachPersonAus", () => {
    expect(siehtNachPersonAus("Max Muster")).toBe(true);
    expect(siehtNachPersonAus("Muster")).toBe(false);
    expect(siehtNachPersonAus("Muster Versicherungen")).toBe(false);
  });
});
