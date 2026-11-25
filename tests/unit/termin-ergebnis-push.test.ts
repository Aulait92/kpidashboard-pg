// Push „Wie lief der Termin mit …?“ (Ole, 25.11.2026): Zeitfenster und Text.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { berlinTagesbeginn, ergebnisPushText, ergebnisPushZeit } from "@/lib/termin-ergebnis-push";

describe("Termin ohne Ergebnis: Push", () => {
  it("nur werktags 8 bis 20 Uhr Berlin, nicht an Feiertagen", () => {
    expect(ergebnisPushZeit(new Date("2026-11-25T06:59:00Z"))).toBe(false); // Mi 7:59
    expect(ergebnisPushZeit(new Date("2026-11-25T07:00:00Z"))).toBe(true); // Mi 8:00
    expect(ergebnisPushZeit(new Date("2026-11-25T19:00:00Z"))).toBe(false); // Mi 20:00
    expect(ergebnisPushZeit(new Date("2026-11-28T09:00:00Z"))).toBe(false); // Sa
    expect(ergebnisPushZeit(new Date("2026-12-25T09:00:00Z"))).toBe(false); // 1. Weihnachtstag
  });

  it("Tagesbeginn in Berlin", () => {
    expect(berlinTagesbeginn(new Date("2026-11-25T08:00:00Z")).toISOString()).toBe("2026-11-24T23:00:00.000Z");
    expect(berlinTagesbeginn(new Date("2026-07-01T08:00:00Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("Text mit Vorname und Link direkt zu „Wie lief der Termin?“", () => {
    const p = ergebnisPushText({ appointmentId: "a1", vorname: "Anna", label: "Frau Becker" });
    expect(p).toEqual({ title: "Wie lief der Termin mit Anna?", body: "Das Ergebnis fehlt noch. Ein Tipp genügt, den Rest trägt die App ein.", url: "/buyer/termine/a1", tag: "termin-ergebnis:a1" });
    expect(ergebnisPushText({ appointmentId: "a1", vorname: null, label: "Frau Becker" }).title).toBe("Wie lief der Termin mit Frau Becker?");
    expect(`${p.title} ${p.body}`).not.toMatch(/[–—]/);
  });
});
