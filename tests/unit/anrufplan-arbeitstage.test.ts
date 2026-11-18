import { describe, expect, it } from "vitest";
import { berlinWallTime, nextCallAttemptAt } from "@/lib/call-plan";

const tag = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short" }).format(d);

describe("Anrufplan: Arbeitstage (Ole, 18.11.2026: keine Samstage, wenn der Vermittler samstags nicht arbeitet)", () => {
  // Start Donnerstag 19.11.2026, 10 Uhr: Versuch 5 (Tag 4 → Mo) und 6 (Tag 6 → Mi) regulär, Versuch 4 (Tag 1 → Fr)
  const start = berlinWallTime(2026, 11, 19, 10, 0);
  it("Standard Mo bis Fr: ein Versuch, der auf Samstag fiele, rückt auf Montag", () => {
    // Start Mittwoch 18.11.: Versuch 5 = Tag 3 (Sa 21.11., 15 Uhr)
    const mi = berlinWallTime(2026, 11, 18, 9, 47);
    const v5 = nextCallAttemptAt({ done: 4, startedAt: mi, lastAt: berlinWallTime(2026, 11, 19, 10, 0), now: berlinWallTime(2026, 11, 19, 10, 0) })!;
    expect(tag(v5)).toBe("Mo");
    expect(new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(v5)).toBe("15:00");
  });
  it("wer samstags arbeitet, bekommt den Samstag", () => {
    const mi = berlinWallTime(2026, 11, 18, 9, 47);
    const v5 = nextCallAttemptAt({ done: 4, startedAt: mi, lastAt: berlinWallTime(2026, 11, 19, 10, 0), now: berlinWallTime(2026, 11, 19, 10, 0), arbeitstage: [1, 2, 3, 4, 5, 6] })!;
    expect(tag(v5)).toBe("Sa");
  });
  it("nie sonntags, auch nicht mit Sonntag in den Arbeitstagen", () => {
    const v = nextCallAttemptAt({ done: 5, startedAt: start, lastAt: berlinWallTime(2026, 11, 21, 15, 0), now: berlinWallTime(2026, 11, 21, 15, 0), arbeitstage: [0, 1, 2, 3, 4, 5, 6] })!;
    expect(tag(v)).not.toBe("So");
  });
});
