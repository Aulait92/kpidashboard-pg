// Ole, 17.11.2026 (Testchat): A) Erstnachricht kürzer (v8, seit 18.11.2026 v9), B) genau eine Zwischenfrage vor dem Terminvorschlag,
// C) Vermittler-Nennung „Herr/Frau Nachname“ beim Siezen.
import { describe, expect, it } from "vitest";
import { erstanschreibenText, erstanschreibenV8Params, erstanschreibenV9, erstanschreibenV9Params, frageplan, tierFuerErstanschreiben } from "@/lib/whatsapp/erstanschreiben";
import { buildTemplateRequest, exampleRestFor, exampleValuesFor, metaTemplateProblems, plannedTemplates, purposesFor, templateBodyFor, templateNamesOf } from "@/lib/whatsapp/template-plan";
import {
  ERSTINFO_FOOTER_V8,
  ERSTINFO_FOOTER_V9,
  ERSTINFO_FOOTER_V10,
  ERSTINFO_FOOTER_V12,
  erstinfoFooterFor,
  neuePlatzhalter,
  noticeText,
  OUTREACH_PURPOSES,
  PURPOSE_VERSION,
  rankOutreach,
  renderTemplate,
  templateTextFor,
  type NoticePurpose,
} from "@/lib/whatsapp/templates";
import {
  offeneZwischenfrage,
  schlichteAntwort,
  zwischenfrageText,
  zwischenHinweis,
  zwischenKnoepfe,
  zwischenSchritt,
  zwischenWert,
  ZWISCHENFRAGEN,
  type VerlaufNachricht,
} from "@/lib/whatsapp/zwischenfrage";
import { terminVorschlagText } from "@/lib/whatsapp/gespraech";
import { mitAnrede, nennungsRegel, vermittlerName, vermittlerNennungKorrigieren } from "@/lib/vermittler-nennung";
import { humanHandoverReply, kiHinweisErneut } from "@/lib/whatsapp/ki-hinweis";
import { sichereAntwort } from "@/lib/whatsapp/beratungs-sperre";
import { customerEventDescription } from "@/lib/whatsapp/event-text";
import { buildSystemPrompt } from "@/lib/whatsapp/bot";
import { anredeName } from "@/lib/ansprache";

const HERR = vermittlerName("sie", { name: "Ole Kannapinn", anrede: "Herr", fallback: "Agentur" });
const FRAU = vermittlerName("sie", { name: "Susanne Meier", anrede: "Frau", fallback: "Agentur" });
const DU = vermittlerName("du", { name: "Ole Kannapinn", anrede: "Herr", fallback: "Agentur" });
const PS_FORM = [{ label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat" }];

// v9 bleibt seit v10 (Ole, 19.11.2026) der Rückfall: bis v10 freigegeben ist bzw. wenn das Formular die feste Frage beantwortet
const V9 = (p: NoticePurpose, form: "sie" | "du" | "sie_ohne_name") => {
  const b = erstanschreibenV9(p as Parameters<typeof erstanschreibenV9>[0]);
  return form === "sie_ohne_name" ? `Hallo, ${b.sie.replace(/\{\{(\d+)\}\}/g, (_, n: string) => `{{${Number(n) - 1}}}`)}` : `Hallo {{1}}, ${b[form]}`;
};

describe("A) Erstnachricht v9 (seit v10 Rückfall)", () => {
  it("Privatschutz genau wie von Ole vorgegeben (Sie, mit Anrede)", () => {
    const tpl = V9("outreach_privatschutz", "sie");
    expect(tpl).toBe("Hallo {{1}}, danke für Ihre Anfrage zum Privatschutz! *{{2}}?*");
    const params = erstanschreibenV9Params({ source: "Privatschutz", an: "sie", formular: PS_FORM, person: HERR, kurz: "Ole" });
    expect(params).toEqual(["Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu"]);
    expect(renderTemplate(tpl, ["Herr Pan", ...params])).toBe(
      "Hallo Herr Pan, danke für Ihre Anfrage zum Privatschutz! *Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu?*",
    );
  });

  it("Tierkrankenversicherung emotional mit dem Tiernamen (Ole, 18.11.2026)", () => {
    expect(V9("outreach_tkv", "sie")).toBe("Hallo {{1}}, schön, dass Sie {{2}} gut absichern möchten 🐾 *{{3}}?*");
    expect(V9("outreach_tkv", "du")).toBe("Hallo {{1}}, schön, dass du {{2}} gut absichern möchtest 🐾 *{{3}}?*");
    expect(V9("outreach_tkv", "sie_ohne_name")).toBe("Hallo, schön, dass Sie {{1}} gut absichern möchten 🐾 *{{2}}?*");
    const minka = [{ label: "Tiername", value: "Minka" }];
    const params = erstanschreibenV9Params({ source: "TKV-Katze", an: "sie", formular: minka, person: HERR, kurz: "Ole" });
    expect(params).toEqual(["Minka", "Wie alt ist Ihre Katze"]);
    expect(renderTemplate(V9("outreach_tkv", "sie"), ["Herr Pan", ...params])).toBe("Hallo Herr Pan, schön, dass Sie Minka gut absichern möchten 🐾 *Wie alt ist Ihre Katze?*");
    // v10 (Ole, 19.11.2026): feste Frage, nur der Tiername als Platzhalter
    expect(renderTemplate(templateTextFor("outreach_tkv", "sie"), ["Herr Pan", "Minka"])).toBe("Hallo Herr Pan, schön, dass Sie Minka gut absichern möchten 🐾 *Was soll abgesichert sein?*");
    // mehrere Namen, ohne Namen der Akkusativ je Tier
    expect(tierFuerErstanschreiben("TKV-Katze", "sie", [{ label: "Name des Tieres", value: "Minka, Felix" }])).toBe("Minka und Felix");
    expect(tierFuerErstanschreiben("TKV-Katze", "sie", [{ label: "Tiername", value: "Minka und Felix" }])).toBe("Minka und Felix");
    expect(tierFuerErstanschreiben("TKV-Katze", "sie", [{ label: "Tiername", value: "Minka/Felix" }])).toBe("Minka und Felix");
    expect(tierFuerErstanschreiben("TKV-Katze", "du", [{ label: "Tiername", value: "Minka, Felix, Tom" }])).toBe("Minka, Felix und Tom");
    expect(tierFuerErstanschreiben("TKV-Katze", "sie", [])).toBe("Ihre Katze");
    expect(tierFuerErstanschreiben("TKV-Katze", "du", null)).toBe("deine Katze");
    expect(tierFuerErstanschreiben("Hundekrankenversicherung", "sie", [])).toBe("Ihren Hund");
    expect(tierFuerErstanschreiben("Hundekrankenversicherung", "du", [])).toBe("deinen Hund");
    expect(tierFuerErstanschreiben("Pferdeversicherung", "sie", [])).toBe("Ihr Pferd");
    expect(tierFuerErstanschreiben("Tierkrankenversicherung", "sie", [{ label: "Tiername", value: " " }])).toBe("Ihr Tier");
    expect(tierFuerErstanschreiben("Tierkrankenversicherung", "du", [])).toBe("dein Tier");
    // Freitext gleich der Vorlage (v10) plus KI-Zeile
    const frei = erstanschreibenText({ an: "du", kontakt: { fullName: "Erika Mustermann" }, name: "Ole", vermittler: DU.dat, source: "Hundekrankenversicherung", formular: [] });
    expect(frei).toBe("Hallo Erika, schön, dass du deinen Hund gut absichern möchtest 🐾 *Was soll abgesichert sein?*\n\n_Digitaler KI-Assistent_");
    // Formular kennt den gewünschten Schutz schon: v9 mit dem Alter
    const v9 = erstanschreibenText({ an: "du", kontakt: { fullName: "Erika Mustermann" }, name: "Ole", vermittler: DU.dat, source: "Hundekrankenversicherung", formular: [{ label: "Gewünschter Schutz", value: "OP-Schutz" }] });
    expect(v9).toBe("Hallo Erika, schön, dass du deinen Hund gut absichern möchtest 🐾 *Wie alt ist dein Hund?*\n\n_KI-Assistent · Erstinformation folgt als PDF_");
  });

  it("Anrede: Frau/Herr Nachname, unsicher Vor- und Nachname, ohne Nachnamen eigene Fassung", () => {
    expect(anredeName("sie", { fullName: "Erika Mustermann", salutation: "Frau" })).toBe("Frau Mustermann");
    expect(anredeName("sie", { fullName: "Max Mustermann", salutation: "m" })).toBe("Herr Mustermann");
    expect(anredeName("sie", { fullName: "Kim Mustermann", salutation: "divers" })).toBe("Kim Mustermann");
    expect(anredeName("sie", { fullName: "Kim Mustermann" })).toBe("Kim Mustermann");
    expect(V9("outreach_privatschutz", "sie_ohne_name")).toBe("Hallo, danke für Ihre Anfrage zum Privatschutz! *{{1}}?*");
    expect(templateTextFor("outreach_privatschutz", "sie_ohne_name")).toBe("Hallo, danke für Ihre Anfrage zu {{1}}! *Ist davon schon etwas versichert?*");
  });

  it("alle Produkte: gleicher kurzer Aufbau, bestehende Öffnungsfrage, kurz genug für WhatsApp Desktop", () => {
    const faelle: [string | null, string][] = [
      ["Privatschutz", "Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu"],
      ["TKV-Katze", "Wie alt ist Ihre Katze"],
      ["Zahnzusatz", "Welcher Tarifbaustein ist Ihnen am wichtigsten"],
      ["PKV", "Wie sind Sie aktuell beruflich aufgestellt"],
    ];
    for (const [source, frage] of faelle) {
      const f = erstanschreibenV9Params({ source, an: "sie", formular: source === "Privatschutz" ? PS_FORM : [], person: HERR, kurz: "Ole" }).at(-1);
      expect(f).toBe(frage);
    }
    for (const p of OUTREACH_PURPOSES) {
      expect(PURPOSE_VERSION[p]).toBe(p === "outreach_privatschutz" ? "v14" : p === "outreach_kfz" ? "v13" : "v12");
      for (const form of ["du", "sie", "sie_ohne_name"] as const) {
        const req = buildTemplateRequest(p, templateNamesOf("Agentur Ole Kannapinn", undefined, "Ole Kannapinn", "Herr"), undefined, form, { documentExample: "https://x.de/e.pdf" });
        const comps = req.components as { type: string; text?: string; example?: { body_text: string[][] } }[];
        const body = comps.find((c) => c.type === "BODY")!;
        expect(metaTemplateProblems(body.text!, body.example?.body_text[0] ?? [])).toEqual([]);
        expect(comps.find((c) => c.type === "FOOTER")?.text).toBe(ERSTINFO_FOOTER_V12);
        expect(comps.find((c) => c.type === "HEADER")).toBeTruthy();
        expect(req.name).toMatch(/_v1[234](_|$)/);
        // gerendert mit Beispielwerten kurz (v7 lag bei rund 230 Zeichen und klappte ein)
        expect(renderTemplate(body.text!, body.example?.body_text[0] ?? []).length).toBeLessThanOrEqual(190);
      }
    }
  });

  it("Fußzeile höchstens 60 Zeichen, mit KI-Kennzeichnung; ältere Fassungen behalten ihre Fußzeile", () => {
    expect(ERSTINFO_FOOTER_V8).toBe("KI-Assistent · Oben: Erstinformation (gesetzlich)");
    expect(ERSTINFO_FOOTER_V8.length).toBeLessThanOrEqual(60);
    expect(erstinfoFooterFor("v7")).not.toBe(ERSTINFO_FOOTER_V8);
    expect(erstinfoFooterFor(8)).toBe(ERSTINFO_FOOTER_V8);
    expect(ERSTINFO_FOOTER_V9).toBe("KI-Assistent · Erstinformation im PDF oben");
    expect(ERSTINFO_FOOTER_V9.length).toBeLessThanOrEqual(60);
    expect(erstinfoFooterFor("v9")).toBe(ERSTINFO_FOOTER_V9);
    expect(erstinfoFooterFor(9)).toBe(ERSTINFO_FOOTER_V9);
    // v10 (Ole, 19.11.2026, Recht): nur die KI-Kennzeichnung
    expect(erstinfoFooterFor("v10")).toBe(ERSTINFO_FOOTER_V10);
    expect(erstinfoFooterFor(10)).toBe("KI-Assistent");
    // v12 (Ole, 19.11.2026): „Digitaler KI-Assistent“ (Recht: das Wort KI bleibt)
    expect(erstinfoFooterFor("v12")).toBe(ERSTINFO_FOOTER_V12);
    expect(ERSTINFO_FOOTER_V12).toBe("Digitaler KI-Assistent");
  });

  it("v7 bzw. v8 bzw. v9 bleiben Rückfall mit alter Platzhalter-Belegung, bis v10 freigegeben ist", () => {
    expect(neuePlatzhalter("outreach_privatschutz", 7)).toBe(false);
    expect(neuePlatzhalter("outreach_privatschutz", 8)).toBe(false);
    // Vorschau der noch gesendeten Fassungen mit deren Platzhaltern
    expect(exampleRestFor("outreach_privatschutz", "sie", 8)).toEqual(["Herrn Schmidt", "Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu"]);
    expect(exampleRestFor("outreach_privatschutz", "sie", 7)).toEqual(["Privatschutz", "Herrn Schmidt", "Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu"]);
    expect(exampleRestFor("outreach_privatschutz", "sie", 9)).toEqual(["Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu"]);
    expect(exampleRestFor("outreach_tkv", "du", 9)).toEqual(["Minka", "Wie alt ist deine Katze"]);
    const t = (name: string) => ({ name, body: "Hallo {{1}}, x", purpose: "outreach_privatschutz", headerFormat: "DOCUMENT" });
    const nurV7 = rankOutreach([t("pg_outreach_privatschutz_v7_sie")], ["outreach_privatschutz", "outreach"], "sie", { fullName: "Max Muster", salutation: "Herr" }, { pdf: "vollstaendig" });
    expect(nurV7 && "version" in nurV7 ? nurV7.version : null).toBe(7);
    const beide = rankOutreach([t("pg_outreach_privatschutz_v7_sie"), t("pg_outreach_privatschutz_v8_sie")], ["outreach_privatschutz", "outreach"], "sie", { fullName: "Max Muster", salutation: "Herr" }, { pdf: "vollstaendig" });
    expect(beide && "version" in beide ? beide.version : null).toBe(8);
    expect(neuePlatzhalter("outreach_privatschutz", 9)).toBe(false);
    expect(neuePlatzhalter("outreach_privatschutz", 10)).toBe(true);
    const mitV9 = rankOutreach([t("pg_outreach_privatschutz_v8_sie"), t("pg_outreach_privatschutz_v9_sie")], ["outreach_privatschutz", "outreach"], "sie", { fullName: "Max Muster", salutation: "Herr" }, { pdf: "vollstaendig" });
    expect(mitV9 && "version" in mitV9 ? mitV9.version : null).toBe(9);
    // v10: nur noch der Name bzw. bei TKV der Tiername
    expect(exampleRestFor("outreach_privatschutz", "sie", 10)).toEqual([]);
    expect(exampleRestFor("outreach_tkv", "du", 10)).toEqual(["Minka"]);
  });

  it("die neuen Vorlagen werden je Kunde eingereicht (CORE_PURPOSES), je Fassung a und b", () => {
    const geplant = plannedTemplates(purposesFor({ bestand: false }));
    for (const p of OUTREACH_PURPOSES) expect(geplant.filter((x) => x.purpose === p).length).toBe(6);
  });

  it("Freitext im offenen Fenster: gleicher Aufbau, Frage fett, KI-Kennzeichnung als Zeile darunter (keine Fußzeile)", () => {
    const t = erstanschreibenText({ an: "sie", kontakt: { fullName: "Erika Mustermann", salutation: "Frau" }, name: "Ole", vermittler: HERR.dat, vermittlerNom: HERR.nom, source: "Privatschutz", formular: PS_FORM });
    expect(t).toBe("Hallo Frau Mustermann, danke für Ihre Anfrage zu Haftpflicht und Hausrat! *Ist davon schon etwas versichert?*\n\n_Digitaler KI-Assistent_");
    expect(t).not.toMatch(/[–—]/);
    const du = erstanschreibenText({ an: "du", kontakt: { fullName: "Erika Mustermann" }, name: "Ole", vermittler: DU.dat, source: "Privatschutz", formular: PS_FORM });
    expect(du).toContain("danke für deine Anfrage zu Haftpflicht und Hausrat! *");
    expect(du).toMatch(/\n\n_Digitaler KI-Assistent/);
  });

  it("Formular kennt bestehende Verträge: dann die Mitversichert-Frage als Öffnung, nie Bekanntes", () => {
    const form = [...PS_FORM, { label: "Bereits versichert", value: "Haftpflicht ja" }];
    const [, f] = erstanschreibenV8Params({ source: "Privatschutz", an: "sie", formular: form, person: HERR, kurz: "Ole" });
    expect(f).toMatch(/^Wer soll versichert werden/);
    const alles = [...form, { label: "Lebenssituation", value: "Single" }];
    expect(erstanschreibenV8Params({ source: "Privatschutz", an: "sie", formular: alles, person: HERR, kurz: "Ole" })[1]).toBe("Passt Ihnen ein kurzer Videotermin mit Herrn Kannapinn in den nächsten Tagen");
  });

  it("Beispielvorschau des Kunden nennt den Vermittler nach der Regel (Rückfall v8 mit Vermittler-Platzhalter)", () => {
    const v8 = ["Vermittler", "Erste Frage"];
    expect(exampleValuesFor("outreach_privatschutz", "sie", templateNamesOf("Agentur Ole Kannapinn", undefined, "Ole Kannapinn", "Herr"), v8)).toContain("Herrn Kannapinn");
    expect(exampleValuesFor("outreach_privatschutz", "sie", templateNamesOf("Agentur Ole Kannapinn", undefined, "Ole Kannapinn", null), v8)).toContain("Ole Kannapinn");
    // v9 nennt keinen Vermittler
    expect(exampleValuesFor("outreach_privatschutz", "sie", templateNamesOf("Agentur Ole Kannapinn", undefined, "Ole Kannapinn", "Herr"))).not.toContain("Herrn Kannapinn");
  });
});

const ERST: VerlaufNachricht = {
  direction: "outbound",
  kind: "template",
  purpose: "outreach_privatschutz",
  sentBy: "system",
  body: "[Erstinformation als PDF]\nHallo Frau Mustermann, danke für Ihre Anfrage zum Privatschutz! *Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu?*",
};
const ein = (body: string): VerlaufNachricht => ({ direction: "inbound", body, kind: "text" });
const def = ZWISCHENFRAGEN.outreach_privatschutz![0];
const FRAGE = { direction: "outbound", body: zwischenfrageText(def, "sie", HERR), kind: "interactive", sentBy: "bot" } as VerlaufNachricht;

describe("B) genau eine Zwischenfrage vor dem Terminvorschlag", () => {
  it("Text und Knöpfe genau wie von Ole vorgegeben", () => {
    expect(zwischenfrageText(def, "sie", HERR)).toBe("Danke! Damit Herr Kannapinn Ihnen im Termin gleich passende Beiträge zeigen kann: Wer soll mitversichert sein?");
    expect(zwischenfrageText(def, "du", DU)).toBe("Danke! Damit Ole dir im Termin gleich passende Beiträge zeigen kann: Wer soll mitversichert sein?");
    const k = zwischenKnoepfe(def);
    expect(k.map((x) => x.title)).toEqual(["Nur ich", "Zu zweit", "Familie mit Kindern"]);
    expect(k.every((x) => x.title.length <= 20 && x.id.length <= 256)).toBe(true);
  });

  it("schlichte Antwort auf die Öffnungsfrage: Zwischenfrage, Antwort wird als „vorhanden“ festgehalten", () => {
    const s = zwischenSchritt({ source: "Privatschutz", formular: PS_FORM, verlauf: [ERST, ein("Beides neu")] });
    expect(s).toMatchObject({ art: "fragen", def: { feld: "versichern" }, antwort: { feld: "vorhanden", wert: "Beides neu" } });
  });

  it("Erstinformation als PDF zwischen Öffnung und Antwort stört nicht", () => {
    const pdf: VerlaufNachricht = { direction: "outbound", kind: "document", body: "Unsere Erstinformation …", sentBy: "bot" };
    expect(zwischenSchritt({ source: "Privatschutz", formular: PS_FORM, verlauf: [ERST, pdf, ein("Hausrat habe ich schon")] })?.art).toBe("fragen");
  });

  it("Terminwunsch, Rückfrage oder Absage: nicht weiterfragen, Assistent bietet direkt den Termin an", () => {
    for (const t of ["Können wir morgen um 16 Uhr telefonieren?", "Beides neu, passt Donnerstag?", "Was kostet das?", "kein Interesse"]) {
      const s = zwischenSchritt({ source: "Privatschutz", formular: PS_FORM, verlauf: [ERST, ein(t)] });
      expect(s).toEqual({ art: "ueberspringen" });
      expect(zwischenHinweis(s!)).toMatch(/Stell keine weitere Frage/);
    }
    expect(schlichteAntwort("Nein, beides neu")).toBe(true);
  });

  it("Bekanntes aus dem Formular wird nie gefragt, dann kommt die nächste Frage (Ole, 18.11.2026)", () => {
    expect(offeneZwischenfrage("Privatschutz", [...PS_FORM, { label: "Lebenssituation", value: "Familie mit Kindern" }], null)?.key).toBe("wohnflaeche");
    expect(offeneZwischenfrage("Privatschutz", PS_FORM, { versichern: "Paar" })?.key).toBe("wohnflaeche");
    expect(offeneZwischenfrage("Privatschutz", PS_FORM, { versichern: "Paar", wohnflaeche: "80 m²" })?.key).toBe("oeffentlicherDienst");
    expect(offeneZwischenfrage("Privatschutz", PS_FORM, { versichern: "Paar", wohnflaeche: "80 m²", beruf: "Angestellt" })).toBeNull();
    const s = zwischenSchritt({ source: "Privatschutz", formular: [...PS_FORM, { label: "Familienstand", value: "verheiratet" }], verlauf: [ERST, ein("beides neu")] });
    expect(s).toMatchObject({ art: "fragen", def: { key: "wohnflaeche" } });
    const frage = { direction: "outbound", body: zwischenfrageText(s && s.art === "fragen" ? s.def : def, "sie", HERR), kind: "interactive", sentBy: "bot" } as VerlaufNachricht;
    expect(zwischenSchritt({ source: "Privatschutz", formular: [...PS_FORM, { label: "Familienstand", value: "verheiratet" }], verlauf: [ERST, ein("beides neu"), frage, ein("60 bis 100 m²")] })).toMatchObject({ art: "antwort", wert: "60 bis 100 m²", frei: false });
  });

  it("nur Privatschutz aktiv, andere Produkte nur vorbereitet", () => {
    expect(offeneZwischenfrage("TKV-Katze", [], null)).toBeNull();
    expect(offeneZwischenfrage("TKV-Katze", [], null, { aktiv: ["outreach_tkv"] })?.key).toBe("haltung");
    expect(offeneZwischenfrage("PKV", [{ label: "Aktueller Monatsbeitrag", value: "620 €" }], null, { aktiv: ["outreach_pkv"] })).toBeNull();
    for (const list of Object.values(ZWISCHENFRAGEN)) for (const d of list ?? []) expect(d.knoepfe.every((k) => k.length <= 20) && d.knoepfe.length <= 3).toBe(true);
  });

  it("Antwort per Knopf: Wert, danach Terminvorschlag; Freitext: Assistent übernimmt", () => {
    expect(zwischenSchritt({ source: "Privatschutz", formular: PS_FORM, verlauf: [ERST, ein("beides neu"), FRAGE, ein("Nur ich")] })).toMatchObject({ art: "antwort", wert: "Nur ich", frei: false });
    expect(zwischenSchritt({ source: "Privatschutz", formular: PS_FORM, verlauf: [ERST, ein("beides neu"), FRAGE, ein("meine Frau und ich")] })).toMatchObject({ art: "antwort", wert: "Zu zweit" });
    expect(zwischenSchritt({ source: "Privatschutz", formular: PS_FORM, verlauf: [ERST, ein("beides neu"), FRAGE, ein("Geht auch Freitag Abend?")] })).toMatchObject({ art: "antwort", wert: null, frei: true });
    expect(zwischenWert(def, "Familie mit Kindern")).toBe("Familie mit Kindern");
  });

  it("Zwischenfrage höchstens einmal", () => {
    const danach: VerlaufNachricht = { direction: "outbound", body: "Danke! In einem kurzen Videotermin …", sentBy: "bot", kind: "interactive" };
    expect(zwischenSchritt({ source: "Privatschutz", formular: PS_FORM, verlauf: [ERST, ein("beides neu"), FRAGE, ein("Nur ich"), danach, ein("ok")] })).toBeNull();
    // Lead hat auf die Öffnung mit einer Frage geantwortet, der Assistent antwortete: danach keine Zwischenfrage mehr
    const bot: VerlaufNachricht = { direction: "outbound", body: "Das klärt Herr Kannapinn im Termin mit Ihnen.", sentBy: "bot", kind: "text" };
    expect(zwischenSchritt({ source: "Privatschutz", formular: PS_FORM, verlauf: [ERST, ein("Was kostet das?"), bot, ein("beides neu")] })).toBeNull();
  });

  it("Terminnachricht greift die Antwort auf (kein pauschales „für Ihre Familie“)", () => {
    const text = (versichern: string) => terminVorschlagText({ an: "sie", source: "Privatschutz", formular: PS_FORM, angaben: { versichern }, person: HERR, zeiten: ["heute um 16 Uhr", "morgen um 10 Uhr"] });
    expect(text("Nur ich")).toBe("Danke! In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Sie kosten und worauf Sie achten sollten. Passt Ihnen heute um 16 Uhr oder morgen um 10 Uhr?");
    expect(text("Zu zweit")).toContain("für Sie beide kosten");
    expect(text("Familie mit Kindern")).toContain("für Ihre Familie kosten");
  });

  it("Prompt: bei Privatschutz stellt der Assistent nach der Öffnung keine eigene Frage mehr", () => {
    const p = buildSystemPrompt({ systemPrompt: "", knowledge: "", personality: "" }, "Privatschutz", {
      qualified: false,
      summary: null,
      contact: { name: "Erika Mustermann", phone: "49170", email: null },
      upcoming: null,
      formAnswers: PS_FORM,
      advisorName: "Ole Kannapinn",
      aiDisclosed: true,
      person: HERR,
      ersteFrage: frageplan("Privatschutz", PS_FORM).offen.length ? "x" : null,
    });
    expect(p).not.toMatch(/für Ihre Familie, alles klar/);
  });
});

describe("C) Vermittler-Nennung", () => {
  it("Sie: Herr/Frau Nachname, gebeugt; Du: Vorname; ohne Anrede: Vor- und Nachname", () => {
    expect(HERR).toEqual({ nom: "Herr Kannapinn", dat: "Herrn Kannapinn" });
    expect(FRAU).toEqual({ nom: "Frau Meier", dat: "Frau Meier" });
    expect(DU).toEqual({ nom: "Ole", dat: "Ole" });
    expect(vermittlerName("sie", { name: "Ole Kannapinn", anrede: null, fallback: "Agentur" })).toEqual({ nom: "Ole Kannapinn", dat: "Ole Kannapinn" });
    expect(mitAnrede(HERR)).toBe(true);
  });

  it("Sicherheitsnetz: keine Antwort an einen gesiezten Lead enthält Vorname Nachname des Vermittlers (außer Dateiname)", () => {
    const o = { voll: "Ole Kannapinn", person: HERR, an: "sie" as const };
    expect(vermittlerNennungKorrigieren("Ole Kannapinn zeigt Ihnen die Beiträge.", o)).toBe("Herr Kannapinn zeigt Ihnen die Beiträge.");
    expect(vermittlerNennungKorrigieren("Ihr Termin mit Ole Kannapinn steht.", o)).toBe("Ihr Termin mit Herrn Kannapinn steht.");
    expect(vermittlerNennungKorrigieren("Das klärt Herr Ole Kannapinn für Sie.", o)).toBe("Das klärt Herr Kannapinn für Sie.");
    expect(vermittlerNennungKorrigieren("Ich habe Ole Kannapinn Bescheid gegeben.", o)).toBe("Ich habe Herrn Kannapinn Bescheid gegeben.");
    expect(vermittlerNennungKorrigieren("Erstinformation_Ole Kannapinn.pdf", o)).toBe("Erstinformation_Ole Kannapinn.pdf");
    expect(vermittlerNennungKorrigieren("Ole Kannapinn zeigt dir …", { ...o, an: "du" })).toBe("Ole Kannapinn zeigt dir …");
    expect(vermittlerNennungKorrigieren("Ole Kannapinn", { ...o, person: { nom: "Ole Kannapinn", dat: "Ole Kannapinn" } })).toBe("Ole Kannapinn");
  });

  it("feste Texte nennen den Vermittler nach der Regel", () => {
    const names = { firm: "Agentur Kannapinn", advisor: "Ole Kannapinn", person: HERR };
    const alle = [
      humanHandoverReply("sie", names),
      kiHinweisErneut("sie", names),
      sichereAntwort("sie", HERR.nom, false),
      zwischenfrageText(def, "sie", HERR),
      customerEventDescription({ hi: "Guten Tag,", an: "sie", mode: "phone", phone: null, videoUrl: null, manageUrl: "https://x", advisorName: "Ole Kannapinn", person: HERR }).replace(/Bis bald!\nOle Kannapinn$/, ""),
      terminVorschlagText({ an: "sie", source: "Privatschutz", formular: PS_FORM, person: HERR, zeiten: ["a", "b"] }),
    ];
    for (const t of alle) expect(t).not.toContain("Ole Kannapinn");
    expect(humanHandoverReply("sie", names)).toContain("Ich habe Herrn Kannapinn Bescheid gegeben, Herr Kannapinn meldet sich persönlich bei Ihnen.");
  });

  it("Nachfass-Vorlagen (seit 18.11.2026 zur Einreichung freigegeben) und Freitext: gebeugt aus den Anbieterangaben", () => {
    const names = templateNamesOf("Agentur Ole Kannapinn", undefined, "Ole Kannapinn", "Herr");
    expect(noticeText("followup_noshow", "sie", names, { fullName: "Max Muster", salutation: "Herr" }, [])).toContain("neuen Termin mit Herrn Kannapinn finden?");
    expect(noticeText("followup_noshow", "du", names, { fullName: "Max Muster" }, [])).toContain("neuen Termin mit Ole finden?");
    // Ansprechpartner-Form (lib/lead-anrede.ts) ohne fertige person
    const who = { firm: "Agentur", advisor: "Susanne Meier", vermittler: { name: "Susanne Meier", anrede: "Frau" as const } };
    expect(noticeText("followup", "sie", who, null, ["heute", "morgen"])).toContain("mit Frau Meier hätte ich");
    // neu eingereichte Vorlagen P3/P5 (Ole, 17.11.2026): Vermittler nach der Regel fest im Text, wie in der Erstnachricht
    // Nachfassen v5 (Ole, 18.11.2026): ebenso followup, followup_noshow (followup_last nennt den Vermittler nur in Fassung b)
    for (const p of ["offer_bedenkzeit", "followup_offer_selbst"] as NoticePurpose[]) {
      expect(templateBodyFor(p, names, "sie")).toContain("digitale KI-Assistent von Herrn Kannapinn.");
      expect(templateBodyFor(p, names, "du")).toContain("digitale KI-Assistent von Ole.");
      expect(templateBodyFor(p, names, "sie")).not.toContain("Ole Kannapinn");
    }
    expect(templateBodyFor("followup", names, "sie")).toContain("Gespräch mit Herrn Kannapinn hätte ich");
    expect(templateBodyFor("followup", names, "du")).toContain("Gespräch mit Ole hätte ich");
    expect(templateBodyFor("followup_noshow", names, "sie")).toContain("neuen Termin mit Herrn Kannapinn finden?");
    expect(templateBodyFor("followup_last", names, "sie", "b")).toContain("Soll Herr Kannapinn sich noch um Ihre Anfrage kümmern?");
    // andere eingereichte Texte ändern sich dadurch nicht (keine ungewollte Neueinreichung)
    for (const p of ["followup_last"] as NoticePurpose[]) {
      expect(templateBodyFor(p, names, "sie")).toBe(templateBodyFor(p, templateNamesOf("Agentur Ole Kannapinn"), "sie"));
    }
    // Bestätigung ab v5 (Ole, 26.11.2026, Kundenfall Schwarzkopf): ebenfalls der Vermittler als Person
    expect(templateBodyFor("booking_confirmation", names, "sie")).toContain("Ihr Termin bei Herrn Kannapinn ist bestätigt");
    expect(templateBodyFor("booking_confirmation", names, "sie")).not.toContain("Ole Kannapinn");
  });

  it("Bot-Prompt: feste Regel und keine Vorschläge mit Vor- und Nachnamen", () => {
    expect(nennungsRegel("sie", HERR, "Ole Kannapinn")).toMatch(/Nie „Ole Kannapinn“/);
    const p = buildSystemPrompt({ systemPrompt: "", knowledge: "", personality: "" }, "Privatschutz", {
      qualified: false,
      summary: null,
      contact: { name: "Erika Mustermann", phone: "49170", email: null },
      upcoming: null,
      formAnswers: [],
      advisorName: "Ole Kannapinn",
      aiDisclosed: true,
      person: HERR,
    });
    // „Ole Kannapinn“ steht nur in der Erklärung, wer der Berater ist, und im Verbot
    const zeilen = p.split("\n").filter((z) => z.includes("Ole Kannapinn"));
    expect(zeilen.every((z) => /heißt „Ole Kannapinn“|Nie „Ole Kannapinn“/.test(z))).toBe(true);
    expect(p).toContain("Das klärt Herr Kannapinn im Termin");
  });
});
