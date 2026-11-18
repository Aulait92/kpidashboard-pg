// Admin v2, Paket A3: Suche ⌘K über alle Funktionen (lib/admin-neu/funktionen.ts, Index aus dem Funktionsinventar).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normSuche, ortText, sucheFunktionen, suchIndex, type InventarEintrag } from "@/lib/admin-neu/funktionen";
import { SEITEN } from "@/lib/admin-neu/navigation";

const inventar: InventarEintrag[] = JSON.parse(readFileSync(join(__dirname, "../../docs/ux/admin-neu/funktionsinventar.json"), "utf8"));
const index = suchIndex(inventar);

describe("Suche über alle Funktionen", () => {
  it("jede Funktion mit Oberfläche ist im Index und zeigt auf eine Seite des neuen Admins ohne Platzhalter", () => {
    expect(index.length).toBe(inventar.filter((e) => e.status_neu !== "bleibt").length);
    const pfade = new Set(SEITEN.filter((s) => !s.pfad.includes("[")).map((s) => s.pfad));
    expect(index.filter((f) => !pfade.has(f.href)).map((f) => `${f.id} → ${f.href}`)).toEqual([]);
    expect(new Set(index.map((f) => f.id)).size).toBe(index.length);
  });

  it("findet Funktionen über Name und Ort, ohne Umlaute, Name vorne zuerst", () => {
    const t = sucheFunktionen(index, "gebuhr");
    expect(t.length).toBeGreaterThan(0);
    expect(t.every((f) => normSuche(`${f.titel} ${f.ort}`).includes("gebuhr") || f.suchtext.includes("gebuhr"))).toBe(true);
    const storno = sucheFunktionen(index, "storno", 50);
    expect(storno.length).toBeGreaterThan(1);
    const erstes = storno.findIndex((f) => !normSuche(f.titel).includes("storno"));
    if (erstes >= 0) expect(storno.slice(erstes).every((f) => !normSuche(f.titel).startsWith("storno"))).toBe(true);
    expect(sucheFunktionen(index, "   ")).toEqual([]);
    expect(sucheFunktionen(index, "storno", 3)).toHaveLength(3);
  });

  it("Ort beginnt mit der Rolle", () => {
    expect(ortText("Zahlen › Qualität & Nutzung › X", "zahlen-qualitaet", "betreuen")).toBe("Betreuen › Qualität & Nutzung › X");
    expect(ortText("Kundenakte › Abrechnung", "kunde-abrechnung", "betreuen")).toBe("Betreuen › Kundenakte › Abrechnung");
    expect(ortText("Seitenleiste › Logo", "heute", "mein-tag")).toBe("Seitenleiste › Logo");
  });
});
