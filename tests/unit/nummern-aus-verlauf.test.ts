import { describe, expect, it } from "vitest";
import { extractHistoryPhones, historyText, newPhonesFor, skipHistoryEntry, sourceLabel } from "@/lib/vertrieb/kontaktdaten";

// Telefonnummern aus dem Verlauf (Ole, 24.11.2026): Beispiel Thomas Horn (Allianz), Mobilnummer stand nur in der Calendly-Notiz
const nums = (t: string, ex: string[] = []) => extractHistoryPhones(t, ex).map((p) => `${p.e164} ${p.kind}`);

describe("Nummern im Verlauf erkennen", () => {
  it("Calendly-Notiz mit Telefonnummer", () => {
    const note = "Neuer Kontakt aus Calendly\nGebucht von Thomas Horn (thomas.horn@allianz.de)\nQuelle (utm_source): website\nTelefonnummer: +49 176 60125010";
    expect(nums(note)).toEqual(["+4917660125010 MOBIL"]);
  });

  it("verschiedene Schreibweisen", () => {
    expect(nums("Mobil: 0176/60125010")).toEqual(["+4917660125010 MOBIL"]);
    expect(nums("Rückruf unter 0049 176 60125010 erbeten")).toEqual(["+4917660125010 MOBIL"]);
    expect(nums("Telefon: 0211 / 123 45 67")).toEqual(["+492111234567 FESTNETZ"]);
    expect(nums("Tel.: +49 (0) 211 1234567")).toEqual(["+492111234567 FESTNETZ"]);
    expect(nums("Tel.-Nr. 0211-1234567")).toEqual(["+492111234567 FESTNETZ"]);
    expect(nums("Hat angerufen, Handy 0171 2345678, gern ab 17 Uhr")).toEqual(["+491712345678 MOBIL"]);
    expect(nums("Sprach mit Frau Muster. Erreichbar unter 0151 23456789.")).toEqual(["+4915123456789 MOBIL"]);
    expect(nums("Unter welcher Nummer erreichen wir Sie?: 0172 9876543")).toEqual(["+491729876543 MOBIL"]);
    expect(nums("Telefonnummer (für SMS-Erinnerungen): +43 664 1234567")).toEqual(["+436641234567 MOBIL"]);
  });

  it("mehrere Nummern, jede nur einmal", () => {
    expect(nums("Tel: 0211 1234567 | Mobil: 0176 60125010\nNochmal mobil 0176-60125010")).toEqual(["+492111234567 FESTNETZ", "+4917660125010 MOBIL"]);
  });

  it("ignoriert Daten, Uhrzeiten, IDs und Postleitzahlen", () => {
    expect(nums("Termin über Calendly gebucht: Erstgespräch am 01.12.2026 14:00")).toEqual([]);
    expect(nums("Rückruf am 05/12/2026 um 10:30")).toEqual([]);
    expect(nums("Allianz Generalvertretung, Königsallee 1, 40212 Düsseldorf")).toEqual([]);
    expect(nums("Agentur in 01067 Dresden")).toEqual([]);
    expect(nums("Kundennummer: 0123456789")).toEqual([]);
    expect(nums("Vertragsnummer 0987654321 läuft aus")).toEqual([]);
    expect(nums("Vermittlernummer: 0456789123")).toEqual([]);
    expect(nums("IBAN: DE89 3704 0044 0532 0130 00")).toEqual([]);
    expect(nums("Kampagne: Allianz Q4 2026 (Schritt 2)")).toEqual([]);
    expect(nums("Link: https://zoom.us/j/01712345678?pwd=0211123456")).toEqual([]);
    expect(nums("Bewertung 4,8 bei 123 Bewertungen, 2026 gegründet")).toEqual([]);
  });

  it("keine Service-, Fax- und eigenen Nummern", () => {
    expect(nums("Schadenhotline 0221 1234567")).toEqual([]);
    expect(nums("Tel: 0211 1234567, Fax: 0211 1234568")).toEqual(["+492111234567 FESTNETZ"]);
    expect(nums("Kostenlos: 0800 1234567")).toEqual([]);
    expect(nums("Mobil: 0151 52418846", ["+49 151 52418846"])).toEqual([]);
  });

  it("zitierter Verlauf anderer Personen zählt nicht", () => {
    const t = "Gerne, rufen Sie mich an: 0171 2345678\n\nAm 12.11.2026 schrieb Ole Muster:\n> Mobil: 0160 9999999";
    expect(nums(t)).toEqual(["+491712345678 MOBIL"]);
    expect(historyText("a\n> b")).toBe("a\n");
  });
});

describe("Neue Nummern für den Kontakt", () => {
  const found = extractHistoryPhones("Telefonnummer: +49 176 60125010\nTel: 0211 1234567\nMobil: 0171 2345678");

  it("ohne Haupt-, weitere, entfernte und eigene Nummern (Schreibweise egal)", () => {
    const neu = newPhonesFor(found, { phone: "0211 / 123 45 67", extras: ["+4917660125010"], removed: [], ownKeys: new Set() });
    expect(neu.map((p) => p.e164)).toEqual(["+491712345678"]);
    expect(newPhonesFor(found, { phone: null, extras: [], removed: ["+491712345678"], ownKeys: new Set(["2111234567"]) }).map((p) => p.e164)).toEqual(["+4917660125010"]);
  });

  it("dieselbe Nummer aus zwei Einträgen nur einmal", () => {
    const doppelt = [...found, ...extractHistoryPhones("Handy 0176-60125010")];
    expect(newPhonesFor(doppelt, {}).map((p) => p.e164)).toEqual(["+4917660125010", "+492111234567", "+491712345678"]);
  });

  it("eigene Mails, Meldungen und Stufenwechsel werden übersprungen", () => {
    expect(skipHistoryEntry({ type: "NOTIZ", outcome: "Neue Telefonnummer erkannt" })).toBe(true);
    expect(skipHistoryEntry({ type: "EMAIL", outcome: "E-Mail: Angebot" })).toBe(true);
    expect(skipHistoryEntry({ type: "COLD_MAIL", outcome: "Automatische Antwort" })).toBe(true);
    expect(skipHistoryEntry({ type: "STATUS", outcome: "Neu → Termin" })).toBe(true);
    expect(skipHistoryEntry({ type: "TERMIN", outcome: "Termin über Calendly gebucht: Erstgespräch" })).toBe(false);
    expect(skipHistoryEntry({ type: "ANRUF", outcome: null })).toBe(false);
  });

  it("Herkunft „aus Verlauf“", () => {
    expect(sourceLabel("phone", "VERLAUF", new Date("2026-11-24T10:00:00Z"))).toBe("aus Verlauf 24.11.");
  });
});
