import { describe, expect, it } from "vitest";
import { renderTemplate } from "@/lib/ppl/template";

describe("Lead-Mail nach Vorlage", () => {
  it("füllt Platzhalter, Zeilen ohne Wert entfallen", () => {
    const tpl = ["Brokercode: ABC", "Art: KVV-Opt", "Anrede: {anrede}", "Name: {nachname}", "Vorname: {vorname}", "Strasse: Unbekannt", "Ort: {ort}", "PLZ: {plz}", "Tel_mobil: {telefon}", "Leadgen_ID: {id}", "Wo versichert: {versicherer}", "Monatsbeitrag: {beitrag}"].join("\n");
    const out = renderTemplate(tpl, {
      id: "lead1",
      name: "Erika Mustermann",
      phone: "4915112345678",
      email: "e@example.com",
      answers: [
        { label: "Anrede", value: "Frau" },
        { label: "Postleitzahl", value: "70173" },
        { label: "Aktuelle Versicherung", value: "DKV" },
        { label: "Monatsbeitrag", value: "870" },
      ],
    });
    expect(out).toBe(
      ["Brokercode: ABC", "Art: KVV-Opt", "Anrede: Frau", "Name: Mustermann", "Vorname: Erika", "Strasse: Unbekannt", "PLZ: 70173", "Tel_mobil: +49 151 12345678", "Leadgen_ID: lead1", "Wo versichert: DKV", "Monatsbeitrag: 870"].join("\n"),
    );
  });
});
