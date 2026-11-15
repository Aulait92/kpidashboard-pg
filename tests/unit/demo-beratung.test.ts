import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { summeEmpfohlen } from "@/lib/angebote-daten";
import { DEMO_BERATER, DEMO_KUNDE, demoAngebote, demoFolien, demoKlick } from "@/lib/demo-beratung";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

// Öffentliche Live-Demo der Beratungspräsentation (Ole, 15.11.2026): feste Beispieldaten, rechnet im Browser.

const k = (x: Partial<Parameters<typeof demoKlick>[1]>) => ({ tarif: null, sparte: false, item: 0, baustein: 0, aktiv: true, ...x });
const text = (html: string) => html.replace(/<[^>]+>/g, " ");

describe("Demo Beratungspräsentation", () => {
  it("Startstand: Haftpflicht Komfort, Hausrat Komfort mit Fahrraddiebstahl, Rechtsschutz Komfort: 57,29 €", () => {
    const d = demoAngebote();
    expect(d.items.map((i) => `${i.tarif} ${i.beitragMonat}`)).toEqual([
      "Haftpflicht Basis 4.2",
      "Haftpflicht Smart 5.9",
      "Haftpflicht Komfort 8.4",
      "Hausrat Smart 7.6",
      "Hausrat Komfort 9.8",
      "Rechtsschutz Basis 24.29",
      "Rechtsschutz Smart 29.58",
      "Rechtsschutz Komfort 35.69",
      "Rechtsschutz Premium 61.44",
    ]);
    expect(d.items.filter((i) => i.empfohlen).map((i) => i.tarif)).toEqual(["Haftpflicht Komfort", "Hausrat Komfort", "Rechtsschutz Komfort"]);
    expect(d.items.filter((i) => i.sparte === "Rechtsschutz").every((i) => i.selbstbeteiligung === "150 €")).toBe(true);
    expect(summeEmpfohlen(d)).toBe(57.29);
  });

  it("Auswählen, Bausteine und Sparte schalten rechnen sofort neu", () => {
    let d = demoAngebote();
    d = demoKlick(d, k({ tarif: 1 }))!; // Haftpflicht Smart
    expect(summeEmpfohlen(d)).toBe(54.79);
    d = demoKlick(d, k({ item: 4, baustein: 1, aktiv: true }))!; // Glasbruch
    expect(summeEmpfohlen(d)).toBe(56.39);
    d = demoKlick(d, k({ item: 4, baustein: 0, aktiv: false }))!; // Fahrraddiebstahl ab
    expect(summeEmpfohlen(d)).toBe(52.99);
    d = demoKlick(d, k({ tarif: 5, sparte: true }))!; // Rechtsschutz heraus
    expect(summeEmpfohlen(d)).toBe(17.3);
    d = demoKlick(d, k({ tarif: 5, sparte: true }))!; // und wieder hinein (mit der Empfehlung Komfort)
    expect(summeEmpfohlen(d)).toBe(52.99);
    d = demoKlick(d, k({ tarif: 8 }))!; // Rechtsschutz Premium
    expect(summeEmpfohlen(d)).toBe(78.74);
    expect(demoKlick(d, k({ item: 9, baustein: 0 }))).toBeNull();
  });

  it("Rechtsschutz mit Stufen: Umschalter Basis | Smart | Komfort | Premium, Vergleich mit den Unterschieden", () => {
    const fs = demoFolien(demoAngebote(), new Date("2026-11-15T10:00:00Z"));
    const e = fs.find((f) => f.id === "empfehlung")!.html;
    expect(e).toContain('data-tarif="5">Basis</button><button type="button" class="st" data-tarif="6">Smart</button><button type="button" class="st an" data-tarif="7">Komfort<span class="stern"');
    expect(e).toContain('data-tarif="8">Premium</button>');
    expect(e).toContain('data-tarif="0">Basis</button>');
    expect(e).toContain('data-tarif="3">Smart</button>');
    expect(e).not.toMatch(/>(Haftpflicht|Hausrat|Rechtsschutz) (Basis|Smart|Komfort|Premium)</);
    expect(e).not.toContain("stufe-fest");
    expect(e).not.toContain("nicht gewählt");
    expect(e.match(/Selbstbeteiligung/g)).toEqual(["Selbstbeteiligung"]);
    const r = fs.find((f) => f.id.startsWith("vergleich-rechtsschutz"))!.html;
    expect(r.match(/data-tarif=/g)).toHaveLength(4);
    for (const n of ["Versicherungssumme", "Berufs-Rechtsschutz", "Wohnen", "Strafkaution (als Darlehen)"]) expect(r).toContain(`<tr><th>${n}</th>`);
    expect(r).toContain("In allen Tarifen:</b> <span>✓ Telefonische Rechtsberatung, auch in nicht versicherten Fällen</span><span>✓ Kosten im Rechtsstreit</span><span>✓ Mediation zur Schlichtung</span></div>");
    expect(r).toContain("35,69");
    expect(r).toContain("unbegrenzt");
  });

  it("startet immer mit Folie 1: kein Sprung per Adresse, kein gespeicherter Stand", () => {
    for (const f of ["src/components/folien-deck.tsx", "src/app/demo/beratung/demo-ansicht.tsx", "src/app/demo/beratung/page.tsx", "src/lib/vertrieb/verkaufspraesentation.ts"]) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/startFolie|[?&]folie=|localStorage|sessionStorage|location\.hash|scrollIntoView/);
    }
  });

  it("Folien: Kunde, Berater, Vergleich mit Auswählen; neutral und ohne Gedankenstriche", () => {
    const fs = demoFolien(demoAngebote(), new Date("2026-11-15T10:00:00Z"));
    const html = fs.map((f) => f.html).join("\n");
    expect(html).toContain(DEMO_KUNDE);
    expect(html).toContain(DEMO_BERATER);
    expect(fs.some((f) => f.id.startsWith("vergleich-haftpflicht"))).toBe(true);
    expect(html).toContain("Auswählen");
    expect(html).toContain("57,29");
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
