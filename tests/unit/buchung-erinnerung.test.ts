// Splittest buchung_erinnerung (A/B-Test-Labor 20.11.2026): Häkchen „Erinnerung zur Terminvorbereitung“ auf /book.
// Pflichtangaben in beiden Fassungen (Zweck, WhatsApp, Abmeldung STOP), keine Gedankenstriche, Nachweis je Fassung.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EXPERIMENTE } from "@/lib/experimente";
import { SPLITTEST_HYPOTHESE } from "@/lib/ab-hypothesen";
import { ERINNERUNG_OPTIN_TEXT, ERINNERUNG_OPTIN_VERSION, erinnerungOptin } from "@/lib/policen/regeln";

const GEDANKENSTRICH = /[–—]/;

describe("buchung_erinnerung", () => {
  it("ist eingetragen, mit Hypothese, Ziel Häkchen und Mindestmenge 150", () => {
    const d = EXPERIMENTE.buchung_erinnerung;
    expect(d.ziel).toBe("erinnerung_optin");
    expect(d.min).toBe(150);
    expect(SPLITTEST_HYPOTHESE.buchung_erinnerung).toMatch(/Nutzen/);
  });

  it("Fassung A bleibt der bisherige Wortlaut und Textstand", () => {
    expect(erinnerungOptin("a", "sie")).toEqual({ text: ERINNERUNG_OPTIN_TEXT, version: ERINNERUNG_OPTIN_VERSION });
    expect(erinnerungOptin("a", "du").text).toBe(ERINNERUNG_OPTIN_TEXT);
  });

  it("Fassung B: Nutzen zuerst, kürzer, Du und Sie, alle Pflichtangaben, ohne Gedankenstriche", () => {
    const sie = erinnerungOptin("b", "sie");
    const du = erinnerungOptin("b", "du");
    expect(sie.text.startsWith("Damit in Ihrem Termin nichts fehlt:")).toBe(true);
    expect(du.text.startsWith("Damit in deinem Termin nichts fehlt:")).toBe(true);
    for (const t of [sie, du]) {
      expect(t.text).toContain("WhatsApp");
      expect(t.text).toContain("Unterlagen");
      expect(t.text).toContain("STOP");
      expect(t.text).not.toMatch(GEDANKENSTRICH);
      expect(t.text).not.toMatch(/garantie|sicher|versprech/i);
      expect(t.text.length).toBeLessThan(ERINNERUNG_OPTIN_TEXT.length);
    }
    // Nachweis unterscheidet Fassung und Ansprache
    expect(sie.version).not.toBe(du.version);
    expect(sie.version).not.toBe(ERINNERUNG_OPTIN_VERSION);
  });

  it("Häkchen ist nie vorausgewählt und nur bei Lead-Buchung ohne Vorbelegung sichtbar", () => {
    const page = readFileSync("src/app/book/[slug]/page.tsx", "utf8");
    const box = page.match(/<input type="checkbox" name="erinnerung"[^>]*>/)?.[0] ?? "";
    expect(box).not.toMatch(/defaultChecked|checked/);
    expect(page).toContain("const erinnerungAufruf = prefill ? null : randomUUID();");
    const actions = readFileSync("src/app/book/[slug]/actions.ts", "utf8");
    expect(actions).toContain('const erinnerung = !!erinnerungAufruf && formData.get("erinnerung") === "on";');
  });
});
