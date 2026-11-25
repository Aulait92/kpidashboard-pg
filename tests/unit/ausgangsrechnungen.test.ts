import { describe, expect, it } from "vitest";
import { appKundeZu, betrag, bereichVorschlag, parsePapierkramCsv } from "@/lib/ausgangsrechnungen";

// Papierkram-Export „Rechnungen“ (Ole, 25.11.2026): Entwürfe raus, deutsche Zahlen und Daten, Anführungszeichen.
const kopf = "Rechnungsnr.;Betreff;Kunde;Land;Projekt;Kundennummer;Datum;Fälligkeitsdatum;Status;Typ;Netto;USt.;Brutto;Skonto;Bezahlt;letztes Bezahldatum;Notiz;Mahnungsdatum;Waren & Dienstleistungen";

describe("Papierkram-CSV", () => {
  it("liest Rechnungen, lässt Entwürfe weg", () => {
    const csv = [
      kopf,
      `R-00144;"";Tobias D'Angelo;Deutschland;"";K-00034;19.11.2026;26.11.2026;Unbezahlt;Rechnung;1.500,00;0,00;1.500,00;0,00;0,00;"";Rechnung basiert auf Rechnung R-00143.;"";""`,
      `Entwurf;Rechnung Oktober 2026;VENTIS Holding AG;Deutschland;"";K-00018;01.11.2026;15.11.2026;Entwurf;Rechnung;1.900,00;361,00;2.261,00;0,00;0,00;"";"";"";""`,
      `R-00077;"";Bahmann Coaching GmbH;Deutschland;"";K-00020;05.06.2026;19.06.2026;Unbezahlt;Rechnung;10.125,00;1.923,75;12.048,75;0,00;0,00;"";"";"";""`,
      `R-00099;"";"Firma ""mit"" Zeichen; GmbH";Deutschland;"";K-1;25.08.2026;01.09.2026;Bezahlt;Rechnung;1.500,00;0,00;1.500,00;0,00;1.500,00;2026-09-01;"";"";""`,
      "",
    ].join("\r\n");
    const z = parsePapierkramCsv(csv);
    expect(z.map((x) => x.nummer)).toEqual(["R-00144", "R-00077", "R-00099"]);
    expect(z[1]).toMatchObject({ datum: "2026-06-05", kunde: "Bahmann Coaching GmbH", netto: 10125, ust: 1923.75, brutto: 12048.75, status: "Unbezahlt" });
    expect(z[2].kunde).toBe('Firma "mit" Zeichen; GmbH');
  });
  it("Beträge", () => {
    expect(betrag("1.500,00")).toBe(1500);
    expect(betrag("-16,80")).toBe(-16.8);
    expect(betrag("")).toBe(0);
  });
  it("falsche Datei: klare Meldung", () => {
    expect(() => parsePapierkramCsv("Datum;Betrag\n01.01.2026;5")).toThrow(/Spalte fehlt/);
  });
});

describe("Bereich-Vorschlag (Ole, 25.11.2026: Funnelprojekte, dann Pay-per-Lead, jetzt Software & Betreuung)", () => {
  // Namen aus angenommenen Software-Angeboten, seit = Erstellung des Angebots
  const app = [
    { name: "Allianz Versicherung Anid Schwarzkopf HAUPTVERTRETUNG", seit: "2026-11-13" },
    { name: "Allianz Hauptvertretung Marco Rutsch", seit: "2026-12-01" },
  ];
  const v = (kunde: string, datum: string, typ = "Rechnung") => bereichVorschlag({ kunde, datum, typ }, app);
  it("Projektkunden und alles vor Juni: Funnelprojekte", () => {
    expect(v("VENTIS Holding AG", "2026-07-28")).toBe("funnel");
    expect(v("Bahmann Coaching GmbH", "2026-06-05")).toBe("funnel");
    expect(v("Irgendwer", "2026-03-08")).toBe("funnel");
  });
  it("Software & Betreuung nur mit angenommenem Software-Angebot, ab dessen Erstellung", () => {
    expect(v("Allianz Hauptvertretung Anid Schwarzkopf", "2026-11-20")).toBe("software");
    expect(v("Allianz Hauptvertretung Anid Schwarzkopf", "2026-11-09")).toBe("ppl");
    expect(v("Marco Rutsch Allianzvertretung", "2026-11-02")).toBe("ppl");
    expect(v("Marco Rutsch Allianzvertretung", "2026-12-05")).toBe("software");
    expect(v("verrata24 GmbH", "2026-11-16")).toBe("ppl");
    expect(v("PKV-Hilfe GmbH", "2026-11-10")).toBe("ppl");
  });
  it("Gutschriften: Lead-Käufer Pay-per-Lead, Digistore Sonstiges", () => {
    expect(v("garantiertmehrit GmbH", "2026-08-06", "Gutschrift")).toBe("ppl");
    expect(v("Digistore24 GmbH", "2026-06-09", "Gutschrift")).toBe("sonstiges");
  });
  it("Namensabgleich ignoriert Allerweltswörter", () => {
    expect(appKundeZu("Allianz Versicherung Norman Hesse", app)).toBeNull();
    expect(appKundeZu("Marco Rutsch Allianzvertretung", app)?.name).toBe("Allianz Hauptvertretung Marco Rutsch");
  });
});
