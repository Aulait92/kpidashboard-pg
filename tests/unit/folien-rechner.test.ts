import { describe, expect, it } from "vitest";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { pplRechnung, rechnerAusgabe, zahlFeld, zahlLesen } from "@/lib/vertrieb/folien-rechner";
import { paketDaten, verkaufsFolien, type AngebotFuerFolien } from "@/lib/vertrieb/verkaufspraesentation";

// Rechen-Folien zum Mitrechnen im Call (Ole, 20.11.2026): Pay-per-Lead „Rechnen Sie mit Ihren Zahlen“, Vertreter „Rechnet sich das?“.

const ppl = (w: Partial<Record<string, number | null>>, software = 349) =>
  rechnerAusgabe("ppl", { leads: 20, preis: 35, termine: 8, abschluesse: 4, provision: null, ...w }, { software })!;

describe("Zahlen im deutschen Format", () => {
  it("liest Tausenderpunkte, Komma, Euro-Zeichen; leer und Unsinn = null", () => {
    expect(zahlLesen("1.200")).toBe(1200);
    expect(zahlLesen("35,50 €")).toBe(35.5);
    expect(zahlLesen("1.234,5")).toBe(1234.5);
    expect(zahlLesen(" 8 ")).toBe(8);
    expect(zahlLesen("35.5")).toBe(35.5);
    expect(zahlLesen("")).toBeNull();
    expect(zahlLesen("abc")).toBeNull();
    expect(zahlLesen("-5")).toBeNull();
    expect(zahlFeld(1200)).toBe("1.200");
    expect(zahlFeld(35.5)).toBe("35,5");
    expect(zahlFeld(null)).toBe("");
    expect(zahlFeld(35.5, true)).toBe("35,50");
    expect(zahlFeld(35, true)).toBe("35");
  });
});

describe("Pay-per-Lead: Rechnen Sie mit Ihren Zahlen", () => {
  it("Beispiel wie auf der Folie: 700 € + 349 € = 1.049 €, 131 € pro Termin, 262 € pro Abschluss", () => {
    const a = ppl({});
    expect(a.text).toMatchObject({ leads: "20 × 35 € = 700 €", software: "349 €", monat: "1.049 €", terminRechnung: "1.049 € ÷ 8", termin: "131 €", abschlussRechnung: "1.049 € ÷ 4", abschluss: "262 €" });
    expect(a.ton.fazit).toBe("info");
    expect(a.text.fazit).toContain("Provision je Abschluss");
  });

  it("Provision darüber, darunter, gleich", () => {
    expect(ppl({ provision: 600 }).text.fazit).toBe("Ihre Provision 600 € liegt 338 € über den Kosten pro Abschluss.");
    expect(ppl({ provision: 600 }).ton.fazit).toBe("plus");
    expect(ppl({ provision: 200 }).text.fazit).toBe("Ihre Provision 200 € liegt 62 € unter den Kosten pro Abschluss.");
    expect(ppl({ provision: 200 }).ton.fazit).toBe("minus");
    expect(ppl({ provision: 262 }).text.fazit).toBe("Ihre Provision 262 € entspricht etwa den Kosten pro Abschluss.");
  });

  it("nie durch 0 teilen, fehlende Werte ohne Strich", () => {
    expect(pplRechnung({ leads: 20, preis: 35, termine: 0, abschluesse: null, provision: 600 }, 349)).toMatchObject({ monat: 1049, proTermin: null, proAbschluss: null, abstand: null });
    const a = ppl({ termine: 0, abschluesse: null, provision: 600 });
    expect(a.text).toMatchObject({ termin: "Termine eintragen", abschluss: "Abschlüsse eintragen", terminRechnung: "", abschlussRechnung: "" });
    expect(a.ton).toMatchObject({ termin: "leer", abschluss: "leer", fazit: "info" });
    const b = ppl({ preis: null });
    expect(b.text).toMatchObject({ leads: "bitte eintragen", monat: "bitte eintragen", termin: "", abschluss: "" });
    for (const x of [a, b, ppl({ provision: 600 })]) for (const t of Object.values(x.text)) expect(t).not.toMatch(/^[–—-]$|NaN|Infinity/);
  });

  it("Cent-Beträge und Software aus dem Angebot", () => {
    expect(ppl({ preis: 35.5 }, 398).text).toMatchObject({ leads: "20 × 35,50 € = 710 €", software: "398 €", monat: "1.108 €" });
  });
});

describe("Vertreter: Rechnet sich das?", () => {
  const fest = { monat: 1049, setup: 990, satz: "mit 12 Monaten Laufzeit", angebot: 1 };
  it("Beispielwerte wie bisher, eigene Werte rechnen Überschuss, Setup und Jahr neu", () => {
    const a = rechnerAusgabe("vertreter", { leads: 200, werbe: 800, volumen: 8600, provision: 5000 }, fest)!;
    expect(a.text).toMatchObject({ ueberschuss: "+ 2.800 €", werbe: "− 952 €", chip: "Echtes Ergebnis · Allianz-Vertreter mit Katzenversicherung" });
    expect(a.ton.ueberschuss).toBe("plus");
    const b = rechnerAusgabe("vertreter", { leads: 100, werbe: 400, volumen: 4000, provision: 2000 }, fest)!;
    // 2.000 − 476 − 1.248 = 276 €; Setup 1.178 € brutto → 4,5 Monate
    expect(b.text).toMatchObject({ ueberschuss: "+ 276 €", setupTitel: "Setup nach 4,5 Monaten wieder drin", fussLeads: "100", chip: "Ihre Zahlen · Beispielrechnung" });
    const c = rechnerAusgabe("vertreter", { leads: null, werbe: null, volumen: null, provision: 1000 }, fest)!;
    expect(c.text.ueberschuss).toBe("− 248 €");
    expect(c.text.setupTitel).toBe("Setup: im Beispiel noch nicht wieder drin");
    expect(c.text.jahr).toBe("Im ersten Jahr: ≈ 0 € Überschuss*");
  });
});

describe("Folien-HTML", () => {
  const angebot = (x: Partial<AngebotFuerFolien> = {}): AngebotFuerFolien =>
    ({
      number: "PG-1",
      company: "Muster",
      contactName: "Max",
      package: "ppl_software",
      vermittlerTyp: "vertreter",
      term: "none",
      products: [],
      setupFee: 0,
      monthlyFee: 349,
      seats: null,
      seatsIncluded: null,
      seatMonthly: null,
      bestandMonthly: null,
      empfehlungMonthly: null,
      annualPrepay: false,
      annualFreeMonths: null,
      customerChoosesTerm: false,
      setupDiscount: null,
      introMonthlyFee: null,
      introMonths: null,
      ...x,
    }) as AngebotFuerFolien;

  it("PPL-Folie 16 hat Eingabefelder, vorbelegt, Provision leer; Hinweis „keine Zusage“ bleibt", () => {
    const f = verkaufsFolien("ppl", paketDaten(null, "ppl"))[15];
    expect(f.titel).toBe("Rechnen Sie mit Ihren Zahlen");
    expect(f.html).toContain('data-rechner="ppl"');
    expect(f.html).toContain('inputmode="decimal"');
    expect(f.html).toContain('data-feld="leads" aria-label="Leads im Monat" value="20"');
    expect(f.html).toMatch(/data-feld="provision"[^>]*value=""[^>]*placeholder="Ihr Wert"/);
    expect(f.html).toContain("262 €");
    expect(f.html).toContain("Reines Rechenbeispiel, keine Zusage");
    expect(hatGedankenstrich(f.html.replace(/<[^>]+>/g, " "))).toBe(false);
    // Software aus dem Angebot
    expect(verkaufsFolien("ppl", paketDaten(angebot({ monthlyFee: 398 }), "ppl"))[15].html).toContain("{&quot;software&quot;:398}");
  });

  it("Vertreter-Folie hat Felder, Makler bleibt fest", () => {
    const v = verkaufsFolien("vertreter", paketDaten(null, "vertreter")).find((x) => x.titel === "Rechnet sich das?")!;
    expect(v.html).toContain('data-rechner="vertreter"');
    expect(v.html).toContain('data-feld="provision" data-euro aria-label="Provision" value="5.000"');
    const m = verkaufsFolien("makler", paketDaten(null, "makler")).find((x) => x.titel.startsWith("Rechnet sich das"))!;
    expect(m.html).not.toContain("data-rechner");
  });
});
