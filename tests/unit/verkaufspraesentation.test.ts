import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import {
  aktuellesAngebot,
  audienceFuer,
  bildUrl,
  folienListe,
  maklerRechnung,
  paketDaten,
  verkaufsFolien,
  vertreterRechnung,
  type AngebotFuerFolien,
} from "@/lib/vertrieb/verkaufspraesentation";

// Vertriebspräsentation als Web-Präsentation (Ole, 15.11.2026): Folienliste je Zielgruppe, Preise aus Angebot bzw. Liste.

const angebot = (x: Partial<AngebotFuerFolien> = {}): AngebotFuerFolien => ({
  number: "PG-2026-0042",
  company: "Agentur Muster",
  contactName: "Max Muster",
  package: "software",
  vermittlerTyp: "vertreter",
  term: "12m",
  products: [{ name: "Katzenversicherung", dailyBudget: 30 }],
  setupFee: 990,
  monthlyFee: 1000,
  seats: 4,
  seatsIncluded: 3,
  seatMonthly: 49,
  bestandMonthly: null,
  empfehlungMonthly: null,
  annualPrepay: false,
  annualFreeMonths: null,
  customerChoosesTerm: false,
  setupDiscount: null,
  introMonthlyFee: null,
  introMonths: null,
  ...x,
});
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");

describe("Folienliste", () => {
  it("Vertreter 22, Makler 23 (Makler mit Tarifvergleich nach Folie 19)", () => {
    const v = folienListe("vertreter");
    const m = folienListe("makler");
    expect(v).toHaveLength(22);
    expect(m).toHaveLength(23);
    expect(v[12]).toMatchObject({ nr: 13, art: "video" });
    expect(v[16]).toMatchObject({ nr: 17, art: "demo", titel: "Beraten mit echten Preisen" });
    expect(v.filter((f) => f.art === "rechnung").map((f) => f.nr)).toEqual([19]);
    expect(v.filter((f) => f.art === "paket").map((f) => f.nr)).toEqual([20]);
    expect(m.filter((f) => f.art === "rechnung").map((f) => f.nr)).toEqual([19]);
    expect(m[19]).toMatchObject({ nr: 20, art: "bild" });
    expect(m.filter((f) => f.art === "paket").map((f) => f.nr)).toEqual([21]);
  });

  it("jedes Folienbild liegt in public/ (scripts/vertrieb-folien.mjs)", () => {
    for (const a of ["vertreter", "makler"] as const) {
      for (const f of folienListe(a)) expect(existsSync(path.join("public", bildUrl(a, f.nr))), bildUrl(a, f.nr)).toBe(true);
    }
    expect(existsSync("public/praesentation/vertrieb/assistent.mp4")).toBe(true);
  });

  it("Zielgruppe: Angebot vor Kontakt, sonst Vertreter; aktuelles Angebot ohne Ersetzte/Abgelehnte/Tests", () => {
    expect(audienceFuer({ insurer: "Makler" }, null)).toBe("makler");
    expect(audienceFuer({ insurer: "Allianz" }, null)).toBe("vertreter");
    expect(audienceFuer(null, null)).toBe("vertreter");
    expect(audienceFuer({ insurer: "Makler" }, { vermittlerTyp: "vertreter" })).toBe("vertreter");
    expect(audienceFuer(null, { vermittlerTyp: "makler" })).toBe("makler");
    const t = (s: string, d: number, isTest = false) => ({ status: s, isTest, createdAt: new Date(2026, 10, d), s });
    expect(aktuellesAngebot([t("superseded", 1), t("sent", 2), t("draft", 4, true), t("declined", 3)])?.createdAt.getDate()).toBe(2);
    expect(aktuellesAngebot([t("superseded", 1)])).toBeNull();
  });
});

describe("Preise: Liste vs. Angebot", () => {
  it("Listenpreise wie auf Oles Folie", () => {
    const p = paketDaten(null, "vertreter");
    expect(p.quelle).toBe("liste");
    expect(p.setup.map((s) => s.betrag)).toEqual([2490, 1990, 990]);
    expect(p.setup.find((s) => s.markiert)?.label).toBe("Mit 12 Monaten");
    expect(p.monatlich.map((z) => z.betrag)).toEqual(["1.000 € netto", "1.400 € netto", "1.800 € netto", "individuelles Angebot"]);
    expect(p.monatlichNetto).toBe(1000);
    expect(p.setupRechnung).toEqual({ betrag: 2490, satz: "ohne Vertragslaufzeit" });
    expect(paketDaten(null, "makler").setupRechnung.betrag).toBe(990);
  });

  it("aus dem Angebot: Name, Nummer, vereinbartes Setup, Monatsbetrag mit weiteren Beratern", () => {
    const p = paketDaten(angebot(), "vertreter");
    expect(p).toMatchObject({ quelle: "angebot", name: "Agentur Muster", angebotNr: "PG-2026-0042", monatlichNetto: 1049 });
    expect(p.setup).toEqual([{ label: "Mit 12 Monaten", betrag: 990, markiert: true }]);
    expect(p.monatlich.map((z) => z.label)).toEqual(["Betreuung + Software", "Weitere Berater (1 × 49 €)", "Monatlich gesamt"]);
    expect(p.monatlich[0].detail).toBe("Katzenversicherung (30 € pro Tag)");
    expect(p.setupRechnung).toEqual({ betrag: 990, satz: "bei 12 Monaten Laufzeit" });
  });

  it("Angebot mit Laufzeitwahl, Empfehlungsrabatt, Modul und Jahreszahlung", () => {
    const p = paketDaten(angebot({ customerChoosesTerm: true, setupDiscount: 200, setupFee: 790, bestandMonthly: 149, annualPrepay: true, annualFreeMonths: 2, seats: 3 }), "vertreter");
    expect(p.setup.map((s) => s.betrag)).toEqual([2290, 1790, 790]);
    expect(p.setupHinweis).toBe("inklusive 200 € Empfehlungsrabatt");
    expect(p.monatlichNetto).toBe(1149);
    expect(p.jaehrlich).toBe("Jährlich im Voraus: 11.490 € netto für 12 Monate, 2 Monate geschenkt");
  });
});

describe("Rechnungen", () => {
  it("Vertreter mit Listenpreisen = Oles Folie (2.858 € Überschuss, Setup nach 1,5 Monaten, ≈ 31.000 € im ersten Jahr)", () => {
    const r = vertreterRechnung(1000, 2490);
    expect(r).toMatchObject({ werbe: 952, betreuung: 1190, ueberschuss: 2858, setupBrutto: 2963, setupMonate: 1.5, jahrRund: 31000 });
  });

  it("Makler mit Listenpreisen = Oles Folie (32.600 € Kosten, 269.500 € Courtage, Monat 7, 12 Monate; ohne Cross-Selling 12/18; 20 %: 7)", () => {
    const r = maklerRechnung(1000, 990);
    expect(r).toMatchObject({ neuProMonat: 36, kostenGesamt: 32600, courtageKatze: 146600, courtageZusatz: 122900, zusammen: 269500, faktor: 8 });
    expect(r).toMatchObject({ selbstAb: 7, zurueckNach: 12, selbstAbOhne: 12, zurueckNachOhne: 18 });
    expect(maklerRechnung(1000, 990, 0.2).zurueckNach).toBe(7);
  });

  it("Angebotspreise fließen in die Folien ein", () => {
    const fs = verkaufsFolien("vertreter", paketDaten(angebot(), "vertreter"));
    const rechnung = fs[18].html;
    expect(rechnung).toContain("Ihr Angebot PG-2026-0042 für Agentur Muster");
    expect(rechnung).toContain("1.049 € + USt.");
    expect(rechnung).toContain("1.248 €"); // 1.049 € × 1,19
    expect(rechnung).toContain("+ 2.800 €");
    expect(fs[19].html).toContain("1.049 € netto");
    expect(fs[16].html).toContain('src="/demo/beratung?eingebettet=1"');
    const m = verkaufsFolien("makler", paketDaten(angebot({ vermittlerTyp: "makler", monthlyFee: 1400, seats: 3 }), "makler"));
    expect(m[18].html).toContain("12 × 1.400 €");
    expect(m[20].html).toContain("1.400 € netto");
  });

  it("Texte an Interessenten ohne Gedankenstriche, Firmenname maskiert", () => {
    for (const a of ["vertreter", "makler"] as const) {
      for (const p of [paketDaten(null, a), paketDaten(angebot({ company: "<b>Böse & Co</b>" }), a)]) {
        const html = verkaufsFolien(a, p).map((f) => f.html).join("\n");
        expect(hatGedankenstrich(text(html))).toBe(false);
        expect(html).not.toContain("<b>Böse");
      }
    }
  });
});
