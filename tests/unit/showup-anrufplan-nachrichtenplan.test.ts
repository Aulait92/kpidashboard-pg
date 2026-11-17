// Show-up-Paket (Ole, 17.11.2026): Auslöser des Anrufplans nach dem Erstanschreiben und Nachrichtenplan je Lead.
import { describe, expect, it } from "vitest";
import { anrufPush, anrufStartZeitpunkt, geschaeftszeitTag } from "@/lib/anruf-ausloeser";
import { DEFAULT_LEAD_TIMES, type LeadTimes } from "@/lib/calendar/lead-times";
import { planeNachrichten, type PlanEingabe } from "@/lib/nachrichtenplan";

const MIN = 60 * 1000;
const H = 60 * MIN;
const DAY = 24 * H;

describe("Anrufplan-Auslöser: 30 Min. nach dem Erstanschreiben, in den Geschäftszeiten", () => {
  // Mo–Fr 9 bis 17 Uhr (Startzeiten 9:00 … 16:30, 30 Min.)
  const lt: LeadTimes = { weekdays: [1, 2, 3, 4, 5], times: ["09:00", "12:00", "16:30"], durationMin: 30 };
  it("Geschäftszeit aus der Verfügbarkeit (erste Startzeit bis Ende des letzten Termins)", () => {
    expect(geschaeftszeitTag(lt, 2)).toEqual({ von: 9 * 60, bis: 17 * 60 });
    expect(geschaeftszeitTag(lt, 0)).toBeNull();
    // Standard ohne Einstellung: Mo bis Fr 10, 14, 16 Uhr → 10 bis 16:30
    expect(geschaeftszeitTag(DEFAULT_LEAD_TIMES, 3)).toEqual({ von: 10 * 60, bis: 16 * 60 + 30 });
  });
  it("in der Geschäftszeit sofort, davor zu Beginn, danach am nächsten Arbeitstag morgens", () => {
    // Di 17.11.2026, 10:40 Berlin
    const tag = new Date("2026-11-17T09:40:00.000Z");
    expect(anrufStartZeitpunkt(tag, lt).toISOString()).toBe(tag.toISOString());
    // Di 7:30 → 9:00
    expect(anrufStartZeitpunkt(new Date("2026-11-17T06:30:00.000Z"), lt).toISOString()).toBe("2026-11-17T08:00:00.000Z");
    // Di 18:10 → Mi 9:00
    expect(anrufStartZeitpunkt(new Date("2026-11-17T17:10:00.000Z"), lt).toISOString()).toBe("2026-11-18T08:00:00.000Z");
    // Fr 20:00 → Mo 9:00
    expect(anrufStartZeitpunkt(new Date("2026-11-20T19:00:00.000Z"), lt).toISOString()).toBe("2026-11-23T08:00:00.000Z");
  });
  it("Push wie von Ole vorgegeben, mit Anruf-Deep-Link", () => {
    const p = anrufPush({ leadId: "l1", name: "Frau Becker" });
    expect(p.title).toBe("Frau Becker hat noch nicht geantwortet. Jetzt anrufen?");
    expect(p.url).toBe("/buyer?anrufen=l1#anrufen");
  });
});

describe("Nachrichtenplan je Lead", () => {
  // Di 17.11.2026, 10:00 Berlin
  const now = new Date("2026-11-17T09:00:00.000Z");
  const basis = (extra: Partial<PlanEingabe> = {}): PlanEingabe => ({
    now,
    an: "sie",
    hi: "Guten Tag Frau Becker,",
    person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" },
    label: "Frau Becker",
    leadId: "l1",
    termine: [],
    email: true,
    whatsapp: true,
    abfolgen: [],
    abfolgeKontext: { firstName: "Anna", hi: "Guten Tag Frau Becker,", kontakt: { fullName: "Anna Becker", salutation: "Frau" }, topic: "Hausrat", an: "sie" },
    anrufplan: { followUpAt: null, followUpNote: null, callAttempts: 0, callPlanStartedAt: null, lastCallAttemptAt: null },
    ...extra,
  });

  it("Termin übermorgen: Vortag (WhatsApp und Mail), 1 Std., 15 Min., Push zum Beginn, sortiert, mit Vorschau", () => {
    const start = new Date(now.getTime() + 48 * H);
    const plan = planeNachrichten(
      basis({
        termine: [
          { id: "t1", startsAt: start, createdAt: now, mode: "video", meetUrl: "https://meet.google.com/x", status: "booked", komplettcheck: true, reminderSentAt: null, soonReminderSentAt: null, startReminderSentAt: null, startPushAt: null, rescheduleRequestedAt: null, attendance: null },
        ],
        nutzen: { t1: "In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was Hausrat kostet." },
        wann: { t1: "morgen um 10 Uhr" },
        mailBetreff: { t1: "Morgen um 10 Uhr: Ihr Videotermin mit Herrn Kannapinn" },
      }),
    );
    expect(plan.map((e) => [e.kanal, e.titel])).toEqual([
      ["whatsapp", "Erinnerung am Vortag"],
      ["email", "Erinnerungs-Mail am Vortag"],
      ["whatsapp", "Erinnerung 1 Stunde vorher"],
      ["whatsapp", "Erinnerung 15 Minuten vorher"],
      ["push", "Push an Sie zum Terminbeginn"],
    ]);
    expect(plan[0].at).toBe(new Date(start.getTime() - 24 * H).toISOString());
    expect(plan[0].vorschau).toContain("Legen Sie gern Ihre bestehenden Verträge bereit.");
    expect(plan[1].vorschau).toBe("Betreff: Morgen um 10 Uhr: Ihr Videotermin mit Herrn Kannapinn");
    expect(plan[4].vorschau).toBe("Ist Frau Becker da?");
    // nach „Bitte verschieben“: nur noch der Push (Termin besteht noch), keine Erinnerungen
    const verschoben = planeNachrichten(basis({ termine: [{ ...basis().termine[0], id: "t1", startsAt: start, createdAt: now, mode: "video", meetUrl: "x", status: "booked", komplettcheck: null, reminderSentAt: null, soonReminderSentAt: null, startReminderSentAt: null, startPushAt: null, rescheduleRequestedAt: now, attendance: null }] }));
    expect(verschoben.filter((e) => e.quelle === "erinnerung")).toHaveLength(0);
  });

  it("kurzfristig gebucht: ohne Vortag; Telefontermin ohne 15 Min. und ohne Push", () => {
    const start = new Date(now.getTime() + 5 * H);
    const plan = planeNachrichten(
      basis({ termine: [{ id: "t2", startsAt: start, createdAt: now, mode: "phone", meetUrl: null, status: "booked", komplettcheck: null, reminderSentAt: null, soonReminderSentAt: null, startReminderSentAt: null, startPushAt: null, rescheduleRequestedAt: null, attendance: null }] }),
    );
    expect(plan.map((e) => e.titel)).toEqual(["Erinnerung 1 Stunde vorher"]);
    expect(plan[0].vorschau).toContain("in einer Stunde ist Ihr Telefontermin mit Herrn Kannapinn");
  });

  it("No-Show-Abfolge mit Vorschau; Anrufplan „Anrufversuch 2 von 6“ und die weiteren Versuche", () => {
    const plan = planeNachrichten(
      basis({
        abfolgen: [{ id: "s1", kind: "no_show", step: 0, startedAt: now, nextAt: now, stoppedAt: null }],
        anrufplan: { followUpAt: new Date(now.getTime() + 2 * H), followUpNote: "Anrufversuch 2 von 6", callAttempts: 1, callPlanStartedAt: now, lastCallAttemptAt: now },
      }),
    );
    const wa = plan.filter((e) => e.quelle === "abfolge");
    expect(wa).toHaveLength(2);
    expect(wa[0].vorschau).toBe("Guten Tag Frau Becker, kein Problem, so etwas passiert. Sollen wir einen neuen Termin finden?");
    expect(wa[1].at).toBe(new Date(now.getTime() + DAY).toISOString());
    const anrufe = plan.filter((e) => e.quelle === "anrufplan");
    expect(anrufe.map((e) => e.titel)).toEqual(["Anrufversuch 2 von 6", "Anrufversuch 3 von 6", "Anrufversuch 4 von 6", "Anrufversuch 5 von 6", "Anrufversuch 6 von 6"]);
    expect(anrufe[0].voraussichtlich).toBe(false);
    expect(anrufe[1].voraussichtlich).toBe(true);
    for (let i = 1; i < plan.length; i++) expect(plan[i].at >= plan[i - 1].at).toBe(true);
  });

  it("vor dem Auslöser: Push an den Vermittler und 6 Anrufversuche voraussichtlich; mit Termin keine Abfolgen", () => {
    const plan = planeNachrichten(basis({ anrufAusloeserAt: new Date(now.getTime() + 30 * MIN) }));
    expect(plan[0]).toMatchObject({ kanal: "push", vorschau: "Frau Becker hat noch nicht geantwortet. Jetzt anrufen?" });
    expect(plan.filter((e) => e.kanal === "anruf")).toHaveLength(6);
    const mitTermin = planeNachrichten(
      basis({
        abfolgen: [{ id: "s1", kind: "silent", step: 0, startedAt: now, nextAt: now, stoppedAt: null }],
        termine: [{ id: "t3", startsAt: new Date(now.getTime() + 3 * DAY), createdAt: now, mode: "video", meetUrl: "x", status: "booked", komplettcheck: null, reminderSentAt: null, soonReminderSentAt: null, startReminderSentAt: null, startPushAt: null, rescheduleRequestedAt: null, attendance: null }],
      }),
    );
    expect(mitTermin.some((e) => e.quelle === "abfolge")).toBe(false);
  });
});
