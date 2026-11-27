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

describe("Weitertippen nach dem automatischen Punkt (Ole, 28.11.2026: nur 4 Zahlen möglich)", () => {
  const tippe = (ziffern: string) => [...ziffern].reduce((feld, z) => datumBeimTippen(feld + z), "");
  it("Ziffer für Ziffer bis zum vollen Datum", () => {
    expect(tippe("12031985")).toBe("12.03.1985");
    expect(tippe("01011950")).toBe("01.01.1950");
    expect(tippe("120319851")).toBe("12.03.1985");
  });
  it("Überzählige Ziffern wandern weiter, Punkte am Ende bleiben", () => {
    expect(datumBeimTippen("12.031")).toBe("12.03.1");
    expect(datumBeimTippen("12.03.19")).toBe("12.03.19");
    expect(datumBeimTippen("12.")).toBe("12.");
    expect(datumBeimTippen("12.03.")).toBe("12.03.");
  });
});
