// Modultest Bestandskunden (18.11.2026): Fehler beim Import echter Exporte und Geburtstags-Fälligkeit.
import { describe, expect, it } from "vitest";
import { decodeText, parseFile } from "@/lib/bestand/import";
import { detectMapping, groupRows, importPhone, isBlockedColumn, LINE_NAMES, normalizeLine, parseDate } from "@/lib/bestand/rows";
import { birthdayState } from "@/lib/bestand/campaigns";

const header = "VN-Nr;Vorname;Name;Straße;Mobil;Sparte;Jahresbeitrag\r\n";
const row = "1001;Jürgen;Müller;Hauptstraße 1;0170 1234567;Kfz;480,00 €\r\n";

describe("Import: Windows-1252 (CSV aus Excel unter Windows)", () => {
  it("Umlaute und Euro-Zeichen bleiben erhalten, Jahresbeitrag wird gelesen", async () => {
    const latin = Buffer.from(new Uint8Array([...header + row].map((ch) => (ch === "€" ? 0x80 : ch.charCodeAt(0)))));
    expect(decodeText(latin)).toContain("Müller");
    const { headers, rows } = await parseFile(latin, "export.csv");
    expect(headers).toContain("Straße");
    const g = groupRows(rows, detectMapping(headers));
    const k = [...g.groups.values()][0];
    expect(k).toMatchObject({ firstName: "Jürgen", lastName: "Müller", street: "Hauptstraße 1" });
    expect(k.contracts[0].annualPremium).toBe(480);
  });

  it("UTF-8 bleibt UTF-8", () => {
    expect(decodeText(Buffer.from(header + row, "utf8"))).toContain("Jürgen;Müller;Hauptstraße 1");
  });

  it("kaputte Excel-Datei: verständliche Meldung statt Technikfehler", async () => {
    await expect(parseFile(Buffer.from("das ist kein excel"), "liste.xlsx")).rejects.toThrow(/Excel-Datei konnte nicht gelesen werden/);
  });
});

describe("Import: Spaltenerkennung", () => {
  it("„Straße“ (mit ß) wird erkannt", () => {
    expect(detectMapping(["Name", "Straße", "Mobil"]).street).toBe("Straße");
    expect(detectMapping(["Name", "Straße u. Hausnr.", "Mobil"]).street).toBe("Straße u. Hausnr.");
  });

  it("„Kunde seit“ ist kein Name, „Kunde“ schon", () => {
    expect(detectMapping(["Vorname", "Name", "Kunde seit", "Mobil"]).fullName).toBeUndefined();
    expect(detectMapping(["Kunde", "Mobil"]).fullName).toBe("Kunde");
  });

  it("Spalten mit Körpergröße werden nie angeboten", () => {
    expect(isBlockedColumn("Körpergröße")).toBe(true);
    expect(isBlockedColumn("Groesse")).toBe(true);
  });
});

describe("Import: Werte", () => {
  it("Mobilnummer ohne führende 0 (Excel-Zahl) wird deutsch, nicht USA", () => {
    expect(importPhone("1701234567")).toBe("491701234567");
    expect(importPhone("15112345678")).toBe("4915112345678");
    expect(importPhone("0170 1234567")).toBe("491701234567");
    expect(importPhone("+1 650 555 1234")).toBe("16505551234");
    expect(importPhone("4917012345678")).toBe("4917012345678");
    expect(importPhone("")).toBeNull();
  });

  it("Datum mit Uhrzeit", () => {
    expect(parseDate("12.03.1975 00:00:00")?.toISOString()).toBe("1975-03-12T00:00:00.000Z");
    expect(parseDate("12.03.1975 08:30")?.toISOString()).toBe("1975-03-12T00:00:00.000Z");
    expect(parseDate("12.03.1975")?.toISOString()).toBe("1975-03-12T00:00:00.000Z");
  });

  it("Tierhalterhaftpflicht ist Tier, Reisekranken ist Reise, „garantiert“ ist kein Tier", () => {
    expect(normalizeLine("Tierhalterhaftpflicht")).toBe("Tier");
    expect(normalizeLine("Hundehaftpflicht")).toBe("Tier");
    expect(normalizeLine("Reisekrankenversicherung")).toBe("Reise");
    expect(normalizeLine("Privathaftpflicht")).toBe("Haftpflicht");
    expect(normalizeLine("Privatrente garantiert")).toBe("Vorsorge");
    expect(normalizeLine("Kfz-Haftpflicht")).toBe("KFZ");
    expect(LINE_NAMES[0]).toBe("KFZ");
    expect(LINE_NAMES).toHaveLength(12);
  });
});

describe("Import-Formular: Zuordnung bleibt nach einer Fehlermeldung stehen", () => {
  it("Schritt 3 setzt das Formular nicht automatisch zurück (kein action={…} mit gesteuerten Auswahlfeldern)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/buyer/bestand/import/import-flow.tsx", "utf8");
    expect(src).not.toMatch(/action=\{\(fd\) => runImport/);
    expect(src).toMatch(/onSubmit=\{\(e\) => \{\s*e\.preventDefault\(\);[\s\S]{0,200}runImport\(fd\)/);
  });
});

describe("Geburtstagskampagne: Fälligkeit", () => {
  const b = new Date("1980-11-20");
  it("wartet vor dem Geburtstag, ist am Tag und bis 2 Tage danach fällig, danach verpasst", () => {
    expect(birthdayState(b, new Date("2026-11-16T09:00:00Z"))).toBe("wait");
    expect(birthdayState(b, new Date("2026-11-20T09:00:00Z"))).toBe("due");
    // Kurz nach Mitternacht Berliner Zeit (UTC noch 19.11.)
    expect(birthdayState(b, new Date("2026-11-19T23:30:00Z"))).toBe("due");
    expect(birthdayState(b, new Date("2026-11-22T09:00:00Z"))).toBe("due");
    expect(birthdayState(b, new Date("2026-11-25T09:00:00Z"))).toBe("missed");
    expect(birthdayState(null, new Date())).toBe("due");
  });
});
