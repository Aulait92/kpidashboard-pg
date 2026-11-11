import { describe, expect, it } from "vitest";
import {
  absenceDays,
  absenceRange,
  availableAgainYmd,
  berlinMidnight,
  berlinYmd,
  blockedSpans,
  extraSearchDays,
  fmtDayShort,
  isActiveAt,
  lastDayYmd,
  returnDayYmd,
} from "@/lib/absence";

const DAY = 24 * 60 * 60 * 1000;

describe("Abwesenheit: Tage in Berliner Zeit", () => {
  it("Tagesbeginn berücksichtigt Winter- und Sommerzeit", () => {
    expect(berlinMidnight("2026-11-20").toISOString()).toBe("2026-11-19T23:00:00.000Z");
    expect(berlinMidnight("2026-07-01").toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("von–bis inklusive: Ende ist der Beginn des Folgetags", () => {
    const r = absenceRange("2026-11-18", "2026-11-22");
    expect(berlinYmd(r.startsAt)).toBe("2026-11-18");
    expect(r.endsAt.toISOString()).toBe(berlinMidnight("2026-11-23").toISOString());
    expect(lastDayYmd(r)).toBe("2026-11-22");
    expect(absenceDays(r)).toBe(5);
  });

  it("ein einzelner Tag gilt den ganzen Tag", () => {
    const r = absenceRange("2026-11-20", "2026-11-20");
    expect(isActiveAt(r, new Date("2026-11-20T05:00:00Z"))).toBe(true);
    expect(isActiveAt(r, new Date("2026-11-20T22:59:00Z"))).toBe(true);
    expect(isActiveAt(r, new Date("2026-11-20T23:00:00Z"))).toBe(false);
  });

  it("Rückkehrtag: nächster Werktag nach dem letzten Tag", () => {
    // bis Freitag → Montag
    expect(returnDayYmd(absenceRange("2026-11-16", "2026-11-20"))).toBe("2026-11-23");
    // bis Sonntag → Montag
    expect(returnDayYmd(absenceRange("2026-11-16", "2026-11-22"))).toBe("2026-11-23");
    // bis Dienstag → Mittwoch
    expect(returnDayYmd(absenceRange("2026-11-16", "2026-11-17"))).toBe("2026-11-18");
  });

  it("Anzeige „Fr., 20.11.“", () => {
    expect(fmtDayShort("2026-11-20")).toBe("Fr., 20.11.");
  });
});

describe("Abwesenheit: Slot-Filter", () => {
  const a = { userId: "a", ...absenceRange("2026-11-16", "2026-11-20") };
  const b = { userId: "b", ...absenceRange("2026-11-18", "2026-11-25") };

  it("eine Person: ihre Abwesenheit ist belegt", () => {
    const spans = blockedSpans(["a"], [a, b]);
    expect(spans).toHaveLength(1);
    expect(spans[0].start.toISOString()).toBe(a.startsAt.toISOString());
    expect(spans[0].end.toISOString()).toBe(a.endsAt.toISOString());
  });

  it("mehrere Personen hinter einem Kalender: nur gesperrt, wenn alle weg sind", () => {
    const spans = blockedSpans(["a", "b"], [a, b]);
    expect(spans).toHaveLength(1);
    expect(berlinYmd(spans[0].start)).toBe("2026-11-18");
    expect(lastDayYmd({ endsAt: spans[0].end })).toBe("2026-11-20");
  });

  it("niemand abwesend → nichts gesperrt", () => {
    expect(blockedSpans(["c"], [a, b])).toEqual([]);
    expect(blockedSpans([], [a, b])).toEqual([]);
  });

  it("Suche läuft um die gesperrten Tage länger (der freieste Kalender zählt)", () => {
    const from = berlinMidnight("2026-11-16");
    const spansA = blockedSpans(["a"], [a]);
    expect(extraSearchDays([spansA], from, 10)).toBe(5);
    expect(extraSearchDays([spansA, []], from, 10)).toBe(0);
  });

  it("ab wann wieder Termine gehen: erst wenn alle Kalender gesperrt sind", () => {
    const now = new Date(berlinMidnight("2026-11-17").getTime() + 10 * 60 * 60 * 1000);
    const spansA = blockedSpans(["a"], [a]);
    expect(availableAgainYmd([spansA], now)).toBe("2026-11-23");
    expect(availableAgainYmd([spansA, []], now)).toBeNull();
    expect(availableAgainYmd([spansA], new Date(a.endsAt.getTime() + DAY))).toBeNull();
  });
});
