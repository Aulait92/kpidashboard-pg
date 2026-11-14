import { describe, expect, it } from "vitest";
import { classifyReply } from "@/lib/vertrieb/sentiment";
import { inSendWindow, isLaterInterest, isWorkdayKey, laterTiming, workdaysLater } from "@/lib/vertrieb/spaeter";
import { dayKey, timeKey } from "@/lib/vertrieb/dates";

// Antwort kam am Mi, 12.08.2026
const AUG = new Date("2026-08-12T10:00:00Z");
const berlin = (d: Date) => `${dayKey(d)} ${timeKey(d)}`;

describe("Später-Interesse erkennen", () => {
  it.each([
    "Gerne später nochmal.",
    "Aktuell nicht, aber ab März gerne.",
    "Melden Sie sich nächstes Jahr.",
    "Versuchen Sie es in 3 Monaten nochmal.",
    "Im Moment passt es nicht, kommen Sie nach dem Sommer gerne wieder auf mich zu.",
    "Derzeit keine Kapazität, im 2. Quartal gerne.",
    "Aktuell kein Interesse, aber im neuen Jahr gerne wieder melden.",
    "Wir sind bis Ende Oktober voll, danach gerne.",
    "Zu einem späteren Zeitpunkt gerne.",
  ])("Später: %s", (t) => {
    expect(isLaterInterest(t, AUG)).toBe(true);
    expect(classifyReply(t, null, AUG)).toBe("SPAETER");
  });

  it.each([
    "Kein Interesse.",
    "Bitte nehmen Sie mich aus dem Verteiler, auch nächstes Jahr nicht.",
    "Das passt aktuell leider nicht.",
    "Gerne einen Termin nächste Woche.",
    "Melden Sie sich bitte nicht mehr, auch nicht im März.",
    "Klingt interessant, rufen Sie mich gerne an.",
    "Ich gehe ab März in Rente.",
  ])("kein Später: %s", (t) => expect(isLaterInterest(t, AUG)).toBe(false));

  it("Absagen bleiben Absagen", () => {
    expect(classifyReply("Wir möchten das derzeit nicht.", null, AUG)).toBe("NEGATIV");
    expect(classifyReply("Bitte abmelden, auch in Zukunft nicht.", null, AUG)).toBe("NEGATIV");
  });
});

describe("Zeitpunkt ableiten", () => {
  it("Monat: ab März → erster Werktag im März des Folgejahres, vormittags", () => {
    const t = laterTiming("Aktuell nicht, aber ab März gerne.", AUG, "x");
    expect(dayKey(t.date)).toBe("2027-03-01");
    expect(t.label).toBe("ab März");
    const hour = Number(timeKey(t.date).slice(0, 2));
    expect(hour).toBeGreaterThanOrEqual(9);
    expect(hour).toBeLessThan(12);
  });
  it("nächstes Jahr → zweite Januarwoche", () => {
    const t = laterTiming("Melden Sie sich nächstes Jahr.", AUG);
    expect(dayKey(t.date)).toBe("2027-01-08");
    expect(t.label).toBe("im neuen Jahr");
  });
  it("nach dem Sommer → Anfang September (im Sommer selbst: nächstes Jahr)", () => {
    expect(dayKey(laterTiming("nach dem Sommer gerne wieder", new Date("2026-05-04T10:00:00Z")).date)).toBe("2026-09-01");
    expect(laterTiming("nach dem Sommer", new Date("2026-05-04T10:00:00Z")).label).toBe("nach dem Sommer");
  });
  it("Quartal", () => {
    expect(dayKey(laterTiming("im 2. Quartal gerne", AUG).date)).toBe("2027-04-01");
    expect(dayKey(laterTiming("im nächsten Quartal", AUG).date)).toBe("2026-10-01");
  });
  it("in 3 Monaten → 3 Monate später auf einen Werktag", () => {
    const t = laterTiming("in 3 Monaten nochmal", AUG);
    expect(dayKey(t.date)).toBe("2026-11-12");
    expect(t.label).toBe("in einigen Monaten");
  });
  it("bis Oktober voll → ab November", () => {
    const t = laterTiming("Wir sind bis Oktober voll, danach gerne.", AUG);
    expect(dayKey(t.date)).toBe("2026-11-02");
    expect(t.label).toBe("ab November");
  });
  it("ohne Angabe: in 3 Monaten; Wochenende → Montag", () => {
    // 3 Monate nach Fr, 14.08.2026 = Sa, 14.11.2026 → Mo, 16.11.
    const t = laterTiming("Gerne später nochmal.", new Date("2026-08-14T10:00:00Z"));
    expect(dayKey(t.date)).toBe("2026-11-16");
    expect(t.label).toBeNull();
  });
  it("spätester genannter Zeitpunkt zählt", () => {
    expect(dayKey(laterTiming("Im Januar ist Jahresabschluss, ab Februar gerne.", AUG).date)).toBe("2027-02-01");
  });
  it("Feiertage und Wochenenden sind keine Werktage", () => {
    expect(isWorkdayKey("2026-12-25")).toBe(false);
    expect(isWorkdayKey("2027-03-26")).toBe(false); // Karfreitag 2027
    expect(isWorkdayKey("2026-11-14")).toBe(false); // Samstag
    expect(isWorkdayKey("2026-11-16")).toBe(true);
  });
  it("5 Werktage später", () => {
    expect(dayKey(workdaysLater(new Date("2026-11-13T09:00:00Z"), 5))).toBe("2026-11-20");
  });
  it("Versandfenster werktags 8–17 Uhr", () => {
    expect(inSendWindow(new Date("2026-11-16T08:00:00Z"))).toBe(true); // 9 Uhr
    expect(inSendWindow(new Date("2026-11-16T16:30:00Z"))).toBe(false); // 17:30 Uhr
    expect(inSendWindow(new Date("2026-11-14T10:00:00Z"))).toBe(false); // Samstag
    expect(berlin(new Date("2026-11-16T08:00:00Z"))).toBe("2026-11-16 09:00");
  });
});
