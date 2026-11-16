import { describe, expect, it } from "vitest";
import { airtableLeadToPool } from "@/lib/ppl/airtable-nachholen";

describe("Pay-per-Lead: Lead aus Airtable nachholen", () => {
  it("übersetzt die Airtable-Felder wie der Perspective-Übersetzer", () => {
    const m = airtableLeadToPool("recX", {
      Vorname: "Max", Nachname: "Muster", "E-Mail": "m@test.local", Telefonnummer: "+49 172 7300000",
      Geburtsdatum: "1961-04-07", Postleitzahl: "85604", Ort: "Zorneding", Situation: "Rentner",
      "Gesetzlich oder privat?": "Privat", "Aktuelle Versicherung": "Debeka", "Wie lange in PKV?": "Über 20 Jahre",
      "Monatlicher Beitrag": 1050, "SMS-Verifizierung": { name: "none" }, "Perspective-ID": "abc123",
      "slug (from Produkt (Eingang))": ["pkv-tarifoptimierung"],
    });
    expect(m.externalId).toBe("perspective:abc123");
    expect(m.slug).toBe("pkv-tarifoptimierung");
    expect(m.smsVerified).toBe(false);
    expect(m.fields).toMatchObject({ Vorname: "Max", Postleitzahl: "85604", Geburtsdatum: "07.04.1961", "Monatlicher Beitrag": "1050", "Aktuelle Versicherung": "Debeka" });
  });
  it("ohne Perspective-ID über den Airtable-Datensatz", () => {
    expect(airtableLeadToPool("recY", { Vorname: "A" }).externalId).toBe("airtable:recY");
  });
});
