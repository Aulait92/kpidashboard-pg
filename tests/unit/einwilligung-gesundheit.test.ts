// Einwilligung im Meta-Leadformular, Gesundheitsangaben (Art. 9 DSGVO / § 203 StGB) und Erstinformation.
import { describe, expect, it } from "vitest";
import {
  CONSENT_CHECKBOX_KEY,
  CONSENT_VERSION,
  consentLabel,
  consentMissing,
  consentStateOf,
  leadFormConsentText,
  parseDisclaimerResponses,
  whatsappErlaubt,
} from "@/lib/einwilligung-leadformular";
import { isHealthAnswer, isHealthLabel, splitHealthAnswers } from "@/lib/gesundheitsdaten";
import { erstinfoDaten, erstinfoFehlt, statusFromImpressum, isPdf, normalizeErstinfoUrl, normalizeRegisterNummer, statusRegisterText, vermittlerStatusLabel } from "@/lib/erstinformation-shared";
import { fromFlatPayload, fromMetaLead } from "@/lib/lead-intake";
import { leadFormPayload } from "@/lib/kampagnen/builder";

describe("Einwilligungstext im Leadformular", () => {
  const angaben = { vermittler: "Agentur Meier", anschrift: "Hauptstr. 1\n12345 Berlin", email: "info@meier.de", datenschutzUrl: "https://meier.de/datenschutz" };
  it("Wortlaut mit Vermittler, Anschrift, KI-Assistent, STOPP, E-Mail und Datenschutz", () => {
    expect(leadFormConsentText(angaben)).toBe(
      "Ihr Angebot und Ihren Termin erhalten Sie per WhatsApp, E-Mail oder Telefon. Mit Klick auf „Senden“ willigen Sie ein, dass Agentur Meier, Hauptstr. 1, 12345 Berlin, Sie auf diesen Wegen zu dieser Anfrage kontaktiert. Die Erstinformation nach § 15 VersVermV bekommen Sie elektronisch als Link und PDF, auf Wunsch auf Papier. Widerruf jederzeit mit „STOPP“ oder per E-Mail an info@meier.de. Datenschutz: https://meier.de/datenschutz",
    );
    // Einwilligung per Knopf statt Häkchen (Ole, 22.11.2026: „Immer ohne Checkbox“), Erstinformation mit Papier
    expect(CONSENT_VERSION).toBe("2026-11-22b-knopf");
    expect(leadFormConsentText(angaben)).not.toMatch(/[–—]/);
    expect(consentMissing(angaben)).toEqual([]);
  });
  it("fehlende Angaben als Platzhalter und Liste", () => {
    const t = leadFormConsentText({ vermittler: "Agentur Meier", anschrift: null, email: null, datenschutzUrl: null });
    expect(t).toContain("[Anschrift]");
    expect(t).toContain("[E-Mail-Adresse]");
    expect(consentMissing({ vermittler: "Agentur Meier", anschrift: null, email: null, datenschutzUrl: null })).toEqual(["Anschrift", "E-Mail-Adresse für den Widerruf", "Link zur Datenschutzerklärung"]);
  });
  it("Formular der Kampagnen-Agenten: fester Wortlaut über „Senden“, ohne Häkchen (Ole, 22.11.2026)", () => {
    const text = leadFormConsentText(angaben);
    const p = leadFormPayload(
      { formName: "F", introTitle: "T", introParagraphs: ["x"], questions: [], thankYouTitle: "Danke", thankYouBody: "x", consentText: text },
      { privacyUrl: "https://meier.de/datenschutz", website: null, advisorName: "Meier", bookingUrl: null },
    ) as { custom_disclaimer: { title: string; body: { text: string }; checkboxes?: unknown } };
    expect(p.custom_disclaimer.body.text).toBe(text);
    expect(p.custom_disclaimer.title).toBe("Letzter Schritt: Tippen Sie unten auf „Senden“");
    expect(p.custom_disclaimer.checkboxes).toBeUndefined();
  });
});

describe("Antworten auf das Häkchen (custom_disclaimer_responses)", () => {
  it("Graph-Format, Zapier-Text und fehlende Antworten", () => {
    expect(parseDisclaimerResponses([{ checkbox_key: "einwilligung_kontakt", is_checked: "1" }])).toEqual([{ key: "einwilligung_kontakt", checked: true }]);
    expect(parseDisclaimerResponses('[{"checkbox_key":"einwilligung_kontakt","is_checked":""}]')).toEqual([{ key: "einwilligung_kontakt", checked: false }]);
    expect(parseDisclaimerResponses({ data: [{ checkbox_key: "x", is_checked: true }] })).toEqual([{ key: "x", checked: true }]);
    expect(parseDisclaimerResponses(undefined)).toBeNull();
    expect(parseDisclaimerResponses([])).toBeNull();
    expect(parseDisclaimerResponses("kein json")).toBeNull();
  });
  it("ja / nein / unbekannt; nur ein fehlendes Häkchen sperrt WhatsApp", () => {
    expect(consentStateOf([{ key: CONSENT_CHECKBOX_KEY, checked: true }])).toBe("ja");
    expect(consentStateOf([{ key: CONSENT_CHECKBOX_KEY, checked: false }, { key: "andere", checked: true }])).toBe("nein");
    expect(consentStateOf([{ key: "fremd", checked: true }])).toBe("ja");
    expect(consentStateOf([{ key: "fremd", checked: false }])).toBe("nein");
    expect(consentStateOf(null)).toBeNull();
    expect(whatsappErlaubt("ja")).toBe(true);
    expect(whatsappErlaubt(null)).toBe(true);
    expect(whatsappErlaubt("nein")).toBe(false);
    expect(consentLabel("nein").tone).toBe("warn");
    expect(consentLabel(null).text).toContain("ohne Einwilligungs-Häkchen");
  });
  it("Meta-Lead und Zapier: Antworten landen am eingehenden Lead", () => {
    const meta = fromMetaLead(
      { id: "l1", created_time: "2026-11-15T10:00:00Z", form_id: "f1", field_data: [{ name: "full_name", values: ["Julia Schneider"] }], custom_disclaimer_responses: [{ checkbox_key: "einwilligung_kontakt", is_checked: "1" }] },
      "p1",
    );
    expect(meta.disclaimer).toEqual([{ key: "einwilligung_kontakt", checked: true }]);
    expect(meta.fields).not.toHaveProperty("custom_disclaimer_responses");
    const flat = fromFlatPayload({ leadgen_id: "l2", form_id: "f1", full_name: "Max", custom_disclaimer_responses: [{ checkbox_key: "einwilligung_kontakt", is_checked: "0" }] });
    expect(flat.disclaimer).toEqual([{ key: "einwilligung_kontakt", checked: false }]);
  });
});

describe("Gesundheitsangaben", () => {
  it("erkennt Fragen und eindeutige Antworten, Tierangaben bleiben", () => {
    for (const label of ["Vorerkrankungen", "Haben Sie Vorerkrankungen?", "Laufende Behandlung beim Zahnarzt?", "Fehlende Zähne", "BMI", "Größe und Gewicht", "Rauchen Sie? (Raucher)", "Diagnosen der letzten 5 Jahre", "Gesundheitsfragen", "Nehmen Sie Medikamente?", "Psychotherapie in den letzten 10 Jahren?"]) {
      expect(isHealthLabel(label), label).toBe(true);
    }
    for (const label of ["Versicherungsinteresse", "Aktuelle Krankenversicherung", "Gesetzlich oder privat?", "Geburtsdatum", "Vorerkrankungen (Tier)", "Gewicht Hund", "Rasse (Tier)", "Beruf", "Wie viele Personen?"]) {
      expect(isHealthLabel(label), label).toBe(false);
    }
    expect(isHealthAnswer({ label: "Anmerkungen", value: "Ich habe Diabetes Typ 2" })).toBe(true);
    expect(isHealthAnswer({ label: "Anmerkungen", value: "Bitte abends anrufen" })).toBe(false);
    expect(isHealthAnswer({ label: "Interesse", value: "Zahnersatz, Prophylaxe" })).toBe(false);
  });
  it("teilt Formularangaben: nur unbedenkliche gehen an den Assistenten", () => {
    const { normal, health } = splitHealthAnswers([
      { label: "Versicherungsinteresse", value: "Zahnzusatz" },
      { label: "Fehlende Zähne", value: "2" },
      { label: "Laufende Behandlung", value: "Ja" },
    ]);
    expect(normal.map((a) => a.label)).toEqual(["Versicherungsinteresse"]);
    expect(health.map((a) => a.label)).toEqual(["Fehlende Zähne", "Laufende Behandlung"]);
  });
});

describe("Erstinformation: Status, Registernummer, Link", () => {
  it("Registernummer im Format D-XXXX-XXXXX-XX", () => {
    expect(normalizeRegisterNummer("D-1ABC-DEF12-34")).toBe("D-1ABC-DEF12-34");
    expect(normalizeRegisterNummer("d 1abc def12 34")).toBe("D-1ABC-DEF12-34");
    expect(normalizeRegisterNummer("D1ABCDEF1234")).toBe("D-1ABC-DEF12-34");
    expect(normalizeRegisterNummer("D-1ABC-DEF12")).toBeNull();
    // älteres Format (Ole, 20.11.2026: Allianz-Vertreter Lohmann)
    expect(normalizeRegisterNummer("D-W-151-ALAP-38")).toBe("D-W-151-ALAP-38");
    expect(normalizeRegisterNummer("d w 151 alap 38")).toBe("D-W-151-ALAP-38");
    expect(normalizeRegisterNummer("D-W-15-ALAP-38")).toBeNull();
    expect(normalizeRegisterNummer("12345")).toBeNull();
    expect(normalizeRegisterNummer("")).toBeNull();
  });
  it("Link, PDF-Erkennung, Status-Texte, was fehlt", () => {
    expect(normalizeErstinfoUrl("meier.de/erstinfo")).toBe("https://meier.de/erstinfo");
    expect(normalizeErstinfoUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeErstinfoUrl("http://localhost/x")).toBeNull();
    expect(isPdf(new TextEncoder().encode("%PDF-1.7 ..."))).toBe(true);
    expect(isPdf(new TextEncoder().encode("<html>"))).toBe(false);
    expect(vermittlerStatusLabel("mehrfachvertreter")).toBe("Mehrfachvertreter");
    expect(vermittlerStatusLabel("vertreter")).toBe("Ausschließlichkeitsvertreter");
    expect(vermittlerStatusLabel("irgendwas")).toBe("Ausschließlichkeitsvertreter");
    expect(statusRegisterText("makler")).toContain("§ 34d Abs. 1 GewO");
    // Vollständige Pflichtangaben (§ 15 VersVermV) und Prüfung: tests/unit/erstinformation.test.ts
    const leer = erstinfoDaten(null, null, { name: "X", vermittlerTyp: "makler" });
    expect(erstinfoFehlt(leer, { upload: true, bestaetigt: true })).toEqual(["Registernummer"]);
    expect(statusFromImpressum("Gebundener Versicherungsvertreter nach § 34d Abs. 7 GewO")).toBe("vertreter");
    expect(statusFromImpressum("Versicherungsmakler mit Erlaubnis nach § 34d Abs. 1 GewO")).toBe("makler");
    expect(statusFromImpressum("Mehrfachvertreter")).toBe("mehrfachvertreter");
    expect(statusFromImpressum("Versicherungsvertreter")).toBeNull();
  });
});
