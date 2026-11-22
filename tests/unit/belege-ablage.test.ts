import { describe, expect, it } from "vitest";
import { buildZip } from "@/lib/export/zip";
import { deflateRawSync } from "node:zlib";
import { entpackeZip, istZip } from "@/lib/belege/zip";
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
