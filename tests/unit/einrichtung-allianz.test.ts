// Einrichtung nach der echten Einrichtung eines Allianz-Vertreters (Ole, 20.11.2026): Angaben einmal am Anfang,
// Kalender für Allianz-Vertreter über die Vertreternummer, Erstinformation zeigt Bekanntes nur noch an.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";


vi.mock("@/app/buyer/einrichtung/actions", () => { const leer = async () => ({}); return { saveErstinfoAction: leer, saveQuestionnaireAction: leer, bookHelpCallAction: leer, checkMetaAccessAction: leer, confirmConsentAction: leer, confirmMetaAccessAction: leer, saveImpressumUrlAction: leer, saveDatenschutzUrlAction: leer, skipSetupStepAction: leer }; });

import { angabenBekannt, erstinfoDaten, pruefeAngaben } from "@/lib/erstinformation-shared";
import { istAllianzVertreter } from "@/lib/vertreter-seite";
import { ErstinfoForm } from "@/app/buyer/einrichtung/erstinfo-form";
import { QuestionnaireForm } from "@/app/buyer/einrichtung/forms";
import { AllianzForm } from "@/components/calendar-sources";

const gut = { anrede: "Herr", name: "Max  Lohmann", telefon: "0171 1234567", anschrift: "Hauptstr. 1, 12345 Musterstadt", registerNummer: "d-w-151-alap-38" };

describe("Ihre Angaben prüfen", () => {
  it("beide Formate der Registernummer, Name bereinigt", () => {
    const r = pruefeAngaben(gut);
    expect(r).toEqual({ ok: true, angaben: { ...gut, name: "Max Lohmann", registerNummer: "D-W-151-ALAP-38" } });
    const neu = pruefeAngaben({ ...gut, registerNummer: "D-1ABC-DEFGH-12" });
    expect(neu.ok && neu.angaben.registerNummer).toBe("D-1ABC-DEFGH-12");
  });

  it("verständliche Fehler ohne Gedankenstriche", () => {
    const fehler = [
      pruefeAngaben({ ...gut, anrede: "" }),
      pruefeAngaben({ ...gut, name: "Lohmann" }),
      pruefeAngaben({ ...gut, telefon: "12" }),
      pruefeAngaben({ ...gut, anschrift: " " }),
      pruefeAngaben({ ...gut, registerNummer: "12345" }),
    ];
    for (const f of fehler) {
      expect(f.ok).toBe(false);
      if (!f.ok) expect(f.error).not.toMatch(/[–—]/);
    }
  });

  it("bekannt erst, wenn alles da ist", () => {
    expect(angabenBekannt(gut)).toBe(true);
    expect(angabenBekannt({ ...gut, anrede: null })).toBe(false);
    expect(angabenBekannt({ ...gut, registerNummer: "x" })).toBe(false);
  });
});

describe("Allianz-Vertreter erkennen", () => {
  it("Versicherer, Name, Wahl, Vertreter-Seite oder verbundener Kalender", () => {
    expect(istAllianzVertreter({ vermittlerTyp: "vertreter", versicherer: ["Allianz Versicherungs-AG"] })).toBe(true);
    expect(istAllianzVertreter({ vermittlerTyp: "vertreter", kundenName: "Allianz Generalvertretung Lohmann" })).toBe(true);
    expect(istAllianzVertreter({ vermittlerTyp: "vertreter", gesellschaften: ["allianz"] })).toBe(true);
    expect(istAllianzVertreter({ vermittlerTyp: "vertreter", webseite: "vertretung.allianz.de/max.lohmann" })).toBe(true);
    expect(istAllianzVertreter({ vermittlerTyp: null, allianzVerbunden: true })).toBe(true);
    expect(istAllianzVertreter({ vermittlerTyp: "vertreter", versicherer: ["ERGO"], kundenName: "Agentur Meier" })).toBe(false);
  });

  it("nie für Makler und Mehrfachvertreter", () => {
    for (const typ of ["makler", "mehrfachvertreter"]) {
      expect(istAllianzVertreter({ vermittlerTyp: typ, versicherer: ["Allianz"], kundenName: "Allianz", allianzVerbunden: true })).toBe(false);
    }
  });
});

describe("Formulare", () => {
  it("Schritt 1: Angaben vorne, Webex nur bei Allianz, Ansprache und Termine eingeklappt", () => {
    const props = { software: true, initial: {}, readOnly: false, angaben: { ...gut, registerNummer: "D-W-151-ALAP-38" }, formate: { telefon: false, vorOrt: false } };
    const allianz = renderToStaticMarkup(createElement(QuestionnaireForm, { ...props, allianz: true, videoRoomUrl: null }));
    expect(allianz).toContain("data-ihre-angaben");
    expect(allianz).toContain('name="registerNummer"');
    expect(allianz).toContain('name="videoRoomUrl"');
    expect(allianz).toContain("Ansprache und Termine");
    expect(allianz).toContain("Sie · Video");
    expect(allianz).toContain("Speichern und weiter");
    expect(allianz).not.toMatch(/[–—]/);
    const andere = renderToStaticMarkup(createElement(QuestionnaireForm, { ...props, allianz: false }));
    expect(andere).not.toContain('name="videoRoomUrl"');
  });

  it("Erstinformation: bekannte Angaben nur angezeigt, Werte gehen unsichtbar mit", () => {
    const daten = erstinfoDaten(
      { name: "Max Lohmann", anschrift: "Hauptstr. 1, 12345 Musterstadt", telefon: "0171 1234567", registerNummer: "D-W-151-ALAP-38", versicherer: ["Allianz Versicherungs-AG"] },
      undefined,
      { name: "Allianz Lohmann", vermittlerTyp: "vertreter" },
    );
    const html = renderToStaticMarkup(
      createElement(ErstinfoForm, { initial: { status: "vertreter", registerNummer: "D-W-151-ALAP-38", fileName: null, daten, anrede: "Herr" }, readOnly: false }),
    );
    expect(html).toContain("data-erstinfo-bekannt");
    expect(html).toContain("Herr Max Lohmann");
    expect(html).toContain("ändern");
    expect(html).toContain('type="hidden" name="registerNummer" value="D-W-151-ALAP-38"');
    expect(html).not.toContain('id="anschrift"');
    // Pflichtangaben, die noch nicht abgefragt wurden, bleiben sichtbar
    expect(html).toContain('id="ihk"');
    expect(html).toContain('id="versicherer"');
  });

  it("Erstinformation ohne Anrede: wie bisher alle Felder", () => {
    const daten = erstinfoDaten({ name: "Max Lohmann" }, undefined, { name: "x", vermittlerTyp: "vertreter" });
    const html = renderToStaticMarkup(createElement(ErstinfoForm, { initial: { status: "vertreter", registerNummer: null, fileName: null, daten, anrede: null }, readOnly: false }));
    expect(html).not.toContain("data-erstinfo-bekannt");
    expect(html).toContain('id="anschrift"');
  });

  it("Vertreternummer: ein Satz, wo sie steht", () => {
    const html = renderToStaticMarkup(createElement(AllianzForm, { action: async () => ({}), readOnly: false }));
    expect(html).toContain("Ihre Allianz-Vertreternummer");
    expect(html).toContain("Termin vereinbaren");
    expect(html).toContain("vtnr=");
  });
});
