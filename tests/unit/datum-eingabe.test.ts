import { describe, expect, it } from "vitest";
import { datumBeimTippen, datumGueltig } from "@/lib/datum-eingabe";

describe("Datumseingabe am Handy", () => {
  it("setzt die Punkte beim Tippen", () => {
    expect(datumBeimTippen("2")).toBe("2");
    expect(datumBeimTippen("221")).toBe("22.1");
    expect(datumBeimTippen("2211")).toBe("22.11");
    expect(datumBeimTippen("22111990")).toBe("22.11.1990");
    expect(datumBeimTippen("221119901")).toBe("22.11.1990");
  });
  it("Eingabe mit Punkt bleibt", () => {
    expect(datumBeimTippen("1.2.1985")).toBe("1.2.1985");
    expect(datumBeimTippen("22.11.1990")).toBe("22.11.1990");
    expect(datumBeimTippen("22.")).toBe("22.");
  });
  it("prüft das Datum", () => {
    expect(datumGueltig("22.11.1990")).not.toBeNull();
    expect(datumGueltig("31.02.1990")).toBeNull();
    expect(datumGueltig("1.2.1985")).not.toBeNull();
    expect(datumGueltig("22111990")).toBeNull();
    expect(datumGueltig("01.01.1890", { min: 1900 })).toBeNull();
  });
});
