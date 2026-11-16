// Kalender: gleiche Zeiten an allen Tagen einmal zeigen, gespeichert wird exakt derselbe Zeitplan (16.11.2026)
import { describe, expect, it } from "vitest";
import { aktiveTage, aufTageVerteilen, gemeinsameZeiten, type ZeitenJeTag } from "@/lib/calendar/zeiten-gleich";

const demo: ZeitenJeTag = {
  1: [["10:00", "10:30"], ["14:00", "14:30"], ["16:00", "16:30"]],
  2: [["10:00", "10:30"], ["14:00", "14:30"], ["16:00", "16:30"]],
  3: [["10:00", "10:30"], ["14:00", "14:30"], ["16:00", "16:30"]],
  4: [["10:00", "10:30"], ["14:00", "14:30"], ["16:00", "16:30"]],
  5: [["10:00", "10:30"], ["14:00", "14:30"], ["16:00", "16:30"]],
};

describe("Gleiche Zeiten je Wochentag", () => {
  it("erkennt gleiche Tage und übernimmt sie exakt (gleicher gespeicherter Zeitplan)", () => {
    const g = gemeinsameZeiten(demo);
    expect(g).toEqual(demo[1]);
    const zurueck = aufTageVerteilen(g!, aktiveTage(demo));
    expect(zurueck).toEqual(demo);
    expect(JSON.stringify({ step: 60, days: zurueck })).toBe(JSON.stringify({ step: 60, days: demo }));
  });

  it("ein einziger Tag und Samstag/Sonntag mit gleichen Zeiten", () => {
    const d: ZeitenJeTag = { 0: [["09:00", "12:00"]], 6: [["09:00", "12:00"]] };
    expect(aktiveTage(d)).toEqual([0, 6]);
    expect(aufTageVerteilen(gemeinsameZeiten(d)!, aktiveTage(d))).toEqual(d);
    expect(gemeinsameZeiten({ 3: [["08:00", "13:00"]] })).toEqual([["08:00", "13:00"]]);
  });

  it("verschiedene Tage, andere Reihenfolge oder keine Tage: keine gemeinsame Ansicht", () => {
    expect(gemeinsameZeiten({ ...demo, 5: [["10:00", "10:30"]] })).toBeNull();
    expect(gemeinsameZeiten({ 1: [["10:00", "11:00"], ["14:00", "15:00"]], 2: [["14:00", "15:00"], ["10:00", "11:00"]] })).toBeNull();
    expect(gemeinsameZeiten({})).toBeNull();
    expect(gemeinsameZeiten({ 1: [] })).toBeNull();
  });

  it("leere Tage zählen nicht, Kopien sind unabhängig", () => {
    expect(gemeinsameZeiten({ 1: [["09:00", "17:00"]], 2: [] })).toEqual([["09:00", "17:00"]]);
    const v = aufTageVerteilen([["09:00", "17:00"]], [2, 1]);
    expect(Object.keys(v)).toEqual(["1", "2"]);
    v[1][0][0] = "08:00";
    expect(v[2][0][0]).toBe("09:00");
    expect(aufTageVerteilen([], [1, 2])).toEqual({});
  });
});
