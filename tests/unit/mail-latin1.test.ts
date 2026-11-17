// Lead-Mail an Pivacom in ISO-8859-1 (Ole, 17.11.2026: „Der Zeichensatz (Charset) der E-Mail ist nicht wie vorgeschrieben!“)
import { describe, expect, it } from "vitest";
import { brauchtLatin1, kopf, latin1Mail, quotedPrintable, zuLatin1 } from "@/lib/mail/latin1";

describe("Latin-1-Mail", () => {
  it("nur Pivacom-Adressen (Standard)", () => {
    expect(brauchtLatin1("leads@pivacom.com")).toBe(true);
    expect(brauchtLatin1("Leads <LEADS@PIVACOM.COM>")).toBe(true);
    expect(brauchtLatin1("x@kunde.de")).toBe(false);
    expect(brauchtLatin1("x@notpivacom.com")).toBe(false);
  });

  it("Umlaute bleiben, Euro und typografische Zeichen werden ersetzt", () => {
    expect(zuLatin1("Geprüft: ja · Größe 5 € „gut“ – ok")).toBe('Geprüft: ja · Größe 5 EUR "gut" - ok');
    expect(zuLatin1("Łukasz")).toBe("Lukasz");
  });

  it("Mail: Kopf nur ASCII, Charset ISO-8859-1, Inhalt als Latin-1-Bytes (8bit)", () => {
    const raw = latin1Mail({ from: "performancegrowth <leads@performancegrowth.de>", to: "leads@pivacom.com", subject: "Neuer Lead – Prüfung", text: "Brokercode: abc\nGeprüft: nein\nName: Müller", date: new Date("2026-11-17T06:00:00Z") });
    const sep = raw.indexOf("\r\n\r\n");
    const head = raw.subarray(0, sep).toString("ascii");
    const body = raw.subarray(sep + 4);
    expect(head).toContain("Content-Type: text/plain; charset=ISO-8859-1");
    expect(head).toContain("Content-Transfer-Encoding: 8bit");
    expect(head).toMatch(/^Subject: =\?ISO-8859-1\?Q\?Neuer_Lead_-_Pr=FCfung\?=$/m);
    expect([...raw.subarray(0, sep)].every((b) => b < 128)).toBe(true);
    // „ü“ als ein Byte 0xFC, nicht als UTF-8 (0xC3 0xBC)
    expect(body.includes(Buffer.from([0xfc]))).toBe(true);
    expect(body.includes(Buffer.from([0xc3, 0xbc]))).toBe(false);
    expect(body.toString("latin1")).toBe("Brokercode: abc\r\nGeprüft: nein\r\nName: Müller\r\n");
  });

  it("quoted-printable für sehr lange Zeilen, Kopf mit Umlauten kodiert", () => {
    const qp = quotedPrintable(`Geprüft ${"x".repeat(200)}`);
    expect(qp.split("\r\n").every((l) => l.length <= 76)).toBe(true);
    expect(qp).toContain("Gepr=FCft");
    expect(kopf("Neuer Lead")).toBe("Neuer Lead");
  });
});
