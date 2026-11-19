// Terminseite: Zusage und Erinnerungen sichtbar (lib/termin-seite.ts).
import { describe, expect, it } from "vitest";
import { erinnerungsZeilen, terminBestaetigung, zeitKurzRelativ } from "@/lib/termin-seite";
import type { PlanEintrag } from "@/lib/nachrichtenplan";

// 19.11.2026, 12:00 Berlin (Winterzeit, UTC+1)
const now = new Date("2026-11-19T11:00:00.000Z");
const morgen10 = new Date("2026-11-20T09:00:00.000Z");

describe("zeitKurzRelativ", () => {
  it("heute, morgen, gestern, sonst Wochentag und Datum (Berliner Zeit)", () => {
    expect(zeitKurzRelativ(new Date("2026-11-19T08:30:00.000Z"), now)).toBe("heute 09:30");
    expect(zeitKurzRelativ(morgen10, now)).toBe("morgen 10:00");
    expect(zeitKurzRelativ(new Date("2026-11-18T17:00:00.000Z"), now)).toBe("gestern 18:00");
    expect(zeitKurzRelativ(new Date("2026-11-23T09:00:00.000Z"), now)).toMatch(/^Mo\.?, 23\.11\. 10:00$/);
  });
  it("Mitternacht Berlin zählt zum neuen Tag", () => {
    expect(zeitKurzRelativ(new Date("2026-11-19T23:30:00.000Z"), now)).toBe("morgen 00:30");
  });
});

describe("terminBestaetigung", () => {
  const t = { status: "booked", startsAt: morgen10 };
  it("zugesagt mit Zeitpunkt", () => {
    expect(terminBestaetigung({ ...t, confirmedAt: new Date("2026-11-19T08:00:00.000Z") }, now)).toEqual({ ton: "ok", text: "Zugesagt heute 09:00" });
  });
  it("offen, solange der Termin ansteht", () => {
    expect(terminBestaetigung(t, now)).toEqual({ ton: "offen", text: "Noch nicht bestätigt" });
  });
  it("„Bitte verschieben“ geht vor der Zusage", () => {
    expect(terminBestaetigung({ ...t, confirmedAt: now, rescheduleRequestedAt: now }, now)?.ton).toBe("verschieben");
  });
  it("vorbei, abgesagt oder erledigt ohne Zusage: nichts", () => {
    expect(terminBestaetigung({ status: "booked", startsAt: new Date(now.getTime() - 1) }, now)).toBeNull();
    expect(terminBestaetigung({ status: "cancelled", startsAt: morgen10 }, now)).toBeNull();
    expect(terminBestaetigung({ status: "completed", startsAt: morgen10, rescheduleRequestedAt: now }, now)).toBeNull();
  });
});

describe("erinnerungsZeilen", () => {
  const eintrag = (art: string, at: string, o: Partial<PlanEintrag> = {}): PlanEintrag => ({
    key: `erinnerung:a1:${art}`,
    at,
    kanal: "whatsapp",
    quelle: "erinnerung",
    titel: art,
    vorschau: "",
    terminId: "a1",
    ...o,
  });
  it("gesendete und geplante in zeitlicher Reihenfolge, andere Termine und Quellen nicht", () => {
    const z = erinnerungsZeilen(
      { id: "a1", reminderSentAt: new Date("2026-11-19T09:00:00.000Z") },
      [
        eintrag("gleich", "2026-11-20T08:45:00.000Z"),
        eintrag("stunde", "2026-11-20T08:00:00.000Z"),
        eintrag("stunde", "2026-11-20T08:00:00.000Z", { terminId: "a2", key: "erinnerung:a2:stunde" }),
        { ...eintrag("x", "2026-11-20T09:00:00.000Z"), quelle: "terminbeginn", key: "start:a1" },
      ],
      now,
    );
    expect(z).toEqual([
      { key: "vortag", titel: "WhatsApp am Vortag", stand: "gesendet", wann: "heute 10:00", planKey: null },
      { key: "stunde", titel: "WhatsApp 1 Stunde vorher", stand: "geplant", wann: "morgen 09:00", planKey: "erinnerung:a1:stunde" },
      { key: "gleich", titel: "WhatsApp 15 Minuten vorher", stand: "geplant", wann: "morgen 09:45", planKey: "erinnerung:a1:gleich" },
    ]);
  });
  it("übersprungen ohne Zeit, pausiert als pausiert; Gesendetes nicht doppelt", () => {
    const z = erinnerungsZeilen(
      { id: "a1", soonReminderSentAt: new Date("2026-11-19T10:00:00.000Z") },
      [eintrag("vortag_mail", "2026-11-19T12:00:00.000Z", { uebersprungen: true }), eintrag("gleich", "2026-11-19T12:45:00.000Z", { pausiert: true }), eintrag("stunde", "2026-11-19T12:00:00.000Z")],
      now,
    );
    expect(z.map((x) => [x.key, x.stand, x.wann, x.planKey])).toEqual([
      ["stunde", "gesendet", "heute 11:00", null],
      ["vortag_mail", "uebersprungen", null, "erinnerung:a1:vortag_mail"],
      ["gleich", "pausiert", "heute 13:45", "erinnerung:a1:gleich"],
    ]);
  });
});
