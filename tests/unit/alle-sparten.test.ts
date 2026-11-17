// Alle Versicherungsprodukte im Tarifkatalog (Ole, 17.11.2026: Cross-Selling nach dem Komplettcheck, auch BU und PKV)
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import { angebotAuslesbar, SPARTEN_GRUPPEN, spartenGruppiert } from "@/lib/tarifkatalog";
import { SCHUTZ_SPARTEN, VORSORGE_SPARTE, VORSORGE_THEMEN } from "@/lib/schutz-ueberblick";

const echt = ladeTarifkatalog(path.join(__dirname, "..", "..", "data", "tarifkatalog"));

describe("Alle Sparten", () => {
  it("jede Katalog-Sparte steht in genau einer Gruppe und im Schutz-Überblick", () => {
    const gruppiert = SPARTEN_GRUPPEN.flatMap((g) => g.keys);
    expect(new Set(gruppiert).size).toBe(gruppiert.length);
    for (const s of echt.sparten) {
      expect(gruppiert, s.key).toContain(s.key);
      expect(SCHUTZ_SPARTEN[s.key], s.key).toBeTruthy();
    }
  });

  it("Auswahlliste gruppiert, leere Gruppen fallen weg, Unbekanntes unter „Weitere“", () => {
    const g = spartenGruppiert([{ key: "bu" }, { key: "hausrat" }, { key: "x-neu" }]);
    expect(g.map((x) => x.label)).toEqual(["Haftpflicht und Sach", "Leben und Arbeitskraft", "Weitere"]);
  });

  it("jedes Vorsorge-Thema hat eine Katalog-Sparte für „Ins Angebot“", () => {
    for (const k of Object.keys(VORSORGE_THEMEN) as (keyof typeof VORSORGE_THEMEN)[]) {
      expect(echt.sparten.some((s) => s.key === VORSORGE_SPARTE[k]), k).toBe(true);
    }
  });

  it("Angebot ablegen nur, wo die KI auslesen darf (keine Leben, Gesundheit, Vorsorge)", () => {
    for (const k of ["bu", "risikoleben", "pkv", "zahnzusatz", "pflegezusatz", "rente", "basisrente", "sterbegeld", "reise-kranken"]) expect(angebotAuslesbar(k), k).toBe(false);
    for (const k of ["hausrat", "haftpflicht", "kfz", "katze-kranken", "unfall"]) expect(angebotAuslesbar(k), k).toBe(true);
  });

  it("keine Gesundheitsfragen als Merkmale: nur Produktmerkmale", () => {
    // „Ohne Gesundheitsfragen“ (Sterbegeld) ist ein Produktmerkmal und erlaubt
    const verboten = /vorerkrank|diagnose|raucher|\bbmi\b|gewicht/i;
    for (const s of echt.sparten) for (const m of [...s.merkmale, ...s.bausteine]) expect(`${m.label} ${m.kurz}`, `${s.key}.${m.key}`).not.toMatch(verboten);
  });
});
