import { describe, expect, it } from "vitest";
import { dokumentArt, erkanntePolicen, kfzStand, texterkennungAn, unterlagenSparte } from "@/lib/policen/texterkennung";
import { bestaetigung } from "@/lib/policen/flow/texte";

const K = { an: "sie" as const, name: "Herr Kannapinn", pronomen: "er" as const, tag: "Montag", kfz: true, kiFertig: false, gesundheit: false };

describe("Texterkennung Kfz-Unterlagen (Ole, 22.11.2026)", () => {
  it("Dokumentart aus dem Text", () => {
    expect(dokumentArt("Zulassungsbescheinigung Teil I A M-AB 1234")).toEqual({ art: "fahrzeugschein", sparte: "kfz" });
    expect(dokumentArt("E Fahrzeug-Identifizierungsnummer WVW, B Datum der Erstzulassung 2019, P.1 Hubraum 1395")).toEqual({ art: "fahrzeugschein", sparte: "kfz" });
    expect(dokumentArt("HUK-COBURG Beitragsrechnung Kfz-Haftpflicht SF-Klasse 12")).toEqual({ art: "kfz_police", sparte: "kfz" });
    expect(dokumentArt("Ihre Hausratversicherung, Versicherungsschein Nr. 123")).toEqual({ art: "police", sparte: "hausrat" });
    expect(dokumentArt("Einkaufsliste Milch Brot Eier und noch mehr")).toBeNull();
    expect(dokumentArt("kurz")).toBeNull();
  });

  it("Sparte der Unterlage nur für eindeutige Sach-Sparten, Stand aus allen Unterlagen, Schalter", () => {
    expect(unterlagenSparte("kfz")).toBe("kfz");
    expect(unterlagenSparte("pkv")).toBeNull();
    expect(kfzStand(["fahrzeugschein", null, "kfz_police"])).toEqual({ schein: true, police: true });
    expect(kfzStand([null, "police"])).toEqual({ schein: false, police: false });
    expect(texterkennungAn({ POLICEN_TEXTERKENNUNG: "aus" })).toBe(false);
    expect(texterkennungAn({})).toBe(true);
  });

  it("Bestätigung nennt, was noch nicht erkannt ist", () => {
    expect(bestaetigung(K, 2, true, { schein: true, police: true }).text).toContain("*Fahrzeugschein und Rechnung sind dabei.* Herr Kannapinn rechnet Ihren Beitrag vor Montag. Bis dahin müssen Sie nichts weiter tun.");
    expect(bestaetigung(K, 1, true, { schein: false, police: false }).text).toContain("*Fahrzeugschein und letzte Rechnung Ihrer Kfz-Versicherung habe ich darin noch nicht erkannt.* Falls sie fehlen, laden Sie sie gern noch hoch");
    expect(bestaetigung(K, 1, true, { schein: false, police: true }).text).toContain("Die Rechnung ist da. *Ihren Fahrzeugschein habe ich noch nicht erkannt.*");
    expect(bestaetigung({ ...K, an: "du" }, 1, true, { schein: true, police: false }).text).toContain("Der Fahrzeugschein ist da. *Die letzte Rechnung deiner Kfz-Versicherung habe ich noch nicht erkannt.* Falls sie fehlt, lade sie gern noch hoch.");
    // Nicht geprüft (ohne KI): offene Nachfrage
    expect(bestaetigung(K, 1, true).text).toContain("*Sind Ihr Fahrzeugschein und die letzte Rechnung Ihrer Kfz-Versicherung beide dabei?*");
    // Keine Gedankenstriche
    for (const st of [null, { schein: false, police: false }, { schein: true, police: false }, { schein: false, police: true }, { schein: true, police: true }])
      expect(bestaetigung(K, 1, true, st).text).not.toMatch(/[–—]/);
  });

  it("Erkannte Policen für alle Leads: ohne Gesundheit, beim Kfz-Lead ohne Kfz, im Dank genannt", () => {
    expect(erkanntePolicen(["hausrat", "kranken", null, "haftpflicht", "sonstig", "hausrat"])).toEqual(["Haftpflicht", "Hausrat"]);
    expect(erkanntePolicen(["kfz", "hausrat"], { ohneKfz: true })).toEqual(["Hausrat"]);
    expect(erkanntePolicen(["kfz", "hausrat"])).toEqual(["Hausrat", "Kfz"]);
    const P = { ...K, kfz: false };
    expect(bestaetigung(P, 2, true, null, ["Haftpflicht", "Hausrat"]).text.startsWith("✅ Danke, *2 Dateien sind angekommen.* Erkannt: Haftpflicht und Hausrat.\n\n")).toBe(true);
    expect(bestaetigung(P, 1, true, null, []).text.startsWith("✅ Danke, *1 Datei ist angekommen.*\n\n")).toBe(true);
    expect(bestaetigung(K, 3, true, { schein: true, police: true }, ["Hausrat"]).text).toContain("Erkannt: Hausrat.\n\n*Fahrzeugschein und Rechnung sind dabei.*");
  });
});
