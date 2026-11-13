import { describe, expect, it } from "vitest";
import { allowedNumbers, checkText, classify, eligible, monthBounds, parseGermanNumber, previousMonthKey, visibleFacts, type ReportMetrics } from "@/lib/monatsbericht/shared";

const base = (over: Partial<ReportMetrics["current"]> = {}, extra: Partial<ReportMetrics> = {}): ReportMetrics => ({
  month: "2026-10",
  current: { leads: 95, spend: 600, cpl: 6.32, termine: 12, abschluesse: 5, provision: 900, ergebnisQuote: 0.8, activeDays: 25, ...over },
  previous: { leads: 80, spend: 600, cpl: 7.5, termine: 10, abschluesse: 4, provision: 700, ergebnisQuote: 0.7, activeDays: 28 },
  expectedLeads: 100,
  targetCpl: 6,
  actions: [],
  ...extra,
});

describe("Monatsbericht: Einstufung", () => {
  it("gut: Erwartung erreicht, keine Warnzeichen", () => {
    expect(classify(base()).rating).toBe("gut");
  });
  it("mittel: Leads zwischen 60 und 85 % der Erwartung", () => {
    expect(classify(base({ leads: 70, cpl: 6 })).rating).toBe("mittel");
  });
  it("schwach: Leads unter 60 %, Leadpreis über 150 % oder 0 Termine bei vielen Leads", () => {
    expect(classify(base({ leads: 50, cpl: 6 })).rating).toBe("schwach");
    expect(classify(base({ cpl: 9.5 })).rating).toBe("schwach");
    expect(classify(base({ termine: 0 })).rating).toBe("schwach");
  });
  it("Datenlage unsicher bei wenigen eingetragenen Ergebnissen", () => {
    expect(classify(base({ ergebnisQuote: 0.3 })).dataQuality).toBe("unsicher");
  });
  it("Schwellen sind einstellbar", () => {
    const t = { goodLeadsPct: 60, weakLeadsPct: 30, weakCplPct: 200, weakNoMeetingLeads: 50, minResultPct: 10, minActiveDays: 5 };
    expect(classify(base({ leads: 70, cpl: 6 }), t).rating).toBe("gut");
  });
  it("kein Bericht bei wenigen aktiven Tagen (pausiert/neu)", () => {
    expect(eligible(base({ activeDays: 9 }))).toBe(false);
    expect(eligible(base())).toBe(true);
  });
});

describe("Monatsbericht: Kennzahlen und Prüfung", () => {
  it("schwach: keine Abschlüsse/Provision bei unsicherer Datenlage, kein Leadpreis wenn er der Grund ist", () => {
    const m = base({ cpl: 9.5, ergebnisQuote: 0.2 });
    const keys = visibleFacts(m, classify(m)).map((f) => f.key);
    expect(keys).toEqual(["leads", "termine"]);
  });
  it("blockt „Garantie“, Versprechen und erfundene Zahlen", () => {
    const m = base();
    const allowed = allowedNumbers(m, visibleFacts(m, classify(m)));
    expect(checkText("Im Oktober 2026 kamen 95 Leads (Vormonat 80) und 12 Termine.", allowed).ok).toBe(true);
    expect(checkText("Ihre Lead-Garantie ist erfüllt.", allowed).issues[0]).toMatch(/Garantie/);
    expect(checkText("Wir verdoppeln Ihre Abschlüsse.", allowed).ok).toBe(false);
    const r = checkText("Sie hatten 140 Leads.", allowed);
    expect(r.ok).toBe(false);
    expect(r.issues.join()).toMatch(/140/);
  });
  it("liest deutsche Zahlen", () => {
    expect(parseGermanNumber("6,32")).toBe(6.32);
    expect(parseGermanNumber("1.234")).toBe(1234);
    expect(parseGermanNumber("1.234,50")).toBe(1234.5);
  });
  it("Vormonat und Monatsgrenzen in deutscher Zeit", () => {
    expect(previousMonthKey(new Date("2026-11-02T06:00:00Z"))).toBe("2026-10");
    expect(previousMonthKey(new Date("2026-01-02T06:00:00Z"))).toBe("2025-12");
    const b = monthBounds("2026-10");
    expect(b.from.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(b.to.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });
});
