// Produktfilter der Kontakte (Ole, 26.11.2026): Gruppen, Reihenfolge und Auswahl (lib/produkt-filter.ts).
import { describe, expect, it } from "vitest";
import { gewaehlteGruppe, produktGruppen, produktWhere } from "@/lib/produkt-filter";

describe("produktGruppen", () => {
  it("fasst Kfz-Varianten und gleiche Anzeige zusammen, häufigste zuerst", () => {
    const g = produktGruppen([
      { source: "Privatschutz", anzahl: 3 },
      { source: "Kfz-Versicherung", anzahl: 4 },
      { source: "Kfz Wechsel", anzahl: 2 },
      { source: "Wechsel", anzahl: 1 },
      { source: "Tarifoptimierung", anzahl: 1 },
      { source: null, anzahl: 9 },
    ]);
    expect(g.map((x) => [x.label, x.anzahl])).toEqual([
      ["Kfz-Versicherung", 6],
      ["Privatschutz", 3],
      ["Tarifoptimierung", 2],
    ]);
    expect(g[0].sources.sort()).toEqual(["Kfz Wechsel", "Kfz-Versicherung"]);
    expect(g[2].sources.sort()).toEqual(["Tarifoptimierung", "Wechsel"]);
  });

  it("Privatschutz ist kein Kfz-Produkt", () => {
    expect(produktGruppen([{ source: "Privatschutz inkl. Kfz-Check", anzahl: 1 }, { source: "Kfz-Versicherung", anzahl: 1 }])).toHaveLength(2);
  });

  it("ein Produkt ergibt eine Gruppe (Filter bleibt aus)", () => {
    expect(produktGruppen([{ source: "Kfz-Versicherung", anzahl: 5 }, { source: "Kfz Wechsel", anzahl: 1 }])).toHaveLength(1);
  });
});

describe("gewaehlteGruppe / produktWhere", () => {
  const g = produktGruppen([
    { source: "Kfz-Versicherung", anzahl: 4 },
    { source: "Kfz Wechsel", anzahl: 2 },
    { source: "Privatschutz", anzahl: 3 },
  ]);
  it("findet die Gruppe über ihren Wert oder einen einzelnen Lead.source-Wert", () => {
    expect(gewaehlteGruppe(g, "Kfz-Versicherung")?.label).toBe("Kfz-Versicherung");
    expect(gewaehlteGruppe(g, "Kfz Wechsel")?.label).toBe("Kfz-Versicherung");
    expect(gewaehlteGruppe(g, "Gibt es nicht")).toBeNull();
    expect(gewaehlteGruppe(g, null)).toBeNull();
  });
  it("filtert auf alle Quellen der Gruppe", () => {
    expect(produktWhere(gewaehlteGruppe(g, "Kfz-Versicherung"))).toEqual({ source: { in: ["Kfz-Versicherung", "Kfz Wechsel"] } });
    expect(produktWhere(null)).toEqual({});
  });
});
