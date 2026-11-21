// Kfz-Einstiegsfrage im Erstanschreiben (Ole, 21.11.2026: „Bei KFZ brauchen wir noch eine Einstiegsfrage, die nicht
// direkt auf den Termin geht“). Je Anlass aus dem Kfz-Leadformular eine feste Frage mit Knöpfen, Fassung b „Frage
// zuerst“, Antwort per Knopf oder frei in angaben.kfzStart bzw. kfzVertrag, danach der Terminvorschlag mit der Antwort.
// Bis zur Freigabe bei Meta das bisherige allgemeine Erstanschreiben. Rein, ohne Datenbank.
import { describe, expect, it } from "vitest";
import {
  enthaeltErsteFrage,
  ERSTANSCHREIBEN_V10,
  erstanschreibenText,
  erstanschreibenZweck,
  ersteFrageKnoepfe,
  ersteFrageRegel,
  erstfrageFreitextWert,
  erstfrageKnopfWert,
  frageplan,
  istKfzZweck,
  KFZ_ZWECKE,
  kfzZweck,
  outreachProdukt,
  v10Moeglich,
  vorKfzStichtag,
} from "@/lib/whatsapp/erstanschreiben";
import { CORE_PURPOSES, CUSTOMER_TITLES } from "@/lib/whatsapp/template-plan";
import { outreachMaxVersion, rankOutreach, TEMPLATE_BODY, TEMPLATE_BODY_B, TEMPLATE_BUTTONS, templateTextFor, type NoticePurpose } from "@/lib/whatsapp/templates";
import { erstfrageFreitextHinweis, erstfrageHinweis, knopfAktion } from "@/lib/whatsapp/knopf";
import { terminNutzenSatz } from "@/lib/whatsapp/gespraech";
import { vermittlerName } from "@/lib/vermittler-nennung";
import { angabenFuerSparte } from "@/lib/preise/rechner-angaben";
import { cleanQualificationData } from "@/lib/whatsapp/qualification";

const WECHSEL = [{ label: "Worum geht es?", value: "Versicherung wechseln (jetziges Auto)" }];
const NEU = [{ label: "Worum geht es dir?", value: "Neues Auto versichern" }];
const HERR = vermittlerName("sie", { name: "Ole Kannapinn", anrede: "Herr", fallback: "Agentur" });
const OLE = vermittlerName("du", { name: "Ole Kannapinn", anrede: "Herr", fallback: "Agentur" });
const kontakt = { fullName: "Erika Mustermann", salutation: "Frau" };

const gesendet = (formular: { label: string; value: string }[], an: "sie" | "du" = "sie", variant: "a" | "b" = "a") =>
  erstanschreibenText({ an, kontakt, name: "Ole", vermittler: HERR.dat, vermittlerNom: HERR.nom, source: "Kfz-Versicherung", formular, variant });

describe("Kfz: Zweck je Anlass aus dem Leadformular", () => {
  it("Wechsel, neues Auto, ohne Angabe die Anlass-Frage (Sie- und Du-Beschriftung)", () => {
    expect(erstanschreibenZweck("Kfz-Versicherung", WECHSEL)).toBe("outreach_kfz_wechsel");
    expect(erstanschreibenZweck("Autoversicherung", NEU)).toBe("outreach_kfz_neu");
    expect(erstanschreibenZweck("KFZ", [])).toBe("outreach_kfz");
    expect(kfzZweck([{ label: "Worum geht es?", value: "" }])).toBe("outreach_kfz");
    expect(KFZ_ZWECKE.every((z) => istKfzZweck(z))).toBe(true);
    expect(istKfzZweck("outreach")).toBe(false);
  });

  it("Kfz ist nie Privatschutz oder PKV (Kfz-Haftpflicht, Kfz-Versicherung wechseln); andere Produkte unverändert", () => {
    expect(outreachProdukt("Kfz-Haftpflicht")).toBeNull();
    expect(outreachProdukt("Kfz-Versicherung wechseln")).toBeNull();
    expect(erstanschreibenZweck("Kfz-Haftpflicht", WECHSEL)).toBe("outreach_kfz_wechsel");
    expect(erstanschreibenZweck("Privatschutz", [])).toBe("outreach_privatschutz");
    expect(erstanschreibenZweck("PKV Wechsel", [])).toBe("outreach_pkv");
    expect(erstanschreibenZweck(null, [])).toBe("outreach");
  });
});

describe("Kfz: Texte, Knöpfe, Vorlagen", () => {
  it("Fassung a und b wörtlich (Sie und Du)", () => {
    expect(TEMPLATE_BODY.outreach_kfz_wechsel).toEqual({
      sie: "danke für Ihre Anfrage zur Kfz-Versicherung! *Wann läuft Ihr jetziger Vertrag aus?*",
      du: "danke für deine Anfrage zur Kfz-Versicherung! *Wann läuft dein jetziger Vertrag aus?*",
    });
    expect(TEMPLATE_BODY_B.outreach_kfz_wechsel).toEqual({ sie: "*wann läuft Ihre jetzige Kfz-Versicherung aus?* Danke für Ihre Anfrage!", du: "*wann läuft deine jetzige Kfz-Versicherung aus?* Danke für deine Anfrage!" });
    expect(TEMPLATE_BODY.outreach_kfz_neu.sie).toBe("danke für Ihre Anfrage zur Kfz-Versicherung! *Ist das neue Auto schon da?*");
    expect(TEMPLATE_BODY_B.outreach_kfz_neu!.du).toBe("*ist das neue Auto schon da?* Danke für deine Anfrage zur Kfz-Versicherung!");
    expect(TEMPLATE_BODY.outreach_kfz.du).toBe("danke für deine Anfrage zur Kfz-Versicherung! *Für dein jetziges Auto oder ein neues?*");
    expect(TEMPLATE_BODY_B.outreach_kfz!.sie).toBe("*Kfz-Versicherung für Ihr jetziges Auto oder ein neues?* Danke für Ihre Anfrage!");
    expect(templateTextFor("outreach_kfz_wechsel", "sie")).toBe("Hallo {{1}}, danke für Ihre Anfrage zur Kfz-Versicherung! *Wann läuft Ihr jetziger Vertrag aus?*");
    expect(templateTextFor("outreach_kfz_wechsel", "sie_ohne_name")).toBe("Hallo, danke für Ihre Anfrage zur Kfz-Versicherung! *Wann läuft Ihr jetziger Vertrag aus?*");
  });

  it("Knöpfe je Anlass (höchstens 20 Zeichen), keine Sonderknöpfe; Einreichung bei Meta über CORE_PURPOSES", () => {
    expect(TEMPLATE_BUTTONS.outreach_kfz_wechsel).toEqual(["Zum Jahresende", "Anderes Datum", "Weiß ich nicht"]);
    expect(TEMPLATE_BUTTONS.outreach_kfz_neu).toEqual(["Ja, ist schon da", "Kommt noch", "Suche noch"]);
    expect(TEMPLATE_BUTTONS.outreach_kfz).toEqual(["Jetziges Auto", "Neues Auto"]);
    for (const z of KFZ_ZWECKE) {
      for (const k of ERSTANSCHREIBEN_V10[z].knoepfe) {
        expect(k.length, k).toBeLessThanOrEqual(20);
        expect(knopfAktion("button", k, k), k).toBeNull();
      }
      expect(CORE_PURPOSES).toContain(z);
      expect(CUSTOMER_TITLES[z].title).not.toMatch(/[–—]/);
    }
  });

  it("Freitext im offenen Fenster: Anrede, Text der zugeteilten Fassung, Fußzeile wie v12, Knöpfe", () => {
    expect(gesendet(WECHSEL)).toBe("Hallo Frau Mustermann, danke für Ihre Anfrage zur Kfz-Versicherung! *Wann läuft Ihr jetziger Vertrag aus?*\n\n_Digitaler KI-Assistent_");
    expect(gesendet(NEU, "sie", "b")).toBe("Hallo Frau Mustermann, *ist das neue Auto schon da?* Danke für Ihre Anfrage zur Kfz-Versicherung!\n\n_Digitaler KI-Assistent_");
    expect(gesendet(WECHSEL, "du")).toContain("Hallo Erika, danke für deine Anfrage zur Kfz-Versicherung!");
    expect(ersteFrageKnoepfe("Kfz-Versicherung", WECHSEL)).toEqual(["Zum Jahresende", "Anderes Datum", "Weiß ich nicht"]);
    // Schon gebucht (Dankeseite): keine Einstiegsfrage, wie bisher die allgemeine Fassung
    expect(v10Moeglich("Kfz-Versicherung", WECHSEL, { gebucht: true })).toBe(false);
  });

  it("Rückfall bis zur Freigabe bei Meta: das bisherige allgemeine Erstanschreiben v12 (Telefonat), danach die Kfz-Vorlage", () => {
    const t = (name: string, purpose: NoticePurpose) => ({ name, purpose, body: "Hallo {{1}}, x", headerFormat: "DOCUMENT" });
    const max = outreachMaxVersion("outreach_kfz_wechsel", true);
    expect(max).toEqual({});
    const nur = [t("pg_outreach_v9_sie", "outreach"), t("pg_outreach_v12_sie", "outreach")];
    const r = rankOutreach(nur, ["outreach_kfz_wechsel", "outreach"], "sie", kontakt, { pdf: "vollstaendig", maxVersion: max });
    expect(r && "tpl" in r ? [r.tpl.name, r.purpose] : r).toEqual(["pg_outreach_v12_sie", "outreach"]);
    const mit = [...nur, t("pg_outreach_kfz_wechsel_v12_sie", "outreach_kfz_wechsel")];
    const k = rankOutreach(mit, ["outreach_kfz_wechsel", "outreach"], "sie", kontakt, { pdf: "vollstaendig", maxVersion: max });
    expect(k && "tpl" in k ? k.tpl.name : k).toBe("pg_outreach_kfz_wechsel_v12_sie");
    // Produkt-Leads bleiben bei der Regel „nie die allgemeine Telefonatsfrage“
    expect(outreachMaxVersion("outreach_tkv", true)).toEqual({ outreach: 9 });
    expect(outreachMaxVersion("outreach_kfz", false).outreach_kfz).toBe(9);
  });
});

describe("Kfz: Antwort per Knopf oder frei", () => {
  it("Knopf: Feld und Wert", () => {
    expect(erstfrageKnopfWert(gesendet(WECHSEL), "Zum Jahresende", "outreach_kfz_wechsel")).toMatchObject({ feld: "kfzStart", wert: "jetziger Vertrag läuft zum Jahresende aus (Wechsel zum 1.1.)" });
    expect(erstfrageKnopfWert(gesendet(NEU, "du", "b"), "Kommt noch", "outreach_kfz_neu")).toMatchObject({ feld: "kfzStart", wert: "neues Auto kommt noch (bestellt bzw. gekauft)" });
    expect(erstfrageKnopfWert(gesendet([]), "Neues Auto", "outreach_kfz")).toMatchObject({ feld: "kfzVertrag", wert: "neues Auto versichern" });
  });

  it.each([
    ["Ende Dezember", "Zum Jahresende"],
    ["zum 1.1.", "Zum Jahresende"],
    ["31.12.", "Zum Jahresende"],
    ["Keine Ahnung", "Weiß ich nicht"],
    ["muss ich nachschauen", "Weiß ich nicht"],
    ["im März", "Anderes Datum"],
    ["15.04.", "Anderes Datum"],
    ["Zum Jahresende", "Zum Jahresende"],
  ])("Wechsel frei: „%s“ → %s", (text, knopf) => {
    expect(erstfrageFreitextWert(gesendet(WECHSEL), text, "outreach_kfz_wechsel")?.knopf).toBe(knopf);
  });

  it.each([
    ["Ja, steht schon vor der Tür", "Ja, ist schon da"],
    ["wird nächste Woche geliefert", "Kommt noch"],
    ["Ist bestellt", "Kommt noch"],
    ["Ich schaue noch", "Suche noch"],
  ])("Neues Auto frei: „%s“ → %s", (text, knopf) => {
    expect(erstfrageFreitextWert(gesendet(NEU), text, "outreach_kfz_neu")?.knopf).toBe(knopf);
  });

  it.each([
    ["Mein neues", "Neues Auto"],
    ["das jetzige", "Jetziges Auto"],
    ["Wechsel", "Jetziges Auto"],
  ])("Anlass frei: „%s“ → %s", (text, knopf) => {
    expect(erstfrageFreitextWert(gesendet([]), text, "outreach_kfz")?.knopf).toBe(knopf);
  });

  it("Unklares, Rückfragen und andere Produkte bleiben beim Assistenten", () => {
    expect(erstfrageFreitextWert(gesendet(WECHSEL), "Was kostet das bei Ihnen?", "outreach_kfz_wechsel")).toBeNull();
    expect(erstfrageFreitextWert(gesendet(WECHSEL), "Hallo", "outreach_kfz_wechsel")).toBeNull();
    expect(erstfrageFreitextWert(gesendet(NEU), "nein", "outreach_kfz_neu")).toBeNull();
    const privat = "Hallo Herr Pan, danke für Ihre Anfrage zu Haftpflicht und Hausrat! *Ist davon schon etwas versichert?*";
    expect(erstfrageFreitextWert(privat, "Alles neu", "outreach_privatschutz")).toBeNull();
  });

  it("Hinweise an den Assistenten ohne Gedankenstriche", () => {
    const e = erstfrageFreitextWert(gesendet(WECHSEL), "Ende Dezember", "outreach_kfz_wechsel")!;
    expect(erstfrageFreitextHinweis(e)).toContain("angaben.kfzStart = „jetziger Vertrag läuft zum Jahresende aus (Wechsel zum 1.1.)“");
    expect(erstfrageFreitextHinweis(e)).not.toMatch(/[–—]/);
    expect(erstfrageHinweis(e)).not.toMatch(/[–—]/);
  });
});

describe("Kfz: Ablauf nach der Antwort", () => {
  it("Frageplan: Einstiegsfrage gestellt, keine weitere Frage vor dem Termin", () => {
    const plan = frageplan("Kfz-Versicherung", WECHSEL, { gesendet: gesendet(WECHSEL) });
    expect(plan.gestellt).toMatchObject({ key: "kfz", feld: "kfzStart", sie: "Wann läuft Ihr jetziger Vertrag aus?" });
    expect(plan.offen).toEqual([]);
    expect(enthaeltErsteFrage(gesendet(NEU, "du", "b"), "Kfz-Versicherung")).toBe(true);
    expect(enthaeltErsteFrage("Hallo, wie geht es?", "Kfz-Versicherung")).toBe(false);
  });

  it("Regel für den Assistenten: festhalten, nichts weiter fragen, Terminvorschlag; 30. November nur bis dahin", () => {
    const vorher = ersteFrageRegel("Kfz-Versicherung", "Ole", { gesendet: gesendet(WECHSEL), an: "sie", formular: WECHSEL, heute: new Date("2026-11-21T10:00:00Z") });
    expect(vorher).toContain("„Wann läuft Ihr jetziger Vertrag aus?“");
    expect(vorher).toContain("angaben.kfzStart");
    expect(vorher).toContain("„Zum Jahresende“ = „jetziger Vertrag läuft zum Jahresende aus (Wechsel zum 1.1.)“");
    expect(vorher).toContain("Vor dem Termin fragst du nichts weiter");
    expect(vorher).toContain("Terminvorschlag");
    expect(vorher).toContain("30. November");
    expect(vorher).not.toMatch(/[–—]/);
    const danach = ersteFrageRegel("Kfz-Versicherung", "Ole", { gesendet: gesendet(WECHSEL), an: "sie", formular: WECHSEL, heute: new Date("2026-12-05T10:00:00Z") });
    expect(danach).not.toContain("30. November");
    expect(danach).toContain("Nenn keine Kündigungsfristen");
    const neu = ersteFrageRegel("Kfz-Versicherung", "Ole", { gesendet: gesendet(NEU, "du"), an: "du", formular: NEU, heute: new Date("2026-11-21T10:00:00Z") });
    expect(neu).not.toContain("30. November");
    expect(neu).toContain("„Kommt noch“");
  });

  it("Stichtag: 1. Oktober bis 30. November (Berlin)", () => {
    expect(vorKfzStichtag(new Date("2026-11-30T23:30:00Z"))).toBe(false); // 1.12., 0:30 Uhr in Berlin
    expect(vorKfzStichtag(new Date("2026-11-30T12:00:00Z"))).toBe(true);
    expect(vorKfzStichtag(new Date("2026-10-01T08:00:00Z"))).toBe(true);
    expect(vorKfzStichtag(new Date("2026-09-30T08:00:00Z"))).toBe(false);
  });

  it("Terminvorschlag greift die Antwort auf (Sie und Du), ohne Gedankenstriche und Versprechen", () => {
    const satz = (formular: { label: string; value: string }[], angaben: unknown, an: "sie" | "du" = "sie") =>
      terminNutzenSatz({ source: "Kfz-Versicherung", formular, angaben, an, person: an === "du" ? OLE : HERR });
    expect(satz(WECHSEL, { kfzStart: "jetziger Vertrag läuft zum Jahresende aus (Wechsel zum 1.1.)" })).toBe(
      "In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was eine neue Kfz-Versicherung ab dem 1. Januar für Sie kostet und worauf Sie achten sollten.",
    );
    expect(satz(WECHSEL, { kfzStart: "Ablauf des jetzigen Vertrags unbekannt (steht auf der letzten Rechnung)" })).toBe(
      "In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was eine neue Kfz-Versicherung für Sie kostet und worauf Sie achten sollten.",
    );
    expect(satz(NEU, { kfzStart: "neues Auto kommt noch (bestellt bzw. gekauft)" }, "du")).toBe("In einem kurzen Videotermin zeigt dir Ole, was die Versicherung für dein neues Auto kostet und worauf du achten solltest.");
    expect(satz([], { kfzVertrag: "neues Auto versichern" })).toContain("für Ihr neues Auto kostet");
    expect(satz([], {})).toContain("was eine Kfz-Versicherung für Sie kostet");
    for (const t of [satz(WECHSEL, {}), satz(NEU, {}, "du")]) expect(t).not.toMatch(/[–—]|Garantie|günstig|sparen/i);
  });

  it("Antwort landet in den Angaben fürs Angebot (Rechner Kfz)", () => {
    expect(cleanQualificationData({ kfzStart: "neues Auto ist schon da" })).toEqual({ kfzStart: "neues Auto ist schon da" });
    const angaben = angabenFuerSparte({ formular: WECHSEL, angaben: { kfzStart: "jetziger Vertrag läuft zum Jahresende aus (Wechsel zum 1.1.)" } }, "kfz");
    expect(angaben.find((x) => x.key === "kfzStart")).toMatchObject({ label: "Ablauf jetziger Vertrag bzw. neues Auto da", wert: "jetziger Vertrag läuft zum Jahresende aus (Wechsel zum 1.1.)" });
    // Formular-Anlass bleibt im Feld „Anlass, Schutz, Schäden“
    expect(angaben.find((x) => x.key === "kfzVertrag")?.wert).toContain("Versicherung wechseln");
  });
});
