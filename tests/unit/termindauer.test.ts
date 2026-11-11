import { describe, expect, it } from "vitest";
import { normalizeDuration, timeGrid } from "@/lib/calendar/lead-times";

describe("Zeitraster für Lead-Zeiten", () => {
  it("alle 30 Minuten von 9 bis 17 Uhr: letzter Start 16:30", () => {
    const g = timeGrid(30, "09:00", "17:00");
    expect(g[0]).toBe("09:00");
    expect(g.at(-1)).toBe("16:30");
    expect(g).toHaveLength(16);
  });
  it("alle 45 Minuten: 9:00, 9:45, 10:30 … letzter Start 15:45 (endet 16:30)", () => {
    const g = timeGrid(45, "09:00", "17:00");
    expect(g.slice(0, 3)).toEqual(["09:00", "09:45", "10:30"]);
    expect(g.at(-1)).toBe("15:45");
  });
  it("alle 60 Minuten, ungültige Eingaben", () => {
    expect(timeGrid(60, "9:00", "12:00")).toEqual(["09:00", "10:00", "11:00"]);
    expect(timeGrid(60, "x", "12:00")).toEqual([]);
    expect(timeGrid(0, "09:00", "12:00")).toEqual([]);
  });
  it("Dauer nur 15/30/45/60, sonst 30", () => {
    expect(normalizeDuration("45")).toBe(45);
    expect(normalizeDuration(15)).toBe(15);
    expect(normalizeDuration("50")).toBe(30);
    expect(normalizeDuration(null)).toBe(30);
  });
});
