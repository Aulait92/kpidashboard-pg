// Admin v2, Paket A5: Systemzustand (lib/admin-neu/systemzustand.ts), reine Bewertung der Prüfungen.
import { describe, expect, it } from "vitest";
import { herzschlag, kontingent, sortiere, werbekosten, zugang, zusammenfassung, zustellung, type Pruefung } from "@/lib/admin-neu/systemzustand";

const NOW = new Date("2026-11-18T06:00:00Z");
const vor = (min: number) => new Date(NOW.getTime() - min * 60000);

describe("Systemzustand", () => {
  it("Herzschlag: zu alt, Fehler, ok, nie gelaufen", () => {
    expect(herzschlag({ at: vor(30), ok: true, note: null }, 20, NOW)).toMatchObject({ ampel: "fehler" });
    expect(herzschlag({ at: vor(5), ok: false, note: "Timeout" }, 20, NOW)).toEqual({ ampel: "fehler", text: "Fehler: Timeout" });
    expect(herzschlag({ at: vor(5), ok: true, note: null }, 20, NOW)).toMatchObject({ ampel: "ok" });
    expect(herzschlag(undefined, 20, NOW).ampel).toBe("warnung");
  });

  it("Zugang mit Ablauf: fehlt, abgelaufen, gestört, bald, ok", () => {
    const tage = (t: number) => new Date(NOW.getTime() + t * 86_400_000);
    expect(zugang(null, 7, NOW).ampel).toBe("aus");
    expect(zugang({ status: "active", bis: tage(-1) }, 7, NOW).ampel).toBe("fehler");
    expect(zugang({ status: "error", bis: tage(30), fehler: "401" }, 7, NOW).text).toContain("401");
    expect(zugang({ status: "active", bis: tage(3.5) }, 7, NOW)).toEqual({ ampel: "warnung", text: "Läuft in 3 Tagen ab, bitte erneuern." });
    expect(zugang({ status: "ok", bis: tage(40) }, 14, NOW).ampel).toBe("ok");
  });

  it("Werbekosten, Zustellung, Kontingent", () => {
    expect(werbekosten(null, NOW).text).toContain("nächsten Abgleich");
    expect(werbekosten(new Date(NOW.getTime() - 5 * 86_400_000), NOW).ampel).toBe("warnung");
    expect(werbekosten(new Date(NOW.getTime() - 86_400_000), NOW).ampel).toBe("ok");
    expect(zustellung(0).ampel).toBe("ok");
    expect(zustellung(3).ampel).toBe("warnung");
    expect(zustellung(25).ampel).toBe("fehler");
    expect(kontingent(10, 1000, false).ampel).toBe("aus");
    expect(kontingent(950, 1000, true).ampel).toBe("warnung");
    expect(kontingent(1000, 1000, true).ampel).toBe("fehler");
    expect(kontingent(10, 1000, true).ampel).toBe("ok");
  });

  it("Probleme zuerst, Zusammenfassung zählt Fehler und Warnungen", () => {
    const p = (key: string, ampel: Pruefung["ampel"]): Pruefung => ({ key, titel: key, ampel, text: "", href: "/", knopf: "" });
    const s = sortiere([p("a", "ok"), p("b", "aus"), p("c", "warnung"), p("d", "fehler"), p("e", "ok")]);
    expect(s.map((x) => x.key)).toEqual(["d", "c", "b", "a", "e"]);
    expect(zusammenfassung(s)).toEqual({ probleme: 2, text: "2 Prüfungen brauchen Sie" });
    expect(zusammenfassung([p("a", "ok")]).text).toBe("Alles läuft");
  });
});
