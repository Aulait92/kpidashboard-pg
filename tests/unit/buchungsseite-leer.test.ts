// Warnung „Buchungsseite ohne freie Zeiten“ (Ole, 25.11.2026): reine Regeln (tagsüber zählen, ab 3 Stunden, Stand).
import { describe, expect, it } from "vitest";
import { istTagsueber, leerSeitText, leerTagsueberMs, leerWarnen, naechsterStand } from "@/lib/buchungsseite-leer";

const H = 3_600_000;
// 25.11.2026: Berlin = UTC+1
const berlin = (hhmm: string, tag = "2026-11-25") => new Date(`${tag}T${hhmm}:00+01:00`);

describe("Buchungsseite ohne freie Zeiten", () => {
  it("tagsüber ist 8 bis 20 Uhr Berlin", () => {
    expect(istTagsueber(berlin("07:59"))).toBe(false);
    expect(istTagsueber(berlin("08:00"))).toBe(true);
    expect(istTagsueber(berlin("19:59"))).toBe(true);
    expect(istTagsueber(berlin("20:00"))).toBe(false);
  });

  it("zählt nur die Zeit zwischen 8 und 20 Uhr", () => {
    expect(leerTagsueberMs(berlin("09:00"), berlin("12:00"))).toBe(3 * H);
    // Abends um 19 Uhr leer, am nächsten Morgen um 9 Uhr: 1 Std. am Abend + 1 Std. am Morgen
    expect(leerTagsueberMs(berlin("19:00", "2026-11-24"), berlin("09:00"))).toBe(2 * H);
  });

  it("warnt erst ab 3 Stunden tagsüber", () => {
    expect(leerWarnen(null, berlin("12:00"))).toBe(false);
    expect(leerWarnen(berlin("09:30"), berlin("12:00"))).toBe(false);
    expect(leerWarnen(berlin("09:00"), berlin("12:00"))).toBe(true);
    // Nachts zählt nicht: 18 Uhr bis 8:30 Uhr = 2,5 Std. tagsüber
    expect(leerWarnen(berlin("18:00", "2026-11-24"), berlin("08:30"))).toBe(false);
  });

  it("Stand: Beginn bleibt, Zeiten da leert, Fehler zählt als leer", () => {
    const now = berlin("12:00");
    const vorher = berlin("09:00");
    expect(naechsterStand({ keineZeitenSeit: null }, { anzahl: 0 }, now)).toEqual({ keineZeitenSeit: now, leer: true, neu: true });
    expect(naechsterStand({ keineZeitenSeit: vorher }, { anzahl: 0 }, now)).toEqual({ keineZeitenSeit: vorher, leer: true, neu: false });
    expect(naechsterStand({ keineZeitenSeit: vorher }, { anzahl: 3 }, now)).toEqual({ keineZeitenSeit: null, leer: false, neu: false });
    expect(naechsterStand({ keineZeitenSeit: null }, { anzahl: 0, fehler: "Token abgelaufen" }, now).leer).toBe(true);
  });

  it("Text „seit …“", () => {
    expect(leerSeitText(berlin("08:00"), berlin("12:10"))).toBe("seit 4 Std.");
    expect(leerSeitText(berlin("08:00", "2026-11-23"), berlin("12:00"))).toBe("seit 2 Tagen");
  });
});
