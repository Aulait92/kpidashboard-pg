// Rangfolge Name (Ole, 19.11.2026, lib/lead-name.ts). Platzhalternamen.
import { describe, expect, it } from "vitest";
import { andererNachname, anzeigeName, namensWechsel, profilNameErlaubt } from "@/lib/lead-name";

describe("lead-name", () => {
  it("Anzeigename: Name am Lead vor dem Profilnamen, Profilname nur ohne Lead-Namen", () => {
    expect(anzeigeName({ leadName: "Max Platzhalter", contactName: "Profilname" })).toBe("Max Platzhalter");
    expect(anzeigeName({ leadName: " ", contactName: "Profilname" })).toBe("Profilname");
    expect(anzeigeName({ leadName: null, contactName: null })).toBeNull();
    expect(profilNameErlaubt(null)).toBe(true);
    expect(profilNameErlaubt({ name: null })).toBe(true);
    expect(profilNameErlaubt({ name: "Max Platzhalter" })).toBe(false);
  });

  it("anderer Nachname nur, wenn beide bekannt und ohne gemeinsamen Teil", () => {
    expect(andererNachname("Max Platzhalter", "Erika Beispiel")).toBe(true);
    expect(andererNachname("Tester", "Max Platzhalter")).toBe(false);
    expect(andererNachname("Max Müller", "Erika Mueller")).toBe(false);
    expect(andererNachname("Erika Beispiel", "Erika Beispiel-Muster")).toBe(false);
    expect(andererNachname("Frau Beispiel", "Erika Beispiel")).toBe(false);
  });

  it("Namenswechsel bei neuer Anfrage", () => {
    expect(namensWechsel({ name: "Max Platzhalter" }, "max  platzhalter")).toBe("gleich");
    expect(namensWechsel({ name: "Max Platzhalter" }, null)).toBe("gleich");
    expect(namensWechsel({ name: "Tester" }, "Max Platzhalter")).toBe("neuer_name");
    expect(namensWechsel({ name: null }, "Max Platzhalter")).toBe("neuer_name");
    expect(namensWechsel({ name: "Max Platzhalter" }, "Moritz Platzhalter")).toBe("neuer_name");
    expect(namensWechsel({ name: "Max Platzhalter", contactEditedAt: new Date() }, "Moritz Platzhalter")).toBe("von_hand");
    expect(namensWechsel({ name: "Max Platzhalter", contactEditedAt: new Date() }, "Erika Beispiel")).toBe("andere_person");
    expect(namensWechsel({ name: "Max Platzhalter" }, "Erika Beispiel")).toBe("andere_person");
  });
});
