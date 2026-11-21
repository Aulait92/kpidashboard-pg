import { describe, expect, it } from "vitest";
import { folgefragen } from "@/lib/preise/rechner-angaben";

// Ole, 21.11.2026: Anzahl der regulierten Schäden (1, 2, 3 oder mehr) wie im Allianz-Rechner
const quelle = (kfzVertrag?: string) => ({
  formular: [
    { label: "Worum geht es?", value: "Versicherung wechseln (jetziges Auto)" },
    { label: "Welchen Schutz wünschen Sie?", value: "Vollkasko" },
  ],
  angaben: kfzVertrag ? { kfzVertrag } : {},
});
const keys = (q: ReturnType<typeof quelle>) => folgefragen(["kfz"] as never, q as never).map((x) => x.key);

describe("Kfz: Schäden mit Anzahl", () => {
  it("erst die Frage mit Anzahl-Knöpfen", () => {
    const f = folgefragen(["kfz"] as never, quelle() as never).find((x) => x.key === "kfzSchaeden");
    expect(f?.knoepfe).toEqual(["Nein", "Ja, 1 Schaden", "Ja, 2 oder mehr"]);
    expect(keys(quelle())).not.toContain("kfzSchadenAnzahl");
  });
  it("bei „2 oder mehr“ die Rückfrage, danach nicht mehr", () => {
    expect(keys(quelle("Schäden (3 Jahre): 2 oder mehr"))).toContain("kfzSchadenAnzahl");
    expect(keys(quelle("Schäden (3 Jahre): 3 oder mehr"))).not.toContain("kfzSchadenAnzahl");
    expect(keys(quelle("Schäden (3 Jahre): 1"))).not.toContain("kfzSchadenAnzahl");
    expect(keys(quelle("Schäden (3 Jahre): Nein"))).not.toContain("kfzSchaeden");
  });
});
