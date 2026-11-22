import { describe, expect, it } from "vitest";
import { absageOhneWunsch } from "@/lib/whatsapp/buchungslink";

describe("absageOhneWunsch (Ole, 22.11.2026)", () => {
  const f = (t: string) => absageOhneWunsch(t);
  it("erkennt Absagen ohne Wunschzeit", () => {
    expect(f("Danke für die Rückmeldung.\nTermin passt nicht. Komme ggf. auf Sie zu.")).toBe(true);
    expect(f("Geht leider nicht, ich melde mich")).toBe(true);
    expect(f("Da bin ich verhindert")).toBe(true);
    expect(f("Klappt leider nicht")).toBe(true);
  });
  it("nicht bei Wunschzeit, kein Interesse oder normaler Antwort", () => {
    expect(f("Passt nicht, aber Donnerstag um 14 Uhr ginge")).toBe(false);
    expect(f("Kein Interesse mehr, passt nicht")).toBe(false);
    expect(f("Ja, Mittwoch passt")).toBe(false);
    expect(f("STOPP")).toBe(false);
  });
});
