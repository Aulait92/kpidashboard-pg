import { describe, expect, it } from "vitest";
import { asAudience, asKind, audiencesForPlan, groupByMonth, validateUpdate } from "@/lib/neuigkeiten-shared";

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
