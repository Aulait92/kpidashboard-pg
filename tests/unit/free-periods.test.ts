// Kostenlose Zeiträume: einheitlich 7 Tage vorher Hinweis im Kundenbereich (AGB, Ole 14.11.2026)
import { describe, expect, it } from "vitest";
import { FREE_PERIOD_REMINDER_DAYS, freePeriodNotices } from "@/lib/free-periods";
import { AGB } from "@/lib/legal-texts";
import { bookingTerms, TRIAL_REMINDER_DAYS } from "@/lib/empfehlung/shared";
import { BESTAND_FREE_REMINDER_DAYS } from "@/lib/kollegen";

const now = new Date("2026-11-14T10:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86400000);

describe("kostenlose Zeiträume", () => {
  it("überall 7 Tage", () => {
    expect(FREE_PERIOD_REMINDER_DAYS).toBe(7);
    expect(TRIAL_REMINDER_DAYS).toBe(7);
    expect(BESTAND_FREE_REMINDER_DAYS).toBe(7);
  });

  it("Hinweis erst in den letzten 7 Tagen, nicht nach Kündigung oder Buchung", () => {
    const trial = { empfehlungEnabled: true, empfehlungMonthly: null, empfehlungFree: false, empfehlungCancelAt: null };
    expect(freePeriodNotices({ ...trial, empfehlungTrialEndsAt: inDays(8) }, { empfehlungPrice: 49, now })).toHaveLength(0);
    const n = freePeriodNotices({ ...trial, empfehlungTrialEndsAt: inDays(6) }, { empfehlungPrice: 49, now });
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ key: "empfehlung", href: "/buyer/konto?modul=empfehlung#zusatzmodule" });
    expect(n[0].text).toMatch(/49\s€ netto im Monat/);
    expect(freePeriodNotices({ ...trial, empfehlungCancelAt: inDays(6), empfehlungTrialEndsAt: inDays(6) }, { empfehlungPrice: 49, now })).toHaveLength(0);
    expect(freePeriodNotices({ ...trial, empfehlungMonthly: 49, empfehlungTrialEndsAt: inDays(6) }, { empfehlungPrice: 49, now })).toHaveLength(0);
    expect(freePeriodNotices({ bestandFreeUntil: inDays(3), bestandMonthly: 149, bestandCancelAt: null }, { empfehlungPrice: 49, now })[0]).toMatchObject({ key: "bestand" });
    expect(freePeriodNotices({ bestandFreeUntil: inDays(-1), bestandMonthly: 149 }, { empfehlungPrice: 49, now })).toHaveLength(0);
  });

  it("AGB-Abschnitt und Buchungstext ohne Gedankenstriche", () => {
    const sec = AGB.find((s) => s.title === "Testphasen und kostenlose Zeiträume");
    expect(sec?.items).toHaveLength(8);
    expect(JSON.stringify(sec)).not.toMatch(/[–—]/);
    const t = bookingTerms({ trial: true, annual: false, now });
    expect(t.lines.join(" ")).toMatch(/jederzeit kostenlos beendbar/);
    expect(t.lines.join(" ")).toMatch(/7 Tage vor Ende/);
  });
});
