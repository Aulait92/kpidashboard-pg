import { describe, expect, it } from "vitest";
import { einladungsAdressen } from "@/lib/vertrieb/buchung";

describe("einladungsAdressen (Termin buchen, mehrere Gäste)", () => {
  it("eine Adresse", () => {
    expect(einladungsAdressen(" Jens@Allianz.de ")).toEqual({ email: "jens@allianz.de", weitere: [] });
  });
  it("mehrere Adressen mit Semikolon, Komma oder Leerzeichen", () => {
    expect(einladungsAdressen("jens.haferstroh@allianz.de; theresa.ludwig@allianz.de")).toEqual({
      email: "jens.haferstroh@allianz.de",
      weitere: ["theresa.ludwig@allianz.de"],
    });
    expect(einladungsAdressen("a@x.de,b@x.de c@x.de")?.weitere).toEqual(["b@x.de", "c@x.de"]);
  });
  it("Dubletten entfernt, ungültige Adresse abgelehnt", () => {
    expect(einladungsAdressen("a@x.de; A@x.de")).toEqual({ email: "a@x.de", weitere: [] });
    expect(einladungsAdressen("a@x.de; kaputt")).toBeNull();
    expect(einladungsAdressen(" ; ")).toBeNull();
  });
});
