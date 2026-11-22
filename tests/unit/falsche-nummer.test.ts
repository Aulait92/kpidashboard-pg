import { describe, expect, it } from "vitest";
import { offensichtlichFalscheNummer } from "@/lib/ppl/telefon-pruefung";

describe("offensichtlichFalscheNummer", () => {
  it("erkennt Fantasienummern", () => {
    expect(offensichtlichFalscheNummer("4923456789")).toMatch(/Fantasie|ungültig/);
    expect(offensichtlichFalscheNummer("+4923456789")).toMatch(/Fantasie|ungültig/);
    expect(offensichtlichFalscheNummer("491511111111")).not.toBeNull();
    expect(offensichtlichFalscheNummer("4915111111111")).not.toBeNull();
    expect(offensichtlichFalscheNummer("49151123456789")).not.toBeNull();
    expect(offensichtlichFalscheNummer("123")).not.toBeNull();
  });
  it("lässt echte Nummern offen", () => {
    expect(offensichtlichFalscheNummer("4915112849371")).toBeNull();
    expect(offensichtlichFalscheNummer("494181216840")).toBeNull();
    expect(offensichtlichFalscheNummer("49301234")).toBeNull();
    expect(offensichtlichFalscheNummer("43664123456")).toBeNull(); // Österreich: nicht automatisch verloren
    expect(offensichtlichFalscheNummer("+49 4181 2168401")).toBeNull();
    expect(offensichtlichFalscheNummer(null)).toBeNull();
    expect(offensichtlichFalscheNummer("")).toBeNull();
    expect(offensichtlichFalscheNummer("01511 2849371")).toBeNull();
  });
});
