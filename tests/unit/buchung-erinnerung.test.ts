// Splittest buchung_erinnerung (A/B-Test-Labor 20.11.2026): Häkchen „Erinnerung zur Terminvorbereitung“ auf /book.
// Pflichtangaben in beiden Fassungen (Zweck, WhatsApp, Abmeldung STOP), keine Gedankenstriche, Nachweis je Fassung.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EXPERIMENTE } from "@/lib/experimente";
import { SPLITTEST_HYPOTHESE } from "@/lib/ab-hypothesen";
import { erinnerungOptin } from "@/lib/policen/regeln";

const GEDANKENSTRICH = /[–—]/;

describe("buchung_erinnerung", () => {
  it("ist eingetragen, mit Hypothese, Ziel Häkchen und Mindestmenge 150", () => {
    const d = EXPERIMENTE.buchung_erinnerung;
    expect(d.ziel).toBe("erinnerung_optin");
    expect(d.min).toBe(150);
    expect(SPLITTEST_HYPOTHESE.buchung_erinnerung).toMatch(/Karte/);
  });

  it("Standard (Ole 20.11.2026): Nutzen fett, (empfohlen), Du und Sie, alle Pflichtangaben, ohne Gedankenstriche", () => {
    const sie = erinnerungOptin("a", "sie");
    const du = erinnerungOptin("a", "du");
    expect(sie.fett).toBe("Damit in Ihrem Termin nichts fehlt:");
    expect(du.fett).toBe("Damit in deinem Termin nichts fehlt:");
    expect(sie.text).toBe("Damit in Ihrem Termin nichts fehlt: Ja, bitte per WhatsApp an meine Unterlagen erinnern (empfohlen). Abmelden jederzeit mit STOP.");
    for (const t of [sie, du, erinnerungOptin("b", "sie")]) {
      expect(t.text).toContain("WhatsApp");
      expect(t.text).toContain("Unterlagen");
      expect(t.text).toContain("STOP");
      expect(t.text).not.toMatch(GEDANKENSTRICH);
      expect(t.text).not.toMatch(/garantie|versprech/i);
    }
  });

  it("B hat denselben Wortlaut, der Nachweis unterscheidet Fassung und Ansprache", () => {
    expect(erinnerungOptin("b", "sie").text).toBe(erinnerungOptin("a", "sie").text);
    const v = new Set([erinnerungOptin("a", "sie").version, erinnerungOptin("a", "du").version, erinnerungOptin("b", "sie").version, erinnerungOptin("b", "du").version]);
    expect(v.size).toBe(4);
  });

  it("Häkchen ist nie vorausgewählt und nur bei Lead-Buchung sichtbar (ohne Vorbelegung bzw. Buchungslink aus dem Chat)", () => {
    const page = readFileSync("src/app/book/[slug]/page.tsx", "utf8");
    const box = page.match(/<input type="checkbox" name="erinnerung"[^>]*>/)?.[0] ?? "";
    expect(box).not.toMatch(/defaultChecked|checked/);
    // Buchungslink aus dem WhatsApp-Chat (chatT, lib/whatsapp/buchungslink.ts): der Lead bucht selbst, Häkchen wie ohne Vorbelegung
    expect(page).toContain("const erinnerungAufruf = prefill && !chatT ? null : randomUUID();");
    const actions = readFileSync("src/app/book/[slug]/actions.ts", "utf8");
    expect(actions).toContain('const erinnerung = !!erinnerungAufruf && formData.get("erinnerung") === "on";');
  });
});
