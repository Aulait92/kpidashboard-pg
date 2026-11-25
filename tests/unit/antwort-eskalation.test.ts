// Eskalation offene Lead-Antwort (Ole, 25.11.2026): Zeitfenster und Texte (rein).
import { describe, expect, it } from "vitest";
import { eskalationsText, eskalationsZeit, wartezeitText } from "@/lib/antwort-eskalation";

describe("Eskalation offene Lead-Antwort", () => {
  it("Mo bis Sa 8 bis 20 Uhr Berlin, nicht sonntags und nicht an Feiertagen unter der Woche", () => {
    expect(eskalationsZeit(new Date("2026-11-25T07:00:00Z"))).toBe(true); // Mi 8:00
    expect(eskalationsZeit(new Date("2026-11-25T06:59:00Z"))).toBe(false); // Mi 7:59
    expect(eskalationsZeit(new Date("2026-11-25T18:59:00Z"))).toBe(true); // Mi 19:59
    expect(eskalationsZeit(new Date("2026-11-25T19:00:00Z"))).toBe(false); // Mi 20:00
    expect(eskalationsZeit(new Date("2026-11-28T09:00:00Z"))).toBe(true); // Sa
    expect(eskalationsZeit(new Date("2026-11-29T09:00:00Z"))).toBe(false); // So
    expect(eskalationsZeit(new Date("2026-12-25T09:00:00Z"))).toBe(false); // 1. Weihnachtstag (Fr)
  });

  it("Titel mit Vorname und Wartezeit, kurzer Text, Link in den Chat, ohne Gedankenstriche", () => {
    const t = eskalationsText({ conversationId: "c1", vorname: "Anna", label: "Frau Becker", wartetMs: 31 * 60_000 });
    expect(t).toEqual({ title: "Anna wartet seit 30 Minuten auf Antwort", body: "Im Chat hat noch niemand geantwortet. Jetzt antworten?", url: "/buyer/chats?c=c1", tag: "antwort-eskalation:c1" });
    expect(eskalationsText({ conversationId: "c1", vorname: null, label: "Frau Becker", wartetMs: 31 * 60_000 }).title).toBe("Frau Becker wartet seit 30 Minuten auf Antwort");
    expect(JSON.stringify(t)).not.toMatch(/[–—]/);
    expect(wartezeitText(65 * 60_000)).toBe("1 Stunde");
    expect(wartezeitText(11 * 3600_000)).toBe("11 Stunden");
    expect(wartezeitText(60 * 3600_000)).toBe("2 Tagen");
  });
});
