// Datenexport: CSV für Excel (Formel-Schutz, Semikolon, BOM).
import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/export/csv";
import { buildZip, crc32 } from "@/lib/export/zip";
import { eraseBlocker } from "@/lib/erasure";
import { AGENT_CONFIRM_TEXT, AGENT_CONFIRM_VERSION, agentConfirmText, mayOffer, needsAgentConfirm, offeredLines } from "@/lib/bestand/befugnis";

describe("CSV", () => {
  it("maskiert Trennzeichen und Anführungszeichen, schützt vor Formeln, lässt Telefonnummern", () => {
    expect(csvCell('Müller; "Max"')).toBe('"Müller; ""Max"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("@SUM")).toBe("'@SUM");
    expect(csvCell("-x")).toBe("'-x");
    expect(csvCell("+4915112345678")).toBe("+4915112345678");
    expect(csvCell(-12.5)).toBe("-12.5");
    expect(csvCell(null)).toBe("");
    expect(csvCell(true)).toBe("ja");
    expect(csvCell(new Date("2026-11-15T10:00:00Z"))).toBe("15.11.2026");
  });
  it("Kopfzeile, BOM, CRLF", () => {
    const s = toCsv(["A", "B"], [["1", "zwei\nZeilen"]]);
    expect(s.startsWith("﻿A;B\r\n1;")).toBe(true);
    expect(s).toContain('"zwei\nZeilen"');
  });
});

describe("ZIP", () => {
  it("CRC32 und Aufbau (lokale Einträge, Verzeichnis, Ende)", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const zip = buildZip([{ name: "a.csv", data: "x;y" }, { name: "Ä.txt", data: "Grüße" }], new Date("2026-11-15T10:00:00Z"));
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(zip.readUInt32LE(end)).toBe(0x06054b50);
    expect(zip.readUInt16LE(end + 10)).toBe(2);
    const cdOffset = zip.readUInt32LE(end + 16);
    expect(zip.readUInt32LE(cdOffset)).toBe(0x02014b50);
    // Inhalt unkomprimiert, Name UTF-8
    expect(zip.includes(Buffer.from("Grüße"))).toBe(true);
    expect(zip.includes(Buffer.from("Ä.txt"))).toBe(true);
  });
});

describe("Ausschließlichkeitsvertreter: Befugnis und Sparten", () => {
  it("vor dem ersten Import bestätigen, bei neuer Textversion erneut; Makler wie bisher einmal", () => {
    expect(needsAgentConfirm({ vermittlerTyp: "vertreter", bestandAgentConfirmedAt: null })).toBe(true);
    expect(needsAgentConfirm({ vermittlerTyp: "vertreter", bestandAgentConfirmedAt: new Date(), bestandAgentConfirmedVersion: null })).toBe(true);
    expect(needsAgentConfirm({ vermittlerTyp: "vertreter", bestandAgentConfirmedAt: new Date(), bestandAgentConfirmedVersion: AGENT_CONFIRM_VERSION })).toBe(false);
    expect(needsAgentConfirm({ vermittlerTyp: "mehrfachvertreter", bestandAgentConfirmedAt: new Date(), bestandAgentConfirmedVersion: null })).toBe(true);
    expect(needsAgentConfirm({ vermittlerTyp: "makler", bestandAgentConfirmedAt: new Date(), bestandAgentConfirmedVersion: null })).toBe(false);
    expect(needsAgentConfirm({ vermittlerTyp: "makler", bestandAgentConfirmedAt: null })).toBe(true);
    expect(agentConfirmText("vertreter")).toBe(AGENT_CONFIRM_TEXT);
    expect(AGENT_CONFIRM_TEXT).toBe("Ich bestätige, dass Upload und Nutzung dieser Kundendaten nach meinem Agenturvertrag und dem Datenschutzrecht zulässig sind.");
    expect(agentConfirmText("makler")).not.toContain("Agenturvertrag");
  });
  it("Cross-Selling-Vorschläge nur für angebotene Sparten (Profil, sonst Bestand); Makler ohne Einschränkung", () => {
    const fromProfile = offeredLines("vertreter", ["KFZ", "Haftpflicht"], ["KFZ", "Hausrat"]);
    expect(mayOffer(fromProfile, "Haftpflicht")).toBe(true);
    expect(mayOffer(fromProfile, "Hausrat")).toBe(false);
    const fromBestand = offeredLines("vertreter", [], ["KFZ", "Hausrat", "Sonstiges"]);
    expect([...fromBestand!].sort()).toEqual(["Hausrat", "KFZ"]);
    expect(mayOffer(fromBestand, "Rechtsschutz")).toBe(false);
    expect(offeredLines("makler", [], ["KFZ"])).toBeNull();
    expect(offeredLines("mehrfachvertreter", [], ["KFZ"])).toBeNull();
    expect(mayOffer(null, "Rechtsschutz")).toBe(true);
  });
});

describe("Löschung bei Vertragsende: Sicherungen", () => {
  const c = { name: "Agentur Meier", archived: false };
  it("Name genau, Vertragsende bestätigt (sonst archiviert), Grund", () => {
    expect(eraseBlocker(c, { confirmName: "Agentur Mei", contractEnded: true, reason: "Vertragsende" })).toMatch(/Kundennamen/);
    expect(eraseBlocker(c, { confirmName: "agentur meier", contractEnded: false, reason: "Vertragsende" })).toMatch(/nicht archiviert/);
    expect(eraseBlocker(c, { confirmName: "Agentur Meier", contractEnded: true, reason: "" })).toMatch(/Grund/);
    expect(eraseBlocker(c, { confirmName: "Agentur Meier", contractEnded: true, reason: "Vertragsende 31.12." })).toBeNull();
    expect(eraseBlocker({ ...c, archived: true }, { confirmName: "Agentur Meier", contractEnded: false, reason: "Vertragsende" })).toBeNull();
  });
});
