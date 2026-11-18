import { describe, expect, it } from "vitest";
import { belegtAusFreeBusy, kontoAdresseAusSummary, parseWeitereKalender } from "@/lib/calendar/belegt-weitere";

// Weitere Kalender nur für „belegt“ (Ole, 18.11.2026): alter Google-Kalender nach Kontowechsel
describe("Weitere Kalender für belegt", () => {
  it("Eingabe: Komma oder Zeilen, klein, ohne Dubletten; ungültige Adresse und zu viele abgelehnt", () => {
    expect(parseWeitereKalender(" Name@Beispiel.de, name@beispiel.de\nzwei@beispiel.de ")).toEqual({ ok: true, ids: ["name@beispiel.de", "zwei@beispiel.de"] });
    expect(parseWeitereKalender("")).toEqual({ ok: true, ids: [] });
    expect(parseWeitereKalender("kein-kalender").ok).toBe(false);
    expect(parseWeitereKalender("a@b.de b@b.de c@b.de d@b.de e@b.de f@b.de").ok).toBe(false);
  });
  it("freeBusy: Hauptkalender und weitere zusammen", () => {
    const json = {
      calendars: {
        primary: { busy: [{ start: "2026-11-20T09:00:00Z", end: "2026-11-20T10:00:00Z" }] },
        "alt@beispiel.de": { busy: [{ start: "2026-11-20T12:00:00Z", end: "2026-11-20T13:00:00Z" }] },
      },
    };
    const r = belegtAusFreeBusy(json, ["alt@beispiel.de"]);
    expect(r.busy.map((b) => b.start.toISOString())).toEqual(["2026-11-20T09:00:00.000Z", "2026-11-20T12:00:00.000Z"]);
    expect(r.unlesbar).toEqual([]);
  });
  it("nicht lesbarer weiterer Kalender (Tippfehler → notFound) wird übersprungen, Hauptkalender zählt weiter", () => {
    const r = belegtAusFreeBusy(
      { calendars: { primary: { busy: [{ start: "2026-11-20T09:00:00Z", end: "2026-11-20T10:00:00Z" }] }, "hallo@beispiel.cpm": { errors: [{ reason: "notFound" }] } } },
      ["hallo@beispiel.cpm", "fehlt@beispiel.de"],
    );
    expect(r.busy).toHaveLength(1);
    expect(r.unlesbar).toEqual([
      { id: "hallo@beispiel.cpm", grund: "notFound" },
      { id: "fehlt@beispiel.de", grund: "fehlt" },
    ]);
  });
  it("Hauptkalender nicht abrufbar → Fehler (nie still frei)", () => {
    expect(() => belegtAusFreeBusy({ calendars: {} }, [])).toThrow(/neu verbinden/);
    expect(() => belegtAusFreeBusy({ calendars: { primary: { errors: [{ reason: "internalError" }] } } }, [])).toThrow(/neu verbinden/);
  });
  it("Konto-Adresse aus dem Namen des Hauptkalenders", () => {
    expect(kontoAdresseAusSummary("Ole@Beispiel.de")).toBe("ole@beispiel.de");
    expect(kontoAdresseAusSummary("Mein Kalender")).toBeNull();
    expect(kontoAdresseAusSummary(undefined)).toBeNull();
  });
});
