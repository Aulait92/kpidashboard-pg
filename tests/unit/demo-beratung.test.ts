import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { summeEmpfohlen } from "@/lib/angebote-daten";
import { DEMO_BERATER, DEMO_KUNDE, demoAngebote, demoFolien, demoKlick } from "@/lib/demo-beratung";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

// Öffentliche Live-Demo der Beratungspräsentation (Ole, 15.11.2026): feste Beispieldaten, rechnet im Browser.

const k = (x: Partial<Parameters<typeof demoKlick>[1]>) => ({ tarif: null, sparte: false, item: 0, baustein: 0, aktiv: true, ...x });
const text = (html: string) => html.replace(/<[^>]+>/g, " ");

describe("Demo Beratungspräsentation", () => {
  it("Startstand: Haftpflicht Komfort, Hausrat Komfort mit Fahrraddiebstahl, Rechtsschutz: 46,50 €", () => {
    const d = demoAngebote();
    expect(d.items.map((i) => `${i.tarif} ${i.beitragMonat}`)).toEqual([
      "Haftpflicht Basis 4.2",
      "Haftpflicht Smart 5.9",
      "Haftpflicht Komfort 8.4",
      "Hausrat Smart 7.6",
      "Hausrat Komfort 9.8",
      "Rechtsschutz Privat, Beruf, Verkehr, Wohnen 24.9",
    ]);
    expect(d.items.filter((i) => i.empfohlen).map((i) => i.tarif)).toContain("Haftpflicht Komfort");
    expect(summeEmpfohlen(d)).toBe(46.5);
  });

  it("Auswählen, Bausteine und Sparte schalten rechnen sofort neu", () => {
    let d = demoAngebote();
    d = demoKlick(d, k({ tarif: 1 }))!; // Haftpflicht Smart
    expect(summeEmpfohlen(d)).toBe(44);
    d = demoKlick(d, k({ item: 4, baustein: 1, aktiv: true }))!; // Glasbruch
    expect(summeEmpfohlen(d)).toBe(45.6);
    d = demoKlick(d, k({ item: 4, baustein: 0, aktiv: false }))!; // Fahrraddiebstahl ab
    expect(summeEmpfohlen(d)).toBe(42.2);
    d = demoKlick(d, k({ tarif: 5, sparte: true }))!; // Rechtsschutz heraus
    expect(summeEmpfohlen(d)).toBe(17.3);
    d = demoKlick(d, k({ tarif: 5, sparte: true }))!; // und wieder hinein
    d = demoKlick(d, k({ item: 5, baustein: 0, aktiv: true }))!; // ohne Selbstbeteiligung
    expect(summeEmpfohlen(d)).toBe(46.4);
    expect(d.items[5].selbstbeteiligung).toBe("keine");
    expect(demoKlick(d, k({ item: 9, baustein: 0 }))).toBeNull();
  });

  it("Folien: Kunde, Berater, Vergleich mit Auswählen; neutral und ohne Gedankenstriche", () => {
    const fs = demoFolien(demoAngebote(), new Date("2026-11-15T10:00:00Z"));
    const html = fs.map((f) => f.html).join("\n");
    expect(html).toContain(DEMO_KUNDE);
    expect(html).toContain(DEMO_BERATER);
    expect(fs.some((f) => f.id.startsWith("vergleich-haftpflicht"))).toBe(true);
    expect(html).toContain("Auswählen");
    expect(html).toContain("46,50");
    expect(html).not.toMatch(/allianz|\baxa\b|signal iduna/i);
    expect(hatGedankenstrich(text(html).replace(/\s—\s/g, " "))).toBe(false);
  });

  it("ohne Datenbank und ohne Server Actions", () => {
    for (const f of ["src/lib/demo-beratung.ts", "src/app/demo/beratung/demo-ansicht.tsx", "src/app/demo/beratung/page.tsx"]) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/@\/lib\/prisma|"use server"|localStorage|sessionStorage/);
    }
  });
});
