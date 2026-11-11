import { describe, expect, it } from "vitest";
import { checkLoginInfoImage, DEFAULT_LOGIN_INFO, LOGIN_INFO_LIMITS, parseLoginInfoInput, safeLinkUrl } from "@/lib/login-info";

const base = { enabled: "1", badge: "Neu", title: "Release am 24.11.", text: "Zeile eins\nZeile zwei", linkText: "Mehr erfahren", linkUrl: "https://performancegrowth.de/news" };

describe("Infokarte Login-Seite: Eingaben prüfen", () => {
  it("gültige Eingabe wird übernommen (Ränder gekürzt, Zeilenumbruch im Text bleibt)", () => {
    const r = parseLoginInfoInput({ ...base, title: "  Release am 24.11.  " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ enabled: true, badge: "Neu", title: "Release am 24.11.", text: "Zeile eins\nZeile zwei", linkText: "Mehr erfahren", linkUrl: "https://performancegrowth.de/news" });
  });

  it("Schalter aus, leere optionale Felder werden null", () => {
    const r = parseLoginInfoInput({ title: "Nur Überschrift", badge: " ", text: "", linkText: "", linkUrl: "" });
    expect(r).toEqual({ ok: true, value: { enabled: false, badge: null, title: "Nur Überschrift", text: null, linkText: null, linkUrl: null } });
  });

  it("Überschrift fehlt oder zu lang", () => {
    expect(parseLoginInfoInput({ ...base, title: "" }).ok).toBe(false);
    const long = parseLoginInfoInput({ ...base, title: "x".repeat(LOGIN_INFO_LIMITS.title + 1) });
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.errors[0]).toMatch(/höchstens 80/);
  });

  it("Längenlimits für Etikett, Text und Link-Text", () => {
    for (const [field, n] of [["badge", LOGIN_INFO_LIMITS.badge], ["text", LOGIN_INFO_LIMITS.text], ["linkText", LOGIN_INFO_LIMITS.linkText]] as const) {
      expect(parseLoginInfoInput({ ...base, [field]: "y".repeat(n) }).ok).toBe(true);
      expect(parseLoginInfoInput({ ...base, [field]: "y".repeat(n + 1) }).ok).toBe(false);
    }
  });

  it("Link nur http(s) oder interner Pfad, nie javascript:/data:/protokollrelativ", () => {
    expect(safeLinkUrl("https://a.de/x")).toBe("https://a.de/x");
    expect(safeLinkUrl("http://a.de")).toBe("http://a.de/");
    expect(safeLinkUrl("/rechner")).toBe("/rechner");
    expect(safeLinkUrl("//evil.example")).toBeNull();
    expect(safeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(safeLinkUrl("data:text/html,x")).toBeNull();
    expect(safeLinkUrl("www.a.de")).toBeNull();
    const bad = parseLoginInfoInput({ ...base, linkUrl: "javascript:alert(1)" });
    expect(bad.ok).toBe(false);
  });

  it("Link und Link-Text nur gemeinsam", () => {
    expect(parseLoginInfoInput({ ...base, linkText: "" }).ok).toBe(false);
    expect(parseLoginInfoInput({ ...base, linkUrl: "" }).ok).toBe(false);
  });

  it("Standard-Karte ist ohne Bild und ohne Zahlen", () => {
    expect(DEFAULT_LOGIN_INFO.enabled).toBe(true);
    expect(DEFAULT_LOGIN_INFO.hasImage).toBe(false);
    expect(DEFAULT_LOGIN_INFO.title.length).toBeLessThanOrEqual(LOGIN_INFO_LIMITS.title);
    expect(DEFAULT_LOGIN_INFO.text!.length).toBeLessThanOrEqual(LOGIN_INFO_LIMITS.text);
  });
});

describe("Infokarte Login-Seite: Bild prüfen", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

  it("PNG, JPEG und WebP anhand der Datei-Signatur (Typ aus dem Browser zählt nicht)", () => {
    expect(checkLoginInfoImage(png, "image/png")).toEqual({ ok: true, type: "image/png" });
    expect(checkLoginInfoImage(jpg, "application/octet-stream")).toEqual({ ok: true, type: "image/jpeg" });
    expect(checkLoginInfoImage(webp, "image/webp")).toEqual({ ok: true, type: "image/webp" });
  });

  it("SVG/HTML, leere und zu große Dateien werden abgelehnt", () => {
    expect(checkLoginInfoImage(new TextEncoder().encode("<svg onload=alert(1)>"), "image/png").ok).toBe(false);
    expect(checkLoginInfoImage(new Uint8Array(), "image/png").ok).toBe(false);
    const big = new Uint8Array(LOGIN_INFO_LIMITS.imageBytes + 1);
    big.set(png);
    expect(checkLoginInfoImage(big, "image/png").ok).toBe(false);
  });
});
