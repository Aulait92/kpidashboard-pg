// „Chat ruht“ noch im 24-Stunden-Fenster (Ole, 22.11.2026)
import { describe, expect, it } from "vitest";
import { CHAT_RUHT_STUNDEN, imChatFensterVorziehen, inSendWindow, SONNTAG_NACHFASS_STUNDEN } from "@/lib/lead-sequences";

const b = (s: string) => new Date(`${s}+01:00`); // Berlin Winterzeit

describe("imChatFensterVorziehen", () => {
  it("Sonntag 19:43 fällig, Fenster schließt Montag 08:20: vorziehen auf Sonntag vor 18 Uhr", () => {
    const t = imChatFensterVorziehen({ due: b("2026-11-22T19:43:00"), fensterBis: b("2026-11-23T08:20:00"), now: b("2026-11-22T13:45:00"), sonntag: SONNTAG_NACHFASS_STUNDEN });
    expect(t.getTime()).toBeLessThan(b("2026-11-22T18:00:00").getTime());
    expect(t.getTime()).toBeGreaterThan(b("2026-11-22T17:00:00").getTime());
  });
  it("Fenster offen bis Montag 11:43: Montag 9 Uhr reicht, Plan bleibt", () => {
    const due = b("2026-11-22T19:43:00");
    expect(imChatFensterVorziehen({ due, fensterBis: b("2026-11-23T11:43:00"), now: b("2026-11-22T13:45:00"), sonntag: SONNTAG_NACHFASS_STUNDEN })).toEqual(due);
  });
  it("ohne Fenster oder Fenster schon zu: Plan bleibt", () => {
    const due = b("2026-11-24T10:00:00");
    expect(imChatFensterVorziehen({ due, fensterBis: null, now: b("2026-11-24T08:00:00") })).toEqual(due);
    expect(imChatFensterVorziehen({ due, fensterBis: b("2026-11-24T07:00:00"), now: b("2026-11-24T08:00:00") })).toEqual(due);
  });
  it("Werktag 22 Uhr fällig, Fenster schließt 06:00: auf vor 19 Uhr", () => {
    const t = imChatFensterVorziehen({ due: b("2026-11-24T22:00:00"), fensterBis: b("2026-11-25T06:00:00"), now: b("2026-11-24T12:00:00") });
    expect(t.getTime()).toBeLessThan(b("2026-11-24T19:00:00").getTime());
  });
  it("werktags ab 8 Uhr (Ole, 22.11.2026)", () => {
    expect(inSendWindow(b("2026-11-23T08:05:00"), CHAT_RUHT_STUNDEN, SONNTAG_NACHFASS_STUNDEN)).toBe(true);
    expect(inSendWindow(b("2026-11-23T07:55:00"), CHAT_RUHT_STUNDEN, SONNTAG_NACHFASS_STUNDEN)).toBe(false);
    // Fenster schließt Montag 08:50: 08:20 reicht, kein Vorziehen auf Sonntagabend nötig
    const due = b("2026-11-22T19:43:00");
    expect(imChatFensterVorziehen({ due, fensterBis: b("2026-11-23T08:50:00"), now: b("2026-11-22T13:45:00"), sonntag: SONNTAG_NACHFASS_STUNDEN })).toEqual(due);
  });
});
