import { describe, expect, it } from "vitest";
import { categoryOf, formatBirthday, parseEuro, translatePerspective } from "@/lib/ppl/perspective";
import { factsFrom } from "@/lib/ppl/engine";

describe("Perspective-Übersetzer", () => {
  it("PKV: Kontakt, PLZ, Situation, Versicherung, Beitrag", () => {
    const { externalId, fields } = translatePerspective(
      {
        id: "abc123",
        profile: { firstName: { value: "Erika" }, lastName: { value: "Muster" }, email: { value: "e@example.com" }, "custom-69e114fc5f2bf28c0301a25f": { value: "1.250,00 €" } },
        values: { phone: "+49 151 1234567", birthday: "1980-03-07", "address#postalCode": "70173", question_lcbt58: "Beamter", question_eqxptw: "Privat", input_1w2ux1: "DKV" },
      },
      "pkv-tarifoptimierung",
    );
    expect(externalId).toBe("perspective:abc123");
    expect(fields).toMatchObject({
      Vorname: "Erika", Nachname: "Muster", Postleitzahl: "70173", Geburtsdatum: "07.03.1980",
      Situation: "Beamter", "Gesetzlich oder privat?": "Privat", "Aktuelle Versicherung": "DKV", "Monatlicher Beitrag": "1250",
    });
    const f = factsFrom(fields);
    expect(f).toMatchObject({ plz: "70173", insurer: "DKV", contribution: 1250, civilServant: true });
  });

  it("Kategorien, Datum, Euro", () => {
    expect(categoryOf("kindersparplaene")).toBe("ksp");
    expect(categoryOf("hundefutter")).toBe("futter");
    expect(categoryOf("katzen-krankenversicherung")).toBe("tier");
    expect(formatBirthday("7.3.1980")).toBe("07.03.1980");
    expect(parseEuro("1.200,50 €")).toBe("1200.5");
    expect(parseEuro("870")).toBe("870");
  });
});
