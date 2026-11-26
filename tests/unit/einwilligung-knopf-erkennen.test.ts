import { describe, expect, it } from "vitest";
import { KNOPF_TITEL, knopfEinwilligungAus } from "@/lib/einwilligung-leadformular";

// Ole, 26.11.2026: von Hand kopierte Formulare (Einwilligung per Knopf) zeigten „Keine Einwilligung gespeichert“
const text = "Ihr Angebot und Ihren Termin erhalten Sie per WhatsApp, E-Mail oder Telefon. Mit Klick auf „Senden“ willigen Sie ein, …";

describe("Einwilligung per Knopf im Formular erkennen", () => {
  it("Knopf-Titel, kein Häkchen: Wortlaut", () => {
    expect(knopfEinwilligungAus({ custom_disclaimer: { title: KNOPF_TITEL, body: { text } } })).toBe(text);
  });
  it("anderer Titel, aber „Mit Klick auf Senden“ im Text", () => {
    expect(knopfEinwilligungAus({ custom_disclaimer: { title: "Einwilligung", body: { text } } })).toBe(text);
  });
  it("mit Häkchen, ohne Hinweis oder ohne Text: keine Knopf-Fassung", () => {
    expect(knopfEinwilligungAus({ custom_disclaimer: { title: KNOPF_TITEL, body: { text }, checkboxes: [{ key: "a" }] } })).toBeNull();
    expect(knopfEinwilligungAus({ privacy_policy: { url: "x" } })).toBeNull();
    expect(knopfEinwilligungAus({ custom_disclaimer: { title: "Hinweis", body: { text: "Wir melden uns." } } })).toBeNull();
    expect(knopfEinwilligungAus(null)).toBeNull();
  });
});
