import { describe, expect, it } from "vitest";
import { buildZip } from "@/lib/export/zip";
import { deflateRawSync } from "node:zlib";
import { entpackeZip, entpackeZipEinzeln, istZip } from "@/lib/belege/zip";
import { bereinige } from "@/lib/belege/auslesen";
import { belegTyp } from "@/lib/belege/ablage";
import { belegAdresse, istBelegAdresse } from "@/lib/belege/eingang";

describe("ZIP lesen", () => {
  it("stored", () => {
    const zip = buildZip([{ name: "a/rechnung.pdf", data: "%PDF-1.4 x" }, { name: "__MACOSX/._x", data: "y" }, { name: "b.png", data: "z" }]);
    expect(istZip(zip)).toBe(true);
    const d = entpackeZip(zip);
    expect(d.map((x) => x.name)).toEqual(["rechnung.pdf", "b.png"]);
    expect(d[0].daten.toString()).toBe("%PDF-1.4 x");
  });
  it("deflate (eigenes Mini-ZIP)", () => {
    const inhalt = Buffer.from("%PDF-1.4 " + "a".repeat(500));
    const komp = deflateRawSync(inhalt);
    const name = Buffer.from("m.pdf");
    const lokal = Buffer.alloc(30);
    lokal.writeUInt32LE(0x04034b50, 0);
    lokal.writeUInt16LE(8, 8);
    lokal.writeUInt32LE(komp.length, 18);
    lokal.writeUInt32LE(inhalt.length, 22);
    lokal.writeUInt16LE(name.length, 26);
    const zentral = Buffer.alloc(46);
    zentral.writeUInt32LE(0x02014b50, 0);
    zentral.writeUInt16LE(8, 10);
    zentral.writeUInt32LE(komp.length, 20);
    zentral.writeUInt32LE(inhalt.length, 24);
    zentral.writeUInt16LE(name.length, 28);
    zentral.writeUInt32LE(0, 42);
    const vorne = Buffer.concat([lokal, name, komp]);
    const cd = Buffer.concat([zentral, name]);
    const ende = Buffer.alloc(22);
    ende.writeUInt32LE(0x06054b50, 0);
    ende.writeUInt16LE(1, 8);
    ende.writeUInt16LE(1, 10);
    ende.writeUInt32LE(cd.length, 12);
    ende.writeUInt32LE(vorne.length, 16);
    const d = entpackeZip(Buffer.concat([vorne, cd, ende]));
    expect(d).toHaveLength(1);
    expect(d[0].daten.equals(inhalt)).toBe(true);
  });
});

describe("ZIP Datei für Datei (große Meta-Pakete)", () => {
  it("keine Gesamtgrenze, nur je Datei", () => {
    const pdf = "%PDF-1.4 " + "x".repeat(1000);
    const zip = buildZip([{ name: "1.pdf", data: pdf }, { name: "2.pdf", data: pdf }, { name: "3.pdf", data: pdf }]);
    // Gesamt über 2 KB: entpackeZip mit Gesamtgrenze 2 KB lehnt ab, einzeln (je Datei 2 KB) klappt
    expect(() => entpackeZip(zip, 500, 2048)).toThrow("zip_zu_gross");
    expect([...entpackeZipEinzeln(zip, 3000, 2048)].map((d) => d.name)).toEqual(["1.pdf", "2.pdf", "3.pdf"]);
  });
});

describe("Auslesen bereinigen", () => {
  it("gültige Antwort", () => {
    expect(bereinige({ typ: "INCOMING_INVOICE", firma: " Railway ", nummer: "A-1", datum: "2026-10-04", netto: 16.8, ustSatz: 19, brutto: -20, waehrung: "usd" })).toEqual({
      typ: "INCOMING_INVOICE",
      firma: "Railway",
      nummer: "A-1",
      datum: "2026-10-04",
      netto: 16.8,
      ustSatz: 19,
      brutto: 20,
      waehrung: "USD",
    });
  });
  it("Unsinn wird null bzw. MISC/EUR", () => {
    const b = bereinige({ typ: "X", datum: "04.10.2026", brutto: "20", waehrung: "Euro" })!;
    expect(b.typ).toBe("MISC");
    expect(b.datum).toBeNull();
    expect(b.brutto).toBeNull();
    expect(b.waehrung).toBe("EUR");
    expect(bereinige(null)).toBeNull();
  });
});

describe("Dateityp und Adresse", () => {
  it("erkennt PDF, PNG, JPEG, sonst null", () => {
    expect(belegTyp(Buffer.from("%PDF-1.7"), "x")).toBe("application/pdf");
    expect(belegTyp(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "x")).toBe("image/jpeg");
    expect(belegTyp(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), "x")).toBe("image/png");
    expect(belegTyp(Buffer.from("MZ...."), "x.pdf")).toBeNull();
  });
  it("Beleg-Adresse mit Token", () => {
    const a = belegAdresse("geheim");
    expect(a).toMatch(/^belege-[0-9a-f]{10}@antwort\.dein-beratungstermin\.de$/);
    expect(istBelegAdresse(`Ole <${a.toUpperCase()}>`, "geheim")).toBe(true);
    expect(istBelegAdresse("belege-0000000000@antwort.dein-beratungstermin.de", "geheim")).toBe(false);
  });
});

import { eigenbelegPdf } from "@/lib/belege/eigenbeleg";
describe("Eigenbeleg", () => {
  it("erzeugt ein PDF mit Umlauten", async () => {
    const pdf = await eigenbelegPdf({ nummer: "EB-2026-001", empfaenger: "GODADDY Amsterdam", datum: "2026-07-06", betrag: 5.99, konto: "American Express", verwendungszweck: null, gegenstand: "Domainverlängerung", zweck: "Domain für die Webseite der Firma – Betrieb", grund: "Originalbeleg nicht auffindbar.", erstelltAm: "2026-11-23" });
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(800);
  });
});

import { belegeCsv, ohneDoppel, ustVorschau, vormonat, type PaketBeleg } from "@/lib/belege/monatspaket";
describe("Monatspaket", () => {
  const b = (o: Partial<PaketBeleg>): PaketBeleg => ({ id: Math.random().toString(), datum: "2026-11-05", typ: "INCOMING_INVOICE", quelle: "mail", firma: "X", nummer: null, netto: 100, ustSatz: 19, brutto: 119, waehrung: "EUR", zugeordnet: true, mimeType: "application/pdf", dateiname: null, ...o });
  it("USt-Vorschau", () => {
    const v = ustVorschau([
      b({ typ: "SALES_INVOICE", netto: 1000, brutto: 1190 }),
      b({ typ: "SALES_INVOICE", netto: 500, brutto: 500, ustSatz: 0 }),
      b({ typ: "INCOMING_INVOICE", netto: 100, brutto: 119 }),
      b({ typ: "INCOMING_INVOICE", netto: 50, brutto: 50, ustSatz: 0 }),
      b({ quelle: "eigenbeleg", netto: 20, brutto: 20, ustSatz: 0, typ: "RECEIPT" }),
      b({ waehrung: "USD", netto: 10, brutto: 10, ustSatz: 0 }),
    ]);
    expect(v).toMatchObject({ umsatzsteuer: 190, steuerpflichtigNetto: 1000, steuerfreiNetto: 500, vorsteuer: 19, ohneDeutscheUstEur: 50, eigenbelege: 20, fremdwaehrung: 1, zahllast: 171 });
  });
  it("Doppel nur einmal, CSV mit Semikolon und BOM", () => {
    const l = ohneDoppel([b({ nummer: "A1" }), b({ nummer: "A1" }), b({ nummer: "A2" })]);
    expect(l).toHaveLength(2);
    const csv = belegeCsv(l, new Map());
    expect(csv.startsWith("﻿Datum;Art")).toBe(true);
    expect(csv).toContain("100,00");
  });
  it("Vormonat", () => {
    expect(vormonat(new Date("2026-12-02T08:00:00Z"))).toBe("2026-11");
    expect(vormonat(new Date("2027-01-02T08:00:00Z"))).toBe("2026-12");
  });
});
