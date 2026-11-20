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
  it("Vertreter 24, Makler 25 (Folie 18 Komplettcheck, 19 Policen vorab; Makler mit Tarifvergleich nach Folie 21)", () => {
    const v = folienListe("vertreter", false);
    const m = folienListe("makler", false);
    expect(v).toHaveLength(24);
    expect(m).toHaveLength(25);
    expect(v[12]).toMatchObject({ nr: 13, art: "video" });
    expect(v[16]).toMatchObject({ nr: 17, art: "demo", titel: "Beraten mit echten Preisen" });
    for (const l of [v, m]) expect(l[17]).toMatchObject({ nr: 18, bild: 18, art: "bild", titel: "Viele wollen den Komplettcheck" });
    for (const l of [v, m]) expect(l[18]).toMatchObject({ nr: 19, bild: 19, art: "bild", titel: "Policen vorab" });
    for (const l of [v, m]) expect(l[19]).toMatchObject({ nr: 20, bild: 20, titel: "Sie wissen jederzeit, ob es sich rechnet" });
    expect(v.filter((f) => f.art === "rechnung").map((f) => f.nr)).toEqual([21]);
    expect(v.filter((f) => f.art === "paket").map((f) => f.nr)).toEqual([22]);
    expect(m.filter((f) => f.art === "rechnung").map((f) => f.nr)).toEqual([21]);
    expect(m[21]).toMatchObject({ nr: 22, art: "bild", titel: "Mit Tarifvergleich: alles zurück nach 7 Monaten" });
    expect(m.filter((f) => f.art === "paket").map((f) => f.nr)).toEqual([23]);
  });

  it("mit Abschlussbonus: vorletzte Folie, Bildnummern bleiben wie in der PPTX", () => {
    const v = folienListe("vertreter");
    expect(v).toHaveLength(25);
    expect(v[23]).toMatchObject({ nr: 24, art: "bonus", bild: 0 });
    expect(v[24]).toMatchObject({ nr: 25, bild: 24, titel: "Ihr Start in 3 Schritten" });
    expect(folienListe("makler").at(-1)).toMatchObject({ nr: 26, bild: 25 });
  });

  it("jedes Folienbild liegt in public/ (scripts/vertrieb-folien.mjs)", () => {
    for (const a of ["vertreter", "makler"] as const) {
      for (const f of folienListe(a).filter((x) => x.bild > 0)) expect(existsSync(path.join("public", bildUrl(a, f.bild))), bildUrl(a, f.bild)).toBe(true);
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
    // Neue Listenpreise seit 18.11.2026 (vorher 1.000/1.400/1.800 €)
    expect(p.monatlich.map((z) => z.betrag)).toEqual(["990 € netto", "1.390 € netto", "1.790 € netto", "individuelles Angebot"]);
    expect(p.monatlich[0].detail).toBe("≈ 33 € pro Tag");
    expect(p.monatlichNetto).toBe(990);
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
  it("Vertreter mit 1.000 € (Listenpreis bis 18.11.2026) = Oles Folie (2.858 € Überschuss, Setup nach 1,5 Monaten, ≈ 31.000 € im ersten Jahr)", () => {
    const r = vertreterRechnung(1000, 2490);
    expect(r).toMatchObject({ werbe: 952, betreuung: 1190, ueberschuss: 2858, setupBrutto: 2963, setupMonate: 1.5, jahrRund: 31000 });
  });

  it("Makler mit 1.000 € (Listenpreis bis 18.11.2026) = Oles Folie (32.600 € Kosten, 269.500 € Courtage, Monat 7, 12 Monate; ohne Cross-Selling 12/18; 20 %: 7)", () => {
    const r = maklerRechnung(1000, 990);
    expect(r).toMatchObject({ neuProMonat: 36, kostenGesamt: 32600, courtageKatze: 146600, courtageZusatz: 122900, zusammen: 269500, faktor: 8 });
    expect(r).toMatchObject({ selbstAb: 7, zurueckNach: 12, selbstAbOhne: 12, zurueckNachOhne: 18 });
    expect(maklerRechnung(1000, 990, 0.2).zurueckNach).toBe(7);
  });

  it("Angebotspreise fließen in die Folien ein", () => {
    const fs = verkaufsFolien("vertreter", paketDaten(angebot(), "vertreter"));
    const rechnung = fs.find((f) => f.titel === "Rechnet sich das?")!.html;
    expect(rechnung).toContain("Ihr Angebot PG-2026-0042 für Agentur Muster");
    expect(rechnung).toContain("1.049 € + USt.");
    expect(rechnung).toContain("1.248 €"); // 1.049 € × 1,19
    expect(rechnung).toContain("+ 2.800 €");
    expect(fs[21].html).toContain("1.049 € netto");
    expect(fs[16].html).toContain('src="/demo/beratung?eingebettet=1"');
    const m = verkaufsFolien("makler", paketDaten(angebot({ vermittlerTyp: "makler", monthlyFee: 1400, seats: 3 }), "makler"));
    expect(m[20].html).toContain("12 × 1.400 €");
    expect(m[22].html).toContain("1.400 € netto");
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

describe("Pay-per-Lead + Software (Ole, 20.11.2026)", () => {
  it("eigene Fassung mit 18 Bildfolien, ohne Bonus; Angebot mit Paket ppl_software wählt sie", async () => {
    const m = await import("@/lib/vertrieb/verkaufspraesentation");
    const l = m.folienListe("ppl");
    expect(l).toHaveLength(18);
    expect(l.every((f) => f.art === "bild")).toBe(true);
    expect(m.bildUrl("ppl", 18)).toBe("/praesentation/vertrieb/ppl/18.webp");
    expect(m.audienceFuer(null, { vermittlerTyp: "vertreter", package: "ppl_software" })).toBe("ppl");
    expect(m.audienceFuer(null, { vermittlerTyp: "makler", package: "software" })).toBe("makler");
  });
});
