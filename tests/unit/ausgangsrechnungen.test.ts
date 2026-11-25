import { describe, expect, it } from "vitest";
import { betrag, parsePapierkramCsv } from "@/lib/ausgangsrechnungen";

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
