// Du/Sie gegenüber dem Vermittler (Ole, 18.11.2026): Einstellung am Kunden > angenommenes Angebot > Sie.
import { describe, expect, it } from "vitest";
import { vermittlerAnredeLabel, vermittlerDuAus } from "@/lib/vermittler-ansprache";

describe("vermittlerDuAus", () => {
  it("Einstellung am Kunden gewinnt, auch gegen das Angebot", () => {
    expect(vermittlerDuAus({ kunde: true, angebot: false })).toBe(true);
    expect(vermittlerDuAus({ kunde: false, angebot: true })).toBe(false);
  });
  it("ohne Einstellung am Kunden: das angenommene Angebot", () => {
    expect(vermittlerDuAus({ kunde: null, angebot: true })).toBe(true);
    expect(vermittlerDuAus({ kunde: undefined, angebot: false })).toBe(false);
  });
  it("beides unbekannt: Sie", () => {
    expect(vermittlerDuAus({ kunde: null, angebot: null })).toBe(false);
    expect(vermittlerDuAus({})).toBe(false);
  });
});

describe("vermittlerAnredeLabel", () => {
  it("zeigt die Herkunft, wenn am Kunden nichts steht", () => {
    expect(vermittlerAnredeLabel({ kunde: true })).toBe("Du");
    expect(vermittlerAnredeLabel({ kunde: false, angebot: true })).toBe("Sie");
    expect(vermittlerAnredeLabel({ kunde: null, angebot: true })).toBe("Du (aus dem Angebot)");
    expect(vermittlerAnredeLabel({ kunde: null, angebot: null })).toBe("Sie (Standard)");
  });
});
