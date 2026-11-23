import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detailNachfrageText, detailVerstaendlich } from "@/lib/whatsapp/tier-fragen";

const q = { source: "Katzenkrankenversicherung", formular: [{ label: "Name des Tieres", value: "Minka" }], angaben: null };

describe("Tierfrage „Was war es ungefähr, und wann?“: unverständliche Antwort", () => {
  it("Unsinn wird nicht übernommen", () => {
    for (const t of ["Shania shall", "asdf", "hallo", "Shop"]) expect(detailVerstaendlich(t), t).toBe(false);
  });
  it("Stichwort, Zeit oder „weiß nicht“ wird übernommen", () => {
    for (const t of ["Zahnbehandlung im Frühjahr", "Durchfall", "letztes Jahr", "2024", "OP am Bein", "weiß nicht", "nichts Schlimmes", "Kastration", "im März beim Tierarzt"])
      expect(detailVerstaendlich(t), t).toBe(true);
  });
  it("Nachfrage mit Tiername, beide Ansprachen, ohne Gedankenstriche", () => {
    const sie = detailNachfrageText("sie", q);
    const du = detailNachfrageText("du", q);
    expect(sie).toBe("Das habe ich leider nicht ganz verstanden. Was hatte Minka ungefähr, und wann? Zum Beispiel: Durchfall im Sommer. Wissen Sie es nicht mehr, schreiben Sie einfach „weiß nicht“.");
    expect(du).toContain("schreib einfach „weiß nicht“");
    expect(`${sie}${du}`).not.toMatch(/[–—]/);
  });
  it("Strecke fragt nur einmal nach (Merker tier_nachfrage vor der Auswertung)", () => {
    const src = readFileSync("src/lib/whatsapp/termin-strecke.ts", "utf8");
    const i = src.indexOf("detailVerstaendlich(text)");
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(src.indexOf("const r = tierAntwortAuswerten(key, antwort"));
    expect(src).toContain("kind: STRECKE.tierNachfrage");
  });
});
