import { describe, expect, it } from "vitest";
import { angebotMitGarantien, garantieDatum } from "@/lib/garantien";

describe("Garantie-Stichtag (Ole, 23.11.2026)", () => {
  it("neue Version eines alten Angebots behält die Garantien", () => {
    const neu = { createdAt: new Date("2026-11-23T10:00:00Z"), garantieStichtag: new Date("2026-11-20T10:00:00Z") };
    expect(angebotMitGarantien(garantieDatum(neu))).toBe(true);
    expect(angebotMitGarantien(garantieDatum({ createdAt: new Date("2026-11-23T10:00:00Z") }))).toBe(false);
  });
});
