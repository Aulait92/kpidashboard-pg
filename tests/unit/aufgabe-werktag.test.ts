import { describe, expect, it } from "vitest";
import { aufWerktag, verschiebeAufgabe } from "@/lib/vertrieb/dates";

describe("Aufgaben verschieben ohne Wochenende (Ole, 22.11.2026)", () => {
  const fr = new Date("2026-11-20T09:00:00Z"); // Freitag 10:00 Berlin
  it("+1 Tag: Freitag → Montag, Donnerstag → Freitag, Samstag → Montag", () => {
    expect(verschiebeAufgabe(fr, 1).toISOString()).toBe("2026-11-23T09:00:00.000Z");
    expect(verschiebeAufgabe(new Date("2026-11-19T09:00:00Z"), 1).toISOString()).toBe("2026-11-20T09:00:00.000Z");
    expect(verschiebeAufgabe(new Date("2026-11-21T09:00:00Z"), 1).toISOString()).toBe("2026-11-23T09:00:00.000Z");
  });
  it("+7 Tage bleibt am Wochentag, vom Wochenende auf Montag", () => {
    expect(verschiebeAufgabe(fr, 7).toISOString()).toBe("2026-11-27T09:00:00.000Z");
    expect(verschiebeAufgabe(new Date("2026-11-22T09:00:00Z"), 7).toISOString()).toBe("2026-11-30T09:00:00.000Z");
    expect(aufWerktag(new Date("2026-11-18T09:00:00Z")).toISOString()).toBe("2026-11-18T09:00:00.000Z");
  });
});
