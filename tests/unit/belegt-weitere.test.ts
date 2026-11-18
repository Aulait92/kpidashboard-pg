import { describe, expect, it } from "vitest";
import { belegtAusFreeBusy, parseWeitereKalender } from "@/lib/calendar/belegt-weitere";

// Weitere Kalender nur für „belegt“ (Ole, 18.11.2026): alter Google-Kalender nach Kontowechsel
describe("Weitere Kalender für belegt", () => {
  it("Eingabe: Komma oder Zeilen, klein, ohne Dubletten; ungültige Adresse und zu viele abgelehnt", () => {
    expect(parseWeitereKalender(" Name@Beispiel.de, name@beispiel.de\nzwei@beispiel.de ")).toEqual({ ok: true, ids: ["name@beispiel.de", "zwei@beispiel.de"] });
    expect(parseWeitereKalender("")).toEqual({ ok: true, ids: [] });
    expect(parseWeitereKalender("kein-kalender").ok).toBe(false);
    expect(parseWeitereKalender("a@b.de b@b.de c@b.de d@b.de e@b.de f@b.de").ok).toBe(false);
  });
  it("freeBusy: Hauptkalender und weitere zusammen; nicht abrufbarer Kalender wirft statt still frei", () => {
    const json = {
      calendars: {
        primary: { busy: [{ start: "2026-11-20T09:00:00Z", end: "2026-11-20T10:00:00Z" }] },
        "alt@beispiel.de": { busy: [{ start: "2026-11-20T12:00:00Z", end: "2026-11-20T13:00:00Z" }] },
      },
    };
    expect(belegtAusFreeBusy(json, ["alt@beispiel.de"]).map((b) => b.start.toISOString())).toEqual(["2026-11-20T09:00:00.000Z", "2026-11-20T12:00:00.000Z"]);
    expect(() => belegtAusFreeBusy({ calendars: { primary: { busy: [] }, "alt@beispiel.de": { errors: [{ reason: "notFound" }] } } }, ["alt@beispiel.de"])).toThrow(/alt@beispiel.de/);
    expect(() => belegtAusFreeBusy({ calendars: {} }, [])).toThrow(/neu verbinden/);
  });
});
