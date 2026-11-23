import { describe, expect, it } from "vitest";
import { mitThema } from "@/lib/thema-artikel";

describe("Artikel vor dem Produkt (Ole, 23.11.2026)", () => {
  it("mit, zu, für je nach Geschlecht", () => {
    expect(mitThema("mit", "Kfz-Versicherung")).toBe("mit der Kfz-Versicherung");
    expect(mitThema("zu", "Kfz-Versicherung")).toBe("zur Kfz-Versicherung");
    expect(mitThema("für", "Kfz-Versicherung")).toBe("für die Kfz-Versicherung");
    expect(mitThema("mit", "Privatschutz")).toBe("mit dem Privatschutz");
    expect(mitThema("zu", "Privatschutz")).toBe("zum Privatschutz");
    expect(mitThema("für", "Privatschutz")).toBe("für den Privatschutz");
    expect(mitThema("zu", "Sterbegeld")).toBe("zum Sterbegeld");
    expect(mitThema("für", "Kindersparpläne")).toBe("für die Kindersparpläne");
  });
  it("ohne Artikel, wenn schon einer da ist, bei Aufzählungen und Unbekanntem", () => {
    expect(mitThema("zu", "Ihrer Anfrage")).toBe("zu Ihrer Anfrage");
    expect(mitThema("mit", "deiner Anfrage")).toBe("mit deiner Anfrage");
    expect(mitThema("zu", "Haftpflicht, Hausrat")).toBe("zu Haftpflicht, Hausrat");
    expect(mitThema("mit", "Kinderwunsch")).toBe("mit Kinderwunsch");
  });
});
