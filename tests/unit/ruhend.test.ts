// Ruhendes Konto nach Vertragsende: Aufbewahrung (24 Monate, 3 Monate, sofort), Löschzeitpunkt, Erinnerungen,
// Status (lib/ruhend-shared.ts) und Monatsbetrag (lib/ruhend.mrrFromFields).
import { describe, expect, it } from "vitest";
import {
  contractEnded,
  deleteAfterFor,
  isRetentionChoice,
  lifecycleState,
  normalizeRetention,
  RETENTION_NOTICE,
  retentionLastDayIso,
  retentionReminderDue,
  retentionText,
} from "@/lib/ruhend-shared";
import { mrrFromFields } from "@/lib/ruhend";
import { dormantTarget } from "@/lib/login-ziel-server";

const DAY = 86_400_000;

describe("Aufbewahrung nach Vertragsende", () => {
  it("Standard 24 Monate, sonst 3 Monate oder sofort; Unbekanntes wird 24 Monate", () => {
    expect(normalizeRetention(undefined)).toBe("24m");
    expect(normalizeRetention("quatsch")).toBe("24m");
    expect(normalizeRetention("3m")).toBe("3m");
    expect(isRetentionChoice("sofort")).toBe(true);
    expect(isRetentionChoice("12m")).toBe(false);
  });

  it("Ruhephase beginnt am Tag nach dem letzten Vertragstag", () => {
    expect(retentionLastDayIso("2027-09-30", "24m")).toBe("2029-09-30");
    expect(retentionLastDayIso("2027-09-30", "3m")).toBe("2027-12-31");
    expect(retentionLastDayIso("2027-09-30", "sofort")).toBe("2027-09-30");
    // Monatsende: fehlt der Tag im Zielmonat, endet die Frist mit dem Monatsletzten
    expect(retentionLastDayIso("2027-01-30", "3m")).toBe("2027-04-30");
  });

  it("Löschung fällig ab Ende des letzten Aufbewahrungstags in Berlin (Sommer- und Winterzeit)", () => {
    expect(deleteAfterFor("2027-09-30", "24m").toISOString()).toBe("2029-09-30T22:00:00.000Z");
    expect(deleteAfterFor("2027-09-30", "3m").toISOString()).toBe("2027-12-31T23:00:00.000Z");
    expect(deleteAfterFor("2027-09-30", "sofort").toISOString()).toBe("2027-09-30T22:00:00.000Z");
  });

  it("Texte ohne Gedankenstriche, Hinweis wie von Ole vorgegeben", () => {
    expect(RETENTION_NOTICE).toBe(
      "Ihre Daten bewahren wir 24 Monate auf, damit Sie jederzeit zurückkommen können. Danach löschen wir sie endgültig. Sie können auch eine frühere Löschung wählen.",
    );
    expect(retentionText("2027-09-30", "24m")).toBe("Wir bewahren Ihre Daten bis einschließlich 30.09.2029 auf und löschen sie danach endgültig.");
    expect(retentionText("2027-09-30", "sofort")).toBe("Wir löschen Ihre Daten direkt nach Vertragsende am 30.09.2027.");
    expect(`${RETENTION_NOTICE}${retentionText("2027-09-30", "3m")}`).not.toMatch(/[–—]/);
  });

  it("Vertrag beendet erst nach dem Ende des letzten Tags", () => {
    expect(contractEnded("2027-09-30", new Date("2027-09-30T21:59:00Z"))).toBe(false);
    expect(contractEnded("2027-09-30", new Date("2027-09-30T22:00:00Z"))).toBe(true);
  });
});

describe("Erinnerungen 30 und 7 Tage vor der Löschung", () => {
  const deleteAfter = new Date("2029-10-01T00:00:00Z");
  const at = (daysBefore: number) => new Date(deleteAfter.getTime() - daysBefore * DAY);
  const base = { deleteAfter, reminder30At: null, reminder7At: null };

  it("nichts vor 30 Tagen, dann 30, dann 7, dann nichts mehr", () => {
    expect(retentionReminderDue(base, at(31))).toBeNull();
    expect(retentionReminderDue(base, at(30))).toBe("30");
    expect(retentionReminderDue({ ...base, reminder30At: at(30) }, at(20))).toBeNull();
    expect(retentionReminderDue({ ...base, reminder30At: at(30) }, at(7))).toBe("7");
    expect(retentionReminderDue({ ...base, reminder30At: at(30), reminder7At: at(7) }, at(1))).toBeNull();
  });

  it("später gewählt (unter 7 Tagen): nur die 7-Tage-Erinnerung; nach der Löschung oder ohne Termin keine", () => {
    expect(retentionReminderDue(base, at(3))).toBe("7");
    expect(retentionReminderDue(base, at(0))).toBeNull();
    expect(retentionReminderDue({ ...base, dataDeletedAt: at(1) }, at(5))).toBeNull();
    expect(retentionReminderDue({ deleteAfter: null, reminder30At: null, reminder7At: null }, at(5))).toBeNull();
  });
});

describe("Status und Monatsbetrag", () => {
  it("aktiv, gekündigt, ruhend, gelöscht", () => {
    const d = new Date();
    expect(lifecycleState({ cancelEffectiveAt: null, dormantSince: null, dataDeletedAt: null })).toBe("aktiv");
    expect(lifecycleState({ cancelEffectiveAt: d, dormantSince: null, dataDeletedAt: null })).toBe("gekuendigt");
    expect(lifecycleState({ cancelEffectiveAt: d, dormantSince: d, dataDeletedAt: null })).toBe("ruhend");
    expect(lifecycleState({ cancelEffectiveAt: d, dormantSince: d, dataDeletedAt: d })).toBe("geloescht");
  });

  it("Monatsbetrag: Betreuung + Plätze + Module, Jahreszahlung mit Freimonaten auf den Monat verteilt", () => {
    const c = { retainerMonthly: "1000", seatsBilled: 2, seatMonthly: "49", bestandMonthly: "99", empfehlungMonthly: null, billingInterval: "month" };
    expect(mrrFromFields(c)).toBe(1197);
    expect(mrrFromFields({ ...c, billingInterval: "year" }, 2)).toBe(997.5); // 1197 × 10 / 12
    expect(mrrFromFields({ retainerMonthly: null, seatsBilled: 0, seatMonthly: null, bestandMonthly: null, empfehlungMonthly: null, billingInterval: "month" })).toBe(0);
  });

  it("Login eines ruhenden Kontos landet auf der Seite für ruhende Konten (Export-Link aus der Mail bleibt)", () => {
    expect(dormantTarget("/buyer/leads")).toBe("/buyer/ruhend");
    expect(dormantTarget("/buyer/konto/export")).toBe("/buyer/konto/export");
    expect(dormantTarget("/buyer/ruhend#reaktivieren")).toBe("/buyer/ruhend#reaktivieren");
    expect(dormantTarget(undefined)).toBe("/buyer/ruhend");
  });
});
