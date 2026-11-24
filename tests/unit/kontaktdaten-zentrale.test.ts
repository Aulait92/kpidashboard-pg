import { describe, expect, it } from "vitest";
import {
  centralPhone,
  extractHistoryPhones,
  extractMailPhones,
  newPhonesFor,
  sharedPhoneKeys,
  sharedPhoneReason,
  skipHistoryEntry,
  withoutCompanyFooter,
  type FoundPhone,
} from "@/lib/vertrieb/kontaktdaten";
import { phoneKey } from "@/lib/vertrieb/dubletten";

// Zentralen und Sammelnummern von Versicherern (Ole, 24.11.2026)
const phones = (t: string) => extractMailPhones(t).phones.map((p) => p.e164);

describe("bekannte Zentralen", () => {
  it("SIGNAL IDUNA Dortmund und Hamburg in jeder Schreibweise, auch Durchwahlen", () => {
    expect(centralPhone("0231 135-0")).toMatch(/SIGNAL IDUNA Dortmund/);
    expect(centralPhone("+49 231 1350")).toMatch(/SIGNAL IDUNA Dortmund/);
    expect(centralPhone("0231 135-4711")).toMatch(/SIGNAL IDUNA Dortmund/);
    expect(centralPhone("040 4124-0")).toMatch(/SIGNAL IDUNA Hamburg/);
    expect(centralPhone("+49404124 2000")).toMatch(/SIGNAL IDUNA Hamburg/);
    expect(centralPhone("089 3800-0")).toMatch(/Allianz/);
  });

  it("normale Nummern sind keine Zentrale", () => {
    expect(centralPhone("0231 1234567")).toBeNull();
    expect(centralPhone("0171 2345678")).toBeNull();
    expect(centralPhone("040 41250")).toBeNull();
    expect(centralPhone("")).toBeNull();
  });
});

describe("Häufigkeitsregel", () => {
  const rows = [
    { contactId: "a", phone: "+49302064184" },
    { contactId: "b", phone: "+49302064184" },
    { contactId: "c", phone: "+49302064184" },
    { contactId: "a", phone: "+49421123456" },
    { contactId: "b", phone: "+49421123456" },
    { contactId: "a", phone: "+49421999999" },
    { contactId: "a", phone: "+49421999999" }, // gleicher Kontakt zählt einmal
    { contactId: "a", phone: "+491712345678" },
    { contactId: "b", phone: "+491712345678" },
    { contactId: "c", phone: "+491712345678" }, // Mobil zählt nie (Dublette, keine Zentrale)
  ];

  it("Festnetznummer bei mindestens 3 verschiedenen Kontakten ist Sammelnummer", () => {
    const s = sharedPhoneKeys(rows);
    expect([...s]).toEqual([phoneKey("+49302064184")]);
    expect(sharedPhoneReason("030 2064184", s)).toMatch(/mindestens 3 Kontakten/);
    expect(sharedPhoneReason("0421 123456", s)).toBeNull();
    expect(sharedPhoneReason("0171 2345678", s)).toBeNull();
  });

  it("Grenze einstellbar, Zentrale gilt immer", () => {
    expect(sharedPhoneKeys(rows, 2).has(phoneKey("0421 123456")!)).toBe(true);
    expect(sharedPhoneReason("0231 135-0")).toMatch(/Zentrale SIGNAL IDUNA/);
  });

  it("neue Nummern aus dem Verlauf: Zentralen und Sammelnummern fallen weg", () => {
    const f = (e164: string): FoundPhone => ({ raw: e164, e164, kind: "FESTNETZ", label: null });
    const neu = newPhonesFor([f("+492311350"), f("+49302064184"), f("+49421777777")], { shared: sharedPhoneKeys(rows) });
    expect(neu.map((p) => p.e164)).toEqual(["+49421777777"]);
  });
});

describe("Signatur ohne Pflichtangaben des Versicherers", () => {
  const mail = [
    "Hallo Herr Ole,",
    "gerne nächste Woche.",
    "",
    "Viele Grüße",
    "Lucas Walter",
    "SIGNAL IDUNA Generalagentur Walter",
    "Mobil: 0171 2345678",
    "Tel.: 0421 123456",
    "",
    "SIGNAL IDUNA Krankenversicherung a. G., Joseph-Scherer-Straße 3, 44139 Dortmund, Tel. 0231 135-0",
    "SIGNAL IDUNA Allgemeine Versicherung AG, Neue Rabenstraße 15-19, 20354 Hamburg, Telefon 030 2064184",
    "Vorsitzender des Aufsichtsrats: Max Muster, Vorstand: Erika Muster",
    "Sitz der Gesellschaft: Dortmund, Registergericht Dortmund HRB 1234, Telefon 040 4124-0",
  ].join("\n");

  it("nur die Nummern der Person, keine Zentrale", () => {
    expect(phones(mail)).toEqual(["+491712345678", "+49421123456"]);
  });

  it("Pflichtangaben-Block wird ab Sitz/Vorstand/Aufsichtsrat abgeschnitten", () => {
    const t = "Lucas Walter\nTel: 0421 123456\nVorstand: Erika Muster\nTelefon 030 9999999";
    expect(withoutCompanyFooter(t)).toBe("Lucas Walter\nTel: 0421 123456");
    expect(phones(`Gruß\n${t}`)).toEqual(["+49421123456"]);
  });

  it("Zeilen mit Zentrale oder Hauptverwaltung zählen nicht", () => {
    expect(phones("Viele Grüße\nMax Muster\nTel. 0421 123456\nZentrale: 0221 9876543")).toEqual(["+49421123456"]);
    expect(phones("Viele Grüße\nMax Muster\nHauptverwaltung Telefon 0511 9876543\nMobil 0172 3456789")).toEqual(["+491723456789"]);
  });

  it("bekannte Zentrale fällt auch ohne Hinweis weg", () => {
    expect(phones("Viele Grüße\nMax Muster\nTel. 0231 135-0\nMobil 0172 3456789")).toEqual(["+491723456789"]);
  });

  it("Agentur mit eigener Bezirksdirektion behält ihre Nummer", () => {
    expect(phones("Viele Grüße\nMax Muster\nBezirksdirektion Muster\nTel. 0421 123456")).toEqual(["+49421123456"]);
  });
});

describe("Verlauf", () => {
  it("Zentralen und Pflichtangaben im Verlauf ergeben keine Nummer", () => {
    const t = "Telefon: 0231 135-0\nSIGNAL IDUNA Lebensversicherung a. G., Tel. 040 98765432\nHandy: 0171 2345678";
    expect(extractHistoryPhones(t).map((p) => p.e164)).toEqual(["+491712345678"]);
  });

  it("„Vorstand“ in einer Anrufnotiz schneidet nichts ab", () => {
    expect(extractHistoryPhones("Herr Muster ist im Vorstand des Vereins\nMobil: 0171 2345678").map((p) => p.e164)).toEqual(["+491712345678"]);
  });

  it("eigener Aufräum-Eintrag wird nicht wieder ausgewertet", () => {
    expect(skipHistoryEntry({ type: "NOTIZ", outcome: "Zentrale Nummer entfernt", note: "+49 231 1350 (Zentrale SIGNAL IDUNA Dortmund)" })).toBe(true);
  });
});
