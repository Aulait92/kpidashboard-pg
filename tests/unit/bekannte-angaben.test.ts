// Ole, 17.11.2026: Der Assistent fragt nicht erneut, was das Leadformular schon beantwortet, und der Testlead
// bringt Formularangaben wie ein echter Lead des Produkts mit.
import { describe, expect, it } from "vitest";
import { bekannteAntworten, ersteFrage, ersteFrageRegel, erstanschreibenText, outreachProdukt } from "@/lib/whatsapp/erstanschreiben";
import { testLeadAnswers } from "@/lib/testlead";
import { isHealthAnswer } from "@/lib/gesundheitsdaten";
import { buildSystemPrompt } from "@/lib/whatsapp/bot";
import { produktCheckliste } from "@/lib/whatsapp/produkt-fragen";
import { abschnitte } from "@/lib/termin-vorbereitung";

const labels = (p: string) => testLeadAnswers(p).map((a) => a.label);

describe("Testlead: Formularangaben je Produkt", () => {
  it("Katze und Hund: Felder des Tier-Funnels", () => {
    for (const p of ["TKV-Katze", "Hundekrankenversicherung"]) {
      expect(labels(p)).toEqual(expect.arrayContaining(["Tierart", "Rasse (Tier)", "Geburtsjahr (Tier)", "Geschlecht (Tier)", "Kastriert (Tier)", "Haltung (Tier)"]));
    }
    expect(testLeadAnswers("TKV-Katze")).toContainEqual({ label: "Tierart", value: "Katze" });
    expect(testLeadAnswers("Hundekrankenversicherung")).toContainEqual({ label: "Tierart", value: "Hund" });
  });

  it("PKV: Beitrag, Versicherung, Situation, Geburtsdatum, wie lange in PKV", () => {
    expect(labels("PKV Wechsel")).toEqual(expect.arrayContaining(["Monatlicher Beitrag", "Aktuelle Versicherung", "Situation", "Geburtsdatum", "Wie lange in PKV?"]));
  });

  it("Privatschutz: Lebenssituation und Versicherungsinteresse", () => {
    expect(labels("Privatschutz")).toEqual(expect.arrayContaining(["Lebenssituation", "Versicherungsinteresse"]));
  });

  it("Zahnzusatz ohne Gesundheitsangaben (Art. 9 DSGVO)", () => {
    const a = testLeadAnswers("Zahnzusatz");
    expect(a.some((x) => /zähne|zahnersatz|befund/i.test(`${x.label} ${x.value}`))).toBe(false);
    expect(a.some(isHealthAnswer)).toBe(false);
  });
});

describe("Bekannte Antworten aus dem Formular", () => {
  it("PKV-Funnel beantwortet Frage 1 und 2, Katze nur Frage 1, Zahn keine", () => {
    expect(bekannteAntworten(outreachProdukt("PKV Wechsel"), testLeadAnswers("PKV Wechsel"))).toEqual({ frage1: "Situation: Angestellt", frage2: "Gesetzlich oder privat?: Privat" });
    expect(bekannteAntworten(outreachProdukt("TKV-Katze"), testLeadAnswers("TKV-Katze"))).toEqual({ frage1: "Geburtsjahr (Tier): 2022", frage2: null });
    expect(bekannteAntworten(outreachProdukt("Zahnzusatz"), testLeadAnswers("Zahnzusatz"))).toEqual({ frage1: null, frage2: null });
    expect(bekannteAntworten(outreachProdukt("TKV-Katze"), [])).toEqual({ frage1: null, frage2: null });
  });

  it("Freitext-Erstanschreiben fragt die erste offene Frage, sonst nach dem Videotermin", () => {
    expect(ersteFrage("TKV-Katze", "sie", "Ole", testLeadAnswers("TKV-Katze"))).toBe("Soll vor allem eine Operation abgesichert sein, oder auch die normale Tierarztbehandlung?");
    expect(ersteFrage("PKV Wechsel", "du", "Ole", testLeadAnswers("PKV Wechsel"))).toBe("Passt dir ein kurzer Videotermin mit Ole in den nächsten Tagen?");
    // v8 (Ole, 17.11.2026): Privatschutz öffnet mit „schon versichert?“ (je nach Interesse)
    expect(ersteFrage("Privatschutz", "sie", "Ole", [{ label: "Versicherungsinteresse", value: "Hausrat" }])).toBe("Sind Sie bei Hausrat schon versichert, oder wäre es neu?");
    expect(ersteFrage("Privatschutz", "sie", "Ole", testLeadAnswers("Privatschutz"))).toBe("Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu?");
    // ohne Formular wie bisher
    expect(ersteFrage("TKV-Katze", "sie", "Ole")).toBe("Wie alt ist Ihre Katze?");
    const t = erstanschreibenText({ an: "du", name: "Ole", source: "Privatschutz", formular: testLeadAnswers("Privatschutz") });
    // v9: Frage fett am Ende der ersten Zeile, darunter die KI-Kennzeichnung des Freitexts
    expect(t.split("\n")[0].endsWith(" *Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu?*")).toBe(true);
    expect(t.split("\n").at(-1)).toBe("_KI-Assistent · Erstinformation folgt als PDF_");
    expect(t).not.toMatch(/\b(Sie|Ihnen|Ihre?)\b/);
  });

  it("Assistent: bekannte Frage 2 nicht stellen, direkt Termine", () => {
    const vorlage = "Hallo Herr Müller, danke für Ihre Anfrage zur privaten Krankenversicherung!\n…\n\n*Wie sind Sie aktuell beruflich aufgestellt?*";
    const r = ersteFrageRegel("PKV Wechsel", "Ole", { gesendet: vorlage, an: "sie", formular: testLeadAnswers("PKV Wechsel") });
    expect(r).toMatch(/Aus dem Leadformular schon beantwortet \(nicht fragen\): Situation: Angestellt; Gesetzlich oder privat\?: Privat/);
    expect(r).toMatch(/Weitere Fragen vor dem Termin gibt es nicht/);
    // ohne Formular: danach noch Frage 2
    expect(ersteFrageRegel("PKV Wechsel", "Ole", { gesendet: vorlage, an: "sie" })).toMatch(/Danach noch genau diese Frage: „Sind Sie aktuell gesetzlich/);
    // Freitext hat schon Frage 2 gestellt: danach Termine
    const frei = erstanschreibenText({ an: "sie", name: "Ole", source: "TKV-Katze", formular: testLeadAnswers("TKV-Katze") });
    expect(ersteFrageRegel("TKV-Katze", "Ole", { gesendet: frei, an: "sie", formular: testLeadAnswers("TKV-Katze") })).toMatch(/Operation[\s\S]*mach sofort den Terminvorschlag/);
    // Lead schreibt zuerst: erste offene Frage, fett am Ende
    expect(ersteFrageRegel("TKV-Katze", "Ole", { jetzt: true, an: "du", formular: testLeadAnswers("TKV-Katze") })).toMatch(/\(ohne Sternchen, nicht fett\): Soll vor allem eine Operation/);
  });

  it("E-Mail aus dem Formular steht als bekannt im Prompt", () => {
    const s = buildSystemPrompt({ systemPrompt: "", knowledge: "", personality: "" }, "TKV-Katze", {
      qualified: false,
      summary: null,
      contact: { name: "Jule Sommer", phone: "4915100000000", email: "jule@example.com" },
      upcoming: null,
      formAnswers: testLeadAnswers("TKV-Katze"),
      advisorName: "Ole Sommer",
      aiDisclosed: true,
    });
    expect(s).toMatch(/E-Mail: jule@example.com \(bekannt: NICHT erfragen/);
    expect(s).toMatch(/Rasse \(Tier\): Europäisch Kurzhaar/);
  });
});

describe("Hund wie Katze (Tierkrankenversicherung)", () => {
  it("Hundekrankenversicherung bekommt die Tier-Checkliste, Halterhaftpflicht und Futter nicht", () => {
    expect(produktCheckliste("Hundekrankenversicherung")?.key).toBe("tier");
    expect(produktCheckliste("Hunde-OP-Versicherung")?.key).toBe("tier");
    expect(produktCheckliste("Hundehalterhaftpflicht")).toBeNull();
    expect(produktCheckliste("Hundefutter")).toBeNull();
  });

  it("Terminvorbereitung zeigt beim Hund die Felder des Tier-Rechners aus dem Formular", () => {
    const ab = abschnitte({
      lead: { name: "Jule Sommer", telefon: null, email: null, adresse: null, produkt: "Hundekrankenversicherung" },
      termin: { startsAt: new Date(), mode: "video", berater: "Ole", meetUrl: null },
      zusammenfassung: null,
      formular: testLeadAnswers("Hundekrankenversicherung"),
      angaben: { tarifwunsch: "volle Krankenversicherung" },
      vorbereitetAm: null,
    });
    const felder = Object.fromEntries(ab.flatMap((s) => s.felder).map((f) => [f.label, f.wert]));
    expect(felder).toMatchObject({ Tierart: "Hund", Rasse: "Labrador Retriever", "Geburtsmonat / -jahr": "Juni 2021", "Gewünschter Schutz (OP oder voll)": "volle Krankenversicherung" });
  });
});

describe("Lead hat zuerst geschrieben", () => {
  it("erkennt die erste Frage in unserer eigenen Antwort (Frageplan gilt weiter)", async () => {
    const { enthaeltErsteFrage } = await import("@/lib/whatsapp/erstanschreiben");
    expect(enthaeltErsteFrage("Hallo Jule, danke …\n\n*Welcher Tarifbaustein ist dir am wichtigsten?*", "Zahnzusatz")).toBe(true);
    expect(enthaeltErsteFrage("*Soll vor allem eine Operation abgesichert sein, oder auch die normale Tierarztbehandlung?*", "TKV-Katze")).toBe(true);
    expect(enthaeltErsteFrage("Danke, ich melde mich.", "Zahnzusatz")).toBe(false);
    expect(enthaeltErsteFrage("*Welcher Tarifbaustein ist dir am wichtigsten?*", "Bestandskunde")).toBe(false);
  });
});

describe("Adresse aus dem Leadformular", () => {
  it("Postleitzahl und Ort aus formData, Korrektur und Airtable gehen vor", async () => {
    const { currentStammdaten } = await import("@/lib/lead-stammdaten");
    const lead = { name: "Jule Sommer", phone: null, email: null, formData: testLeadAnswers("TKV-Katze"), contactOverrides: null };
    expect(currentStammdaten(lead)).toMatchObject({ zip: "80331", city: "München", street: "" });
    expect(currentStammdaten({ ...lead, contactOverrides: { zip: "10115" } }).zip).toBe("10115");
    expect(currentStammdaten(lead, { Postleitzahl: "20095", Ort: "Hamburg" })).toMatchObject({ zip: "20095", city: "Hamburg" });
    // Meta-Standardfelder (post_code, city, street_address → „Post code“, „City“, „Street address“)
    const meta = [{ label: "Post code", value: "50667" }, { label: "City", value: "Köln" }, { label: "Street address", value: "Domkloster 4" }];
    expect(currentStammdaten({ ...lead, formData: meta })).toMatchObject({ zip: "50667", city: "Köln", street: "Domkloster 4" });
  });
});
