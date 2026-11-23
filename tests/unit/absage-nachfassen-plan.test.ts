// Nachfassen nach einer Absage (lib/absage-nachfassen.ts) in „Nächste Nachrichten“: vorher sichtbar, überspringbar,
// im Versandfenster (Mo bis Sa 9 bis 19 Uhr) wie runSequences.
import { describe, expect, it } from "vitest";
import { planeNachrichten, type PlanEingabe } from "@/lib/nachrichtenplan";

const MIN = 60 * 1000;

const eingabe = (now: Date, kind: "absage" | "absage_b"): PlanEingabe => ({
  now,
  an: "sie",
  hi: "Guten Tag Frau Becker,",
  person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" },
  label: "Frau Becker",
  leadId: "l1",
  termine: [],
  email: true,
  whatsapp: true,
  abfolgen: [{ id: "s1", kind, step: 0, startedAt: now, nextAt: new Date(now.getTime() + 20 * MIN), stoppedAt: null }],
  abfolgeKontext: { firstName: "Anna", hi: "Guten Tag Frau Becker,", kontakt: { fullName: "Anna Becker", salutation: "Frau" }, topic: "Hausrat", an: "sie", person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" } },
  anrufplan: { followUpAt: null, followUpNote: null, callAttempts: 0, callPlanStartedAt: null, lastCallAttemptAt: null },
});

describe("Nächste Nachrichten: Nachfassen nach Absage", () => {
  it("tagsüber 20 Minuten nach der Absage, mit Text und Aktionen", () => {
    // Di 17.11.2026, 10:00 Berlin
    const now = new Date("2026-11-17T09:00:00.000Z");
    const [e] = planeNachrichten(eingabe(now, "absage")).filter((x) => x.quelle === "abfolge");
    expect(e.at).toBe(new Date(now.getTime() + 20 * MIN).toISOString());
    expect(e.kanal).toBe("whatsapp");
    expect(e.titel).toMatch(/^Termin abgesagt: WhatsApp/);
    expect(e.vorschau).toBe("Guten Tag Frau Becker, schade, dass es mit dem Termin nicht geklappt hat. Sollen wir einen neuen Termin mit Herrn Kannapinn finden?");
    expect(e.aktionen).toEqual(["jetzt", "verschieben", "ueberspringen"]);
  });

  it("abends abgesagt: erst am nächsten Morgen um 9 Uhr; Fassung B mit zwei freien Zeiten", () => {
    // Di 17.11.2026, 21:30 Berlin
    const now = new Date("2026-11-17T20:30:00.000Z");
    const [e] = planeNachrichten(eingabe(now, "absage_b")).filter((x) => x.quelle === "abfolge");
    expect(e.at).toBe("2026-11-18T08:00:00.000Z");
    expect(e.titel).toContain("mit zwei freien Zeiten");
  });
});
