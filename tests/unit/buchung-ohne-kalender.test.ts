// Buchungsseite ohne Kalender bzw. ohne freie Zeiten (Usability-Check 18.11.2026): Rückruf per E-Mail oder Anrufen.
import { describe, expect, it } from "vitest";
import { kontaktWege } from "@/lib/buchung-ohne-kalender";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

describe("Buchungsseite ohne Kalender", () => {
  it("Rückruf per E-Mail zuerst, dann Anrufen; Text in der Ansprache des Vermittlers", () => {
    const r = kontaktWege({ email: "max@berger.de", telefon: "0151 / 234 567 89" }, "sie");
    expect(r.wege.map((w) => w.art)).toEqual(["rueckruf", "anrufen"]);
    expect(r.wege[0].href).toMatch(/^mailto:max@berger\.de\?subject=Bitte%20um%20R%C3%BCckruf/);
    expect(r.wege[1].href).toBe("tel:015123456789");
    expect(r.text).toBe("Fragen Sie gern einen Rückruf an oder rufen Sie direkt an, dann finden wir einen Termin.");
    expect(kontaktWege({ email: "max@berger.de", telefon: null }, "du").text).toBe("Frag gern einen Rückruf an, dann finden wir einen Termin.");
    expect(kontaktWege({ email: null, telefon: "+49 151 2345678" }, "sie").wege.map((w) => w.art)).toEqual(["anrufen"]);
  });

  it("ohne Kontaktdaten kein Knopf, nur der Satz; keine Gedankenstriche", () => {
    const r = kontaktWege({ email: "kaputt", telefon: "12" }, "sie");
    expect(r.wege).toEqual([]);
    expect(r.text).toContain("Wir melden uns in Kürze bei Ihnen");
    for (const an of ["du", "sie"] as const)
      for (const k of [{ email: "a@b.de", telefon: "0151234567" }, { email: null, telefon: null }]) {
        const x = kontaktWege(k, an);
        expect(hatGedankenstrich(x.text + x.wege.map((w) => decodeURIComponent(w.href) + w.label).join(""))).toBe(false);
      }
  });
});
