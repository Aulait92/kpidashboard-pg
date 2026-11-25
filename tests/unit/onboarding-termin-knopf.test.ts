// Onboarding-Termin im Admin (Ole, 25.11.2026): „Andere Zeit“ gewinnt, der Knopf nennt die tatsächlich gebuchte Zeit.
import { describe, expect, it } from "vitest";
import { terminKnopf } from "@/lib/onboarding-termin-knopf";

describe("terminKnopf", () => {
  it("ohne andere Zeit: gewählter Vorschlag in deutscher Zeit", () => {
    expect(terminKnopf({ vorschlag: "2026-11-26T09:00:00.000Z", andereZeit: "" })).toEqual({ text: "Termin am 26.11. um 10:00 buchen", quelle: "vorschlag" });
  });
  it("andere Zeit gewinnt (wie die Buchung), auch mit Vorschlag", () => {
    expect(terminKnopf({ vorschlag: "2026-11-26T09:00:00.000Z", andereZeit: "2026-11-26T13:30" })).toEqual({ text: "Termin am 26.11. um 13:30 buchen", quelle: "andere" });
  });
  it("Leeren der anderen Zeit: wieder der Vorschlag", () => {
    expect(terminKnopf({ vorschlag: "2026-12-01T14:15:00.000Z", andereZeit: "   " }).text).toBe("Termin am 01.12. um 15:15 buchen");
  });
  it("weder Vorschlag noch andere Zeit: neutraler Knopf ohne Quelle", () => {
    expect(terminKnopf({ vorschlag: "", andereZeit: "" })).toEqual({ text: "Termin buchen", quelle: null });
    expect(terminKnopf({ vorschlag: null, andereZeit: null })).toEqual({ text: "Termin buchen", quelle: null });
  });
});
