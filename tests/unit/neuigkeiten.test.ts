import { describe, expect, it } from "vitest";
import { asAudience, asKind, audiencesForPlan, EINZELN_JE_WOCHE, groupByMonth, validateUpdate, wochenBloecke, wochenLabel, wochenStart } from "@/lib/neuigkeiten-shared";

describe("Neuigkeiten: Regeln", () => {
  it("Zielgruppe je Paket: Nur Betreuung sieht keine Software-Neuigkeiten", () => {
    expect(audiencesForPlan("service")).toEqual(["alle", "betreuung"]);
    expect(audiencesForPlan("software")).toEqual(["alle", "software"]);
    expect(audiencesForPlan(null)).toEqual(["alle", "software"]);
  });

  it("gruppiert nach Monat (deutsche Zeit), Entwürfe getrennt", () => {
    const g = groupByMonth([
      { id: "a", publishedAt: "2026-11-13T08:00:00Z" },
      { id: "b", publishedAt: "2026-11-01T10:00:00Z" },
      { id: "c", publishedAt: "2026-10-31T23:30:00Z" }, // 1.11. in Berlin
      { id: "d", publishedAt: "2026-10-15T10:00:00Z" },
    ]);
    expect(g.map((x) => [x.month, x.items.map((i) => i.id)])).toEqual([
      ["November 2026", ["a", "b", "c"]],
      ["Oktober 2026", ["d"]],
    ]);
    expect(groupByMonth([{ id: "x", publishedAt: null }])[0].month).toBe("Entwurf");
  });

  it("prüft Titel und Text, normalisiert Art und Zielgruppe", () => {
    expect(validateUpdate({ title: "ab", body: "Ein kurzer Text." })).toMatch(/Titel/);
    expect(validateUpdate({ title: "Neu im Konto", body: "kurz" })).toMatch(/Text/);
    expect(validateUpdate({ title: "Neu im Konto", body: "Ein kurzer Text für Kunden." })).toBeNull();
    expect(asKind("quatsch")).toBe("neu");
    expect(asAudience("software")).toBe("software");
    expect(asAudience(undefined)).toBe("alle");
  });
});

describe("Wochenblöcke (Usability-Check 25.11.2026)", () => {
  const u = (id: string, publishedAt: string, kind: "neu" | "verbessert" | "behoben" = "verbessert") => ({ id, kind, publishedAt });
  const now = new Date("2026-11-25T20:00:00Z"); // Mittwoch

  it("Woche beginnt Montag in deutscher Zeit", () => {
    expect(wochenStart("2026-11-23T00:30:00+01:00")).toBe("2026-11-23");
    expect(wochenStart("2026-11-22T23:30:00Z")).toBe("2026-11-23"); // Montag 0:30 Uhr in Berlin
    expect(wochenStart("2026-11-22T22:30:00Z")).toBe("2026-11-16"); // Sonntag 23:30 Uhr in Berlin
    expect(wochenStart("2026-11-29T12:00:00Z")).toBe("2026-11-23");
  });

  it("Beschriftung: diese Woche, letzte Woche, sonst Zeitraum", () => {
    expect(wochenLabel("2026-11-23", now)).toBe("Diese Woche");
    expect(wochenLabel("2026-11-16", now)).toBe("Letzte Woche");
    expect(wochenLabel("2026-11-09", now)).toBe("Woche vom 9. bis 15. November");
    expect(wochenLabel("2026-10-26", now)).toBe("Woche vom 26. Oktober bis 1. November");
  });

  it("höchstens 3 je Woche einzeln (Neu vor Verbessert vor Behoben), der Rest zusammengefasst, nichts geht verloren", () => {
    const items = [
      u("a", "2026-11-25T18:00:00Z", "behoben"),
      u("b", "2026-11-25T17:00:00Z"),
      u("c", "2026-11-24T10:00:00Z", "neu"),
      u("d", "2026-11-23T10:00:00Z"),
      u("e", "2026-11-23T09:00:00Z", "neu"),
      u("f", "2026-11-18T09:00:00Z"),
      u("g", "2026-11-17T09:00:00Z", "neu"),
    ];
    const w = wochenBloecke(items, now);
    expect(w.map((x) => x.montag)).toEqual(["2026-11-23", "2026-11-16"]);
    expect(w[0].einzeln.map((x) => x.id)).toEqual(["b", "c", "e"]);
    expect(w[0].weitere.map((x) => x.id)).toEqual(["a", "d"]);
    expect(w[1].einzeln.map((x) => x.id)).toEqual(["f", "g"]);
    expect(w[1].weitere).toEqual([]);
    for (const b of w) expect(b.einzeln.length).toBeLessThanOrEqual(EINZELN_JE_WOCHE);
    expect(w.flatMap((b) => [...b.einzeln, ...b.weitere]).length).toBe(items.length);
  });

  it("Entwürfe ohne Datum zählen nicht", () => {
    expect(wochenBloecke([{ id: "x", kind: "neu" as const, publishedAt: null }], now)).toEqual([]);
  });
});
