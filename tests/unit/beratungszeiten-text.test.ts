import { describe, expect, it } from "vitest";
import { beratungszeitenText, tageText } from "@/lib/calendar/zeiten-gleich";
import { DEFAULT_LEAD_TIMES } from "@/lib/calendar/lead-times";

// „Ich habe keinen Online-Kalender“ (25.11.2026): Beratungszeiten als kurzer Text in der Einrichtung
describe("Beratungszeiten als Text", () => {
  it("Wochentage: Folgen ab drei Tagen zusammengefasst, Sonntag am Ende", () => {
    expect(tageText([1, 2, 3, 4, 5])).toBe("Mo bis Fr");
    expect(tageText([5, 1, 3])).toBe("Mo, Mi, Fr");
    expect(tageText([1, 2, 3, 5, 6])).toBe("Mo bis Mi, Fr, Sa");
    expect(tageText([0, 6])).toBe("Sa, So");
  });

  it("Standard und einheitliche Zeiten", () => {
    expect(beratungszeitenText(DEFAULT_LEAD_TIMES.schedule!.days)).toBe("Mo bis Fr, 10 bis 17 Uhr");
    const r: [string, string][] = [["09:30", "12:00"], ["14:00", "18:00"]];
    expect(beratungszeitenText({ 1: r, 3: r })).toBe("Mo, Mi, 9:30 bis 12 und 14 bis 18 Uhr");
  });

  it("verschiedene Zeiten je Tag und keine Zeiten", () => {
    expect(beratungszeitenText({ 1: [["09:00", "12:00"]], 2: [["13:00", "17:00"]] })).toBe("Mo, Di (je Tag verschieden)");
    expect(beratungszeitenText({})).toBeNull();
  });

  it("ohne Gedankenstriche", () => {
    expect(beratungszeitenText(DEFAULT_LEAD_TIMES.schedule!.days)).not.toMatch(/[–—]/);
  });
});
