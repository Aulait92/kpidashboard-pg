// Eigener PKV-Funnel (lib/funnel, Ole 20.11.2026): Konfiguration, Abbruchregeln, Prüfregeln, Felder für den
// Pay-per-Lead-Eingang, Ergebnis beim Abnehmer, Meta-Payload ohne Klartextdaten, Funnel-Adresse und Middleware.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getRedirectUrl, getRewrittenUrl, isRewrite } from "next/experimental/testing/server";
import {
  ablauf,
  datumTippen,
  fortschrittFuer,
  hinweisFuer,
  geburtsdatumOk,
  naechsterSchritt,
  optionLabel,
  PKV_BEITRAG,
  pplFelder,
  pruefeAlles,
  pruefeFeld,
  pruefeSchritt,
  saubereAntworten,
  testSchritte,
  texteFuer,
  type Antworten,
} from "@/lib/funnel/definition";
import { EINWILLIGUNG_KANAELE, EINWILLIGUNG_VERSION, einwilligungTeile, einwilligungText, PKV_SITUATIONEN, PKV_TEXTE, PKV_VERSICHERER } from "@/lib/funnel/pkv-beitrag-texte";
import { decideFunnelHost, gueltigeBesuchId, parseFunnelHosts } from "@/lib/funnel/host";
import { funnelDatenschutzEmail, experteMailAn } from "@/lib/funnel/einstellungen";
import { markeFuer, PKV_TARIFE } from "@/lib/funnel/marken";
import { ortAusAnschrift, partnerAus, registerNummer, type PartnerRoh } from "@/lib/funnel/partner";
import { einwilligungKurz, leadNachweisAus, poolEinwilligung } from "@/lib/ppl/einwilligung-nachweis";
import { einwilligungFuer } from "@/lib/ppl/delivery";
import { machineMail } from "@/lib/ppl/lead-mail";
import { leadPdfData } from "@/lib/ppl/lead-pdf";
import { renderTemplate } from "@/lib/ppl/template";
import { einwilligungStand } from "@/lib/einwilligung-stand";
import { PROVIDER } from "@/lib/legal-texts";
import { SPLITTEST_HYPOTHESE } from "@/lib/ab-hypothesen";
import { fbcAusFbclid, leadEreignis, qualitaetAn, qualitaetEventName, qualitaetsEreignis, userData } from "@/lib/funnel/meta";
import { bewerteLead, einwilligungNachweis, experteMail, saubereQuelle, type LeadFakten } from "@/lib/funnel/server";
import { categoryLabels } from "@/lib/ppl/perspective";
import { factsFrom } from "@/lib/ppl/engine";
import { EXPERIMENTE } from "@/lib/experimente";
import { securityHeaderRules } from "@/lib/security-headers";
import { RESERVED_SEGMENTS } from "@/lib/public-booking-host";
import { middleware } from "@/middleware";

const HEUTE = new Date("2026-11-20T10:00:00Z");
const f = PKV_BEITRAG;
const schritt = (id: string) => f.schritte.find((s) => s.id === id)!;

const VOLL: Antworten = {
  versichert: "Privat",
  versicherung: "DKV",
  situation: "Angestellt",
  dauer: "11 bis 20 Jahre",
  beitrag: "890",
  geburtsdatum: "14.03.1975",
  plz: "80331",
  ort: "München",
  vorname: "Erika",
  nachname: "Muster",
  email: "erika.muster@example.de",
  telefon: "0151 23456781",
};

describe("Funnel-Konfiguration", () => {
  it("7 Fragen in der Reihenfolge wie bei Perspective, eindeutige Schritte, Endseiten je Abbruch", () => {
    const ids = f.schritte.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ablauf(f).map((s) => s.id)).toEqual(["start", "versicherung", "situation", "dauer", "beitrag", "geburtsdatum", "wohnort", "fast-fertig", "name", "kontakt"]);
    const nr = f.schritte.flatMap((s) => ("frageNr" in s && s.frageNr ? [s.frageNr] : []));
    expect(nr).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(f.fragenGesamt).toBe(7);
    expect(f.schritte.filter((s) => s.art === "ende").map((s) => (s as { grund: string }).grund).sort()).toEqual(["gesetzlich", "unter_650"]);
    expect(PKV_VERSICHERER.at(-1)).toBe("Sonstige");
    const sit = schritt("situation");
    expect(sit.art === "auswahl" ? sit.optionen : []).toHaveLength(9);
  });

  it("Abbruchregeln: gesetzlich und Beitrag unter 650 € enden freundlich, sonst weiter", () => {
    expect(naechsterSchritt(f, "start", { versichert: "Gesetzlich" })).toEqual({ id: "ende-gesetzlich", abbruch: "gesetzlich" });
    expect(naechsterSchritt(f, "start", { versichert: "Privat" })).toEqual({ id: "versicherung", abbruch: null });
    expect(naechsterSchritt(f, "beitrag", { beitrag: "649" })).toEqual({ id: "ende-beitrag", abbruch: "unter_650" });
    expect(naechsterSchritt(f, "beitrag", { beitrag: "650" })).toEqual({ id: "geburtsdatum", abbruch: null });
    expect(naechsterSchritt(f, "beitrag", { beitrag: "1.200,50" }).id).toBe("geburtsdatum");
    expect(naechsterSchritt(f, "kontakt", VOLL).id).toBe("danke");
  });

  it("Prüfregeln je Feld", () => {
    expect(pruefeSchritt(schritt("start"), {})).toHaveProperty("versichert");
    expect(pruefeSchritt(schritt("versicherung"), { versicherung: "Erfunden AG" })).toHaveProperty("versicherung");
    expect(pruefeSchritt(schritt("beitrag"), { beitrag: "abc" })).toHaveProperty("beitrag");
    expect(pruefeSchritt(schritt("beitrag"), { beitrag: "900" })).toEqual({});
    expect(geburtsdatumOk("14.03.1975", HEUTE)).toBe("14.03.1975");
    expect(geburtsdatumOk("1.3.1975", HEUTE)).toBe("01.03.1975");
    expect(geburtsdatumOk("31.02.1980", HEUTE)).toBeNull();
    expect(geburtsdatumOk("21.11.2008", HEUTE)).toBeNull(); // 17 Jahre
    expect(geburtsdatumOk("20.11.2008", HEUTE)).toBe("20.11.2008"); // heute 18
    expect(geburtsdatumOk("01.01.1920", HEUTE)).toBeNull();
    expect(pruefeSchritt(schritt("wohnort"), { plz: "8033", ort: "München" })).toHaveProperty("plz");
    expect(pruefeSchritt(schritt("wohnort"), { plz: "80331", ort: "M" })).toHaveProperty("ort");
    expect(pruefeSchritt(schritt("wohnort"), { plz: "80331", ort: "Frankfurt am Main" })).toEqual({});
    expect(pruefeSchritt(schritt("name"), { vorname: "Jo", nachname: "Müller-Lüdenscheidt" })).toEqual({});
    expect(pruefeSchritt(schritt("name"), { vorname: "J", nachname: "123" })).toEqual({ vorname: PKV_TEXTE.name.fehlerVorname, nachname: PKV_TEXTE.name.fehlerNachname });
    expect(pruefeSchritt(schritt("kontakt"), { email: "a@b", telefon: "123" })).toEqual({ email: PKV_TEXTE.kontakt.fehlerEmail, telefon: PKV_TEXTE.kontakt.fehlerTelefon });
    expect(pruefeSchritt(schritt("kontakt"), { email: "x@y.de", telefon: "+49 151 23456781" })).toEqual({});
    expect(pruefeSchritt(schritt("kontakt"), { email: "x@y.de", telefon: "+43 660 1234567" })).toHaveProperty("telefon");
  });

  it("Fehler genauer: unmögliches Datum und Alter getrennt; Fortschritt über alle Schritte bis zum Absenden", () => {
    expect(pruefeSchritt(schritt("geburtsdatum"), { geburtsdatum: "31.02.1980" }, HEUTE)).toEqual({ geburtsdatum: PKV_TEXTE.geburtsdatum.fehlerDatum });
    expect(pruefeSchritt(schritt("geburtsdatum"), { geburtsdatum: "21.11.2010" }, HEUTE)).toEqual({ geburtsdatum: PKV_TEXTE.geburtsdatum.fehlerAlter });
    expect(pruefeSchritt(schritt("geburtsdatum"), { geburtsdatum: "1975" }, HEUTE)).toEqual({ geburtsdatum: PKV_TEXTE.geburtsdatum.fehler });
    expect(pruefeFeld("email", "a@b")).toBe(PKV_TEXTE.kontakt.fehlerEmail);
    expect(pruefeFeld("telefon", "0151 23456781")).toBeNull();
    expect(fortschrittFuer(f, "start")).toEqual({ nr: 1, von: 10 });
    expect(fortschrittFuer(f, "kontakt")).toEqual({ nr: 10, von: 10 });
    expect(fortschrittFuer(f, "danke")).toBeNull();
    expect(fortschrittFuer(f, "ende-beitrag")).toBeNull();
  });

  it("Geburtsdatum beim Tippen", () => {
    expect(datumTippen("14031975")).toBe("14.03.1975");
    expect(datumTippen("1.3.")).toBe("01.03.");
    expect(datumTippen("01.03.1975")).toBe("01.03.1975");
    expect(datumTippen("140")).toBe("14.0");
    expect(datumTippen("14.")).toBe("14.");
    expect(datumTippen("14")).toBe("14");
    expect(datumTippen("14.03.19756")).toBe("14.03.1975");
  });

  it("Gesamtprüfung auf dem Server: Fehler, Abbruch, ok", () => {
    expect(pruefeAlles(f, VOLL, HEUTE)).toEqual({ ok: true });
    expect(pruefeAlles(f, { ...VOLL, versichert: "Gesetzlich" }, HEUTE)).toMatchObject({ ok: false, abbruch: "gesetzlich", schritt: "start" });
    expect(pruefeAlles(f, { ...VOLL, beitrag: "500" }, HEUTE)).toMatchObject({ ok: false, abbruch: "unter_650", schritt: "beitrag" });
    expect(pruefeAlles(f, { ...VOLL, plz: "1" }, HEUTE)).toMatchObject({ ok: false, abbruch: null, schritt: "wohnort" });
    expect(saubereAntworten({ ...VOLL, unbekannt: "x", plz: "  80331 " })).toEqual({ ...VOLL, plz: "80331" });
  });

  it("Felder für den PPL-Eingang heißen wie bei den Perspective-Leads (PKV) und ergeben dieselben Filter-Merkmale", () => {
    const felder = pplFelder(f, VOLL, HEUTE);
    expect(felder).toEqual({
      Vorname: "Erika",
      Nachname: "Muster",
      "E-Mail": "erika.muster@example.de",
      Telefonnummer: "+4915123456781",
      Geburtsdatum: "14.03.1975",
      Postleitzahl: "80331",
      Ort: "München",
      "Aktuelle Versicherung": "DKV",
      "Wie lange in PKV?": "11 bis 20 Jahre",
      "Monatlicher Beitrag": "890",
      Situation: "Angestellt",
      "Gesetzlich oder privat?": "Privat",
      Source: f.quelle,
    });
    for (const label of categoryLabels("pkv")) expect(Object.keys(felder)).toContain(label);
    const facts = factsFrom(felder);
    expect(facts).toMatchObject({ plz: "80331", insurer: "DKV", contribution: 890, civilServant: false });
    expect(factsFrom(pplFelder(f, { ...VOLL, situation: "Beamter" }, HEUTE)).civilServant).toBe(true);
  });

  it("Fassung b je Schritt: erster echter Test „Überschrift mit Anlass“ läuft, Beispiel bleibt aus", () => {
    expect(testSchritte(f)).toEqual([{ schritt: "start", experiment: "funnel_pkv_anlass" }]);
    expect(texteFuer(schritt("start"), "a").ueberschrift).toBe(PKV_TEXTE.start.ueberschrift);
    expect(texteFuer(schritt("start"), "b").ueberschrift).toBe(PKV_TEXTE.startB.ueberschrift);
    expect(texteFuer(schritt("start"), "b").frage).toBe(PKV_TEXTE.start.frage);
    expect(texteFuer(schritt("versicherung"), "b")).toEqual(schritt("versicherung").texte);
    expect(PKV_TEXTE.startB.ueberschrift.replace("\u00a0", " ")).toBe("Hat deine PKV den Beitrag zum 1. Januar erhöht? Lass deinen Tarif kostenlos prüfen");
    expect(EXPERIMENTE.funnel_pkv_beispiel).toMatchObject({ aktiv: false });
    const d = EXPERIMENTE.funnel_pkv_anlass;
    expect("aktiv" in d).toBe(false); // läuft ohne Eintrag in „Experiment“
    expect(d).toMatchObject({ ziel: "ppl_erreicht", reifTage: 14, ohneEreignis: "ppl_unbekannt", min: 150 });
    expect(d.anzeigeZiele).toEqual(expect.arrayContaining(["funnel_lead", "ppl_termin", "ppl_abschluss", "ppl_umsatz"]));
    expect(SPLITTEST_HYPOTHESE.funnel_pkv_anlass).toBeTruthy();
  });

  it("Beschriftungen ändern sich, gespeicherte Werte nicht (Filter, Lead-PDF, Perspective-Felder)", () => {
    const start = schritt("start");
    const sit = schritt("situation");
    expect(start.art === "auswahl" && start.optionen).toEqual(["Privat", "Gesetzlich"]);
    expect(optionLabel(start, "Privat")).toBe("Privat versichert");
    expect(sit.art === "auswahl" && sit.optionen).toEqual([...PKV_SITUATIONEN]);
    expect(optionLabel(sit, "Beamter")).toBe("Beamtin/Beamter");
    expect(optionLabel(sit, "Rentner")).toBe("In Rente");
    expect(optionLabel(sit, "Angestellt")).toBe("Angestellt");
    // Kontakt: Telefon zuerst
    const k = schritt("kontakt");
    expect(k.art === "absenden" && k.felder.map((x) => x.feld)).toEqual(["telefon", "email"]);
    expect(texteFuer(k).knopf).toBe("Kostenlos prüfen lassen");
    // Beitragshinweis je Situation: Zuschuss nur bei Angestellten, Beamte mit Eigenanteil nach Beihilfe
    const b = schritt("beitrag");
    expect(hinweisFuer(b, texteFuer(b), { situation: "Angestellt" })).toMatch(/vor Arbeitgeberzuschuss/);
    expect(hinweisFuer(b, texteFuer(b), { situation: "Beamter" })).toMatch(/Eigenanteil nach Beihilfe/);
    expect(hinweisFuer(b, texteFuer(b), { situation: "Selbstständig" })).toBe(PKV_TEXTE.beitrag.hinweis);
    expect(PKV_TEXTE.beitrag.hinweis).not.toMatch(/Zuschuss/);
    // Versicherer: alle bleiben gültige Werte, 8 Kacheln, Beschriftung statt Wert
    const v = schritt("versicherung");
    expect(v.art === "auswahl" && v.optionen).toEqual([...PKV_VERSICHERER]);
    expect(v.art === "auswahl" && v.haeufig?.length).toBe(8);
    for (const h of v.art === "auswahl" ? (v.haeufig ?? []) : []) expect(PKV_VERSICHERER).toContain(h);
    expect(optionLabel(v, "Sonstige")).toBe("Andere Versicherung");
    expect(optionLabel(v, "HALLESCHE")).toBe("Hallesche");
    expect(pruefeSchritt(v, { versicherung: "HALLESCHE" })).toEqual({});
    // Situation: die vier häufigsten zuerst, Werte unverändert
    expect(PKV_SITUATIONEN.slice(0, 4)).toEqual(["Angestellt", "Selbstständig", "Beamter", "Rentner"]);
    expect(texteFuer(schritt("name")).fussnote).toMatch(/^Im Einzelfall möglich/);
    expect(schritt("ende-gesetzlich")).toMatchObject({ zurueckZu: "start" });
    expect(schritt("ende-beitrag")).toMatchObject({ zurueckZu: "beitrag" });
    expect(f.marke).toBe("pkv-tarife");
  });

  it("Texte: keine Gedankenstriche, nur „bis zu 50 %“ als Zahl-Versprechen, Einwilligung nennt den Knopf", () => {
    const alle: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") alle.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(PKV_TEXTE);
    walk(PKV_TARIFE.anbieter);
    alle.push(einwilligungText("datenschutz@example.de"), PKV_TEXTE.fortschritt(1, 7), PKV_TEXTE.kontakt.frageMitName("Erika"), PKV_TEXTE.danke.ueberschriftMitName("Erika"));
    for (const t of alle) expect(t, t).not.toMatch(/[–—]/);
    // „Nicht verwenden“ laut Conversion-Dokument
    expect(alle.join(" ")).not.toMatch(/sehr wahrscheinlich|garant|unabhängig|ohne Gesundheitsprüfung|Auswertung|Berechnung/i);
    // „bis zu 50 %“ nur mit Fußnote (L8): Schritt Name/Kontakt und Advertorial (Sternchen an der Zahl)
    expect(alle.filter((t) => /%/.test(t))).toEqual([PKV_TEXTE.start.text[2], PKV_TEXTE.name.ueberschrift]);
    expect(PKV_TEXTE.start.text[2]).toMatch(/50 %\*/);
    expect(PKV_TEXTE.start.fussnote).toBe(PKV_TEXTE.name.fussnote);
    expect(texteFuer(schritt("kontakt")).fussnote).toBe(PKV_TEXTE.name.fussnote);
    // Keine Ausrufezeichen in Überschriften (CI), „ob und wie viel“ (Recht), Advertorial als Anzeige gekennzeichnet
    for (const s of f.schritte) expect(texteFuer(s).ueberschrift ?? "", s.id).not.toMatch(/!/);
    expect(PKV_TEXTE.fastFertig.liste.join(" ")).toContain("ob und wie viel");
    expect(PKV_TEXTE.start.anzeige).toBe("Anzeige");
    expect(PKV_TEXTE.start.vertrauen).toContain("Dauert etwa 1 Minute");
  });

  it("Einwilligung (L1): alle Pflichtbestandteile, Knopfname wörtlich, Adresse eingesetzt, Links", () => {
    const text = einwilligungText("widerruf@pkv-tarife.example");
    expect(text).toContain(`„${PKV_TEXTE.kontakt.knopf}“`);
    expect(text).toContain("pkv-tarife.com (Ole Kannapinn UG)"); // Verantwortlicher
    expect(text).toContain("aus der Partnerliste"); // Empfänger (L2)
    for (const k of EINWILLIGUNG_KANAELE) expect(text).toContain(k); // Kanäle
    expect(text).toContain("per Telefon, E-Mail und WhatsApp");
    expect(text).toContain("Erstinformation erhalte ich elektronisch, auf Wunsch auf Papier"); // § 16 VersVermV
    expect(text).toContain("Widerruf jederzeit per E-Mail an widerruf@pkv-tarife.example."); // Widerrufsweg
    expect(text.endsWith("Datenschutz")).toBe(true);
    const links = einwilligungTeile("x@y.de").filter((t) => typeof t !== "string" && "link" in t);
    expect(links).toEqual([{ link: "partner", text: "Partnerliste" }, { link: "datenschutz", text: "Datenschutz" }]);
    expect(EINWILLIGUNG_VERSION).toMatch(/^pkv-beitrag-\d{4}-\d{2}-\d{2}$/);
  });

  it("Datenschutz-Adresse: FUNNEL_DATENSCHUTZ_EMAIL, sonst Anbieter; E-Mail „Dein Experte“ abschaltbar", () => {
    expect(funnelDatenschutzEmail({})).toBe(PROVIDER.email);
    expect(funnelDatenschutzEmail({ FUNNEL_DATENSCHUTZ_EMAIL: " datenschutz@pkv-tarife.com " })).toBe("datenschutz@pkv-tarife.com");
    expect(funnelDatenschutzEmail({ FUNNEL_DATENSCHUTZ_EMAIL: "kaputt" })).toBe(PROVIDER.email);
    expect(experteMailAn({})).toBe(true);
    expect(experteMailAn({ FUNNEL_EXPERTE_MAIL: "0" })).toBe(false);
  });

  it("Marke: Farben laut CI, Dateien unter /marken, Bilder mit Alt-Text", () => {
    expect(markeFuer(f.marke)).toBe(PKV_TARIFE);
    expect(PKV_TARIFE.farben).toMatchObject({ primaer: "#0E5F68", seite: "#F8F7F4", feldRand: "#7C8C9A" });
    for (const d of Object.values(PKV_TARIFE.dateien)) expect(d).toMatch(/^\/marken\/pkv-tarife\//);
    expect(PKV_TARIFE.bilder.start?.alt).toBe("Paar am Küchentisch prüft Unterlagen");
    expect(PKV_TARIFE.bilder.zwischenseite?.symbolbild).toBeUndefined();
  });
});

describe("Ergebnis beim Abnehmer (bewerteLead)", () => {
  const basis: LeadFakten = {
    poolStatus: "delivered",
    lieferweg: "app",
    lead: { isTest: false, kundeTest: false, status: "Neuer Lead", reached: false, closedAt: null, stornoState: null, stornoReason: null, termine: 0 },
    umsatz: 55,
    reklamiert: false,
  };
  const mit = (l: Partial<NonNullable<LeadFakten["lead"]>>, x: Partial<LeadFakten> = {}) => bewerteLead({ ...basis, ...x, lead: { ...basis.lead!, ...l } });

  it("Neuer Lead in der App: geliefert, mit Rückmeldemöglichkeit, noch nichts gemeldet", () => {
    expect(mit({})).toEqual({ geliefert: true, rueckmeldungMoeglich: true, rueckmeldung: false, erreicht: false, termin: false, abschluss: false, umsatz: true });
  });
  it("Nicht erreicht ist Rückmeldung, aber nicht erreicht; Im Gespräch bzw. Kein Interesse = erreicht", () => {
    expect(mit({ status: "Nicht erreicht" })).toMatchObject({ rueckmeldung: true, erreicht: false });
    expect(mit({ status: "Im Gespräch" })).toMatchObject({ erreicht: true, termin: false });
    expect(mit({ status: "Kein Interesse" })).toMatchObject({ erreicht: true });
    expect(mit({ reached: true })).toMatchObject({ erreicht: true });
  });
  it("Termin und Abschluss", () => {
    expect(mit({ termine: 1 })).toMatchObject({ erreicht: true, termin: true, abschluss: false });
    expect(mit({ status: "In Beratung" })).toMatchObject({ termin: true });
    expect(mit({ status: "Abschluss" })).toMatchObject({ erreicht: true, termin: true, abschluss: true });
    expect(mit({ closedAt: new Date() })).toMatchObject({ abschluss: true });
  });
  it("Storno wegen Nichterreichbarkeit oder falscher Daten zählt nie als erreicht; anderer Grund nur nicht als Umsatz", () => {
    expect(mit({ status: "Im Gespräch", stornoState: "approved", stornoReason: "Kontaktdaten unbekannt" })).toMatchObject({ erreicht: false, umsatz: false, rueckmeldung: true });
    expect(mit({ status: "Im Gespräch", stornoState: "approved", stornoReason: "Wohnsitz im Ausland" })).toMatchObject({ erreicht: true, umsatz: false });
    expect(mit({ status: "Im Gespräch", stornoState: "rejected", stornoReason: "Telefonnummer falsch" })).toMatchObject({ erreicht: true, umsatz: true });
    expect(mit({ status: "Im Gespräch" }, { reklamiert: true })).toMatchObject({ erreicht: false, umsatz: false });
  });
  it("Versand per E-Mail: Ergebnis unbekannt; nicht geliefert, Test: nichts", () => {
    expect(mit({ status: "Im Gespräch" }, { lieferweg: "email" })).toMatchObject({ geliefert: true, rueckmeldungMoeglich: false });
    expect(bewerteLead({ ...basis, poolStatus: "duplicate", lead: null })).toMatchObject({ geliefert: false, erreicht: false });
    expect(mit({ isTest: true, status: "Abschluss" })).toMatchObject({ geliefert: false, abschluss: false });
    expect(mit({}, { umsatz: 0 })).toMatchObject({ umsatz: false });
  });
});

describe("Meta: Conversions API ohne Klartextdaten", () => {
  const nutzer = { besuchId: "b-1234567890abcdef", email: " Erika.Muster@Example.de ", telefon: "4915123456781", vorname: "Erika", nachname: "Muster", geburtsdatum: "14.03.1975", plz: "80331", ort: "München", fbc: "fb.1.1700000000000.AbCdEf123", fbp: "fb.1.1700000000000.123456789", ip: "203.0.113.5", userAgent: "Mozilla/5.0" };

  it("Personendaten nur als SHA-256 nach Meta-Normalisierung, Kennungen ungehasht", () => {
    const u = userData(nutzer);
    const json = JSON.stringify(u);
    for (const klar of ["erika", "Erika", "muster", "example", "4915123456781", "80331", "münchen", "München", "19750314", "b-1234567890abcdef"]) expect(json).not.toContain(klar);
    const sha = (x: string) => createHash("sha256").update(x).digest("hex");
    expect(u.em).toEqual([sha("erika.muster@example.de")]);
    expect(u.ph).toEqual([sha("4915123456781")]);
    expect(u.db).toEqual([sha("19750314")]);
    expect(u.ct).toEqual([sha("münchen")]);
    expect(u.external_id).toEqual([sha(nutzer.besuchId)]);
    expect(u.fbc).toBe(nutzer.fbc);
    expect(u.fbp).toBe(nutzer.fbp);
    expect(u.client_ip_address).toBe("203.0.113.5");
    expect(u.client_user_agent).toBe("Mozilla/5.0");
    expect(Object.keys(u).sort()).toEqual(["client_ip_address", "client_user_agent", "country", "ct", "db", "em", "external_id", "fbc", "fbp", "fn", "ln", "ph", "zp"]);
  });

  it("Lead-Ereignis mit event_id (gleich wie im Pixel), Qualitäts-Ereignis mit Wert und fester event_id", () => {
    const zeit = new Date("2026-11-20T10:00:00Z");
    const e = leadEreignis({ eventId: "abc12345-xyz", zeit, url: "https://beitrag.pkv-tarife.com/", nutzer, produkt: "PKV-Tarifoptimierung" });
    expect(e).toMatchObject({ event_name: "Lead", event_id: "abc12345-xyz", action_source: "website", event_time: Math.floor(zeit.getTime() / 1000), event_source_url: "https://beitrag.pkv-tarife.com/" });
    const q = qualitaetsEreignis({ zeit, wert: 54.62, nutzer, produkt: "PKV-Tarifoptimierung" });
    expect(q).toMatchObject({ event_name: "LeadErreicht", event_id: `q-${nutzer.besuchId}`, custom_data: { value: 54.62, currency: "EUR" } });
    expect(JSON.stringify([e, q])).not.toMatch(/erika|muster|4915123456781/i);
  });

  it("Qualitäts-Ereignis standardmäßig aus, Name einstellbar; fbc aus fbclid", () => {
    expect(qualitaetAn({})).toBe(false);
    expect(qualitaetAn({ FUNNEL_META_QUALITAET: "an" })).toBe(true);
    expect(qualitaetEventName({})).toBe("LeadErreicht");
    expect(qualitaetEventName({ FUNNEL_META_QUALITAET_EVENT: "Purchase" })).toBe("Purchase");
    expect(fbcAusFbclid("IwAR0abcdefghijk", 1700000000000)).toBe("fb.1.1700000000000.IwAR0abcdefghijk");
    expect(fbcAusFbclid("kurz", 1)).toBeNull();
  });

  it("Herkunft: nur Tracking-Schlüssel, fbclid nur als vorhanden", () => {
    expect(saubereQuelle({ utm_source: "facebook", utm_campaign: "PKV Herbst", email: "x@y.de", fbclid: "IwAR0abcdef", ad_id: "{{ad.id}}" })).toEqual({ utm_source: "facebook", utm_campaign: "PKV Herbst", fbclid: true });
    expect(saubereQuelle({})).toBeNull();
  });
});

describe("Funnel-Adresse", () => {
  it("Zuordnung Host → Funnel, Standard beitrag.pkv-tarife.com", () => {
    expect([...parseFunnelHosts(undefined)]).toEqual([["beitrag.pkv-tarife.com", "pkv-beitrag"]]);
    expect([...parseFunnelHosts("a.de=pkv-beitrag, b.de=x")]).toEqual([["a.de", "pkv-beitrag"], ["b.de", "x"]]);
  });
  it("Entscheidungen", () => {
    const d = (pathname: string, host = "beitrag.pkv-tarife.com", search = "") => decideFunnelHost({ host, pathname, search });
    expect(d("/")).toEqual({ kind: "rewrite", pathname: "/f/pkv-beitrag", funnel: "pkv-beitrag" });
    expect(d("/", "beitrag.pkv-tarife.com:443")).toMatchObject({ kind: "rewrite" });
    expect(d("/api/funnel/ereignis")).toMatchObject({ kind: "serve" });
    expect(d("/_next/static/x.js")).toMatchObject({ kind: "serve" });
    expect(d("/f/pkv-beitrag")).toMatchObject({ kind: "serve" });
    expect(d("/f/pkv-beitrag/partner")).toMatchObject({ kind: "serve" });
    expect(d("/partner")).toEqual({ kind: "rewrite", pathname: "/f/pkv-beitrag/partner", funnel: "pkv-beitrag" });
    expect(d("/marken/pkv-tarife/hero.webp")).toMatchObject({ kind: "serve" });
    expect(d("/marken-x")).toMatchObject({ kind: "redirect" });
    expect(d("/robots.txt")).toEqual({ kind: "robots" });
    expect(d("/login", undefined, "?utm_source=fb")).toEqual({ kind: "redirect", location: "/?utm_source=fb" });
    expect(d("/admin")).toMatchObject({ kind: "redirect" });
    expect(d("/", "app.performancegrowth.de")).toEqual({ kind: "pass" });
    expect(gueltigeBesuchId("123e4567-e89b-12d3-a456-426614174000")).toBeTruthy();
    expect(gueltigeBesuchId("x;drop")).toBeNull();
    expect(RESERVED_SEGMENTS.has("f")).toBe(true);
  });
  it("CSP erlaubt den Meta-Pixel nur auf den Funnel-Seiten", () => {
    const rules = securityHeaderRules({});
    const funnel = rules.filter((r) => r.source === "/f/:path*" || r.has?.some((h) => h.type === "host"));
    expect(funnel).toHaveLength(2);
    for (const r of funnel) expect(r.headers[0].value).toContain("https://connect.facebook.net");
    expect(funnel[1].has).toEqual([{ type: "host", value: "beitrag\\.pkv-tarife\\.com" }]);
    const andere = rules.filter((r) => !funnel.includes(r)).flatMap((r) => r.headers.map((h) => h.value));
    expect(andere.join(" ")).not.toContain("facebook");
  });
});

describe("Middleware: eigene Funnels", () => {
  const req = (url: string, cookie?: string) => {
    const u = new URL(url);
    const headers = new Headers({ host: u.host });
    if (cookie) headers.set("cookie", cookie);
    return new NextRequest(`http://localhost:8080${u.pathname}${u.search}`, { headers });
  };

  it("beitrag.pkv-tarife.com/ zeigt den Funnel, nicht indexieren, kein Besucher-Cookie (L4)", async () => {
    const res = await middleware(req("https://beitrag.pkv-tarife.com/?utm_source=fb"));
    expect(isRewrite(res)).toBe(true);
    expect(new URL(getRewrittenUrl(res)!).pathname).toBe("/f/pkv-beitrag");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.cookies.get("pf_bid")).toBeUndefined();
    expect(res.headers.get("set-cookie") ?? "").not.toContain("pf_bid=");
    const partner = await middleware(req("https://beitrag.pkv-tarife.com/partner"));
    expect(new URL(getRewrittenUrl(partner)!).pathname).toBe("/f/pkv-beitrag/partner");
    expect(partner.cookies.get("pf_bid")).toBeUndefined();
  });

  it("alter Cookie pf_bid wird gelöscht; andere Pfade der App nicht erreichbar", async () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const res = await middleware(req("https://beitrag.pkv-tarife.com/", `pf_bid=${id}`));
    expect(res.headers.get("set-cookie") ?? "").toMatch(/pf_bid=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)/i);
    const login = await middleware(req("https://beitrag.pkv-tarife.com/login"));
    expect(login.status).toBe(307);
    expect(new URL(getRedirectUrl(login)!).pathname).toBe("/");
  });

  it("/f/pkv-beitrag auf der App-Adresse ohne Login, ohne Besucher-Cookie", async () => {
    process.env.AUTH_SECRET ||= "localtestsecret_localtestsecret_0123456789";
    const res = await middleware(req("https://app.performancegrowth.de/f/pkv-beitrag"));
    expect(res.status).toBe(200);
    expect(getRedirectUrl(res)).toBeNull();
    expect(res.cookies.get("pf_bid")).toBeUndefined();
    expect(getRedirectUrl(await middleware(req("https://app.performancegrowth.de/f/pkv-beitrag/partner")))).toBeNull();
    const api = await middleware(req("https://app.performancegrowth.de/api/funnel/ereignis"));
    expect(getRedirectUrl(api)).toBeNull();
  });
});

describe("Partnerliste (L2)", () => {
  const roh = (x: Partial<PartnerRoh> & { customerId: string }): PartnerRoh => ({
    kundeName: `Kunde ${x.customerId}`,
    isTest: false,
    ruhend: false,
    aktiv: true,
    aktualisiert: new Date("2026-11-18T10:00:00Z"),
    erstinfo: null,
    registerNr: null,
    ...x,
  });

  it("Ort aus der Anschrift, Registernummer nur im gültigen Format", () => {
    expect(ortAusAnschrift("Hauptstr. 5, 50667 Köln")).toBe("Köln");
    expect(ortAusAnschrift("Hauptstr. 5\n80331 München-Schwabing")).toBe("München-Schwabing");
    expect(ortAusAnschrift("ohne Postleitzahl")).toBeNull();
    expect(registerNummer(" d-abcd-12345-67 ")).toBe("D-ABCD-12345-67");
    expect(registerNummer("12345")).toBeNull();
  });

  it("nur aktive Bezüge, ohne Testkunden und ruhende Konten, je Kunde einmal, fehlende Angaben gemeldet", () => {
    const { partner, stand } = partnerAus([
      roh({ customerId: "a", erstinfo: { name: "Max Muster", firma: "Muster Finanz GmbH", anschrift: "Ring 1, 10115 Berlin", registerNummer: "D-1234-ABCDE-12" } }),
      roh({ customerId: "a", aktualisiert: new Date("2026-11-19T10:00:00Z") }),
      roh({ customerId: "b", kundeName: "Beta Versicherungsmakler", registerNr: "D-9999-ZZZZZ-99" }),
      roh({ customerId: "t", isTest: true, kundeName: "Testkunde" }),
      roh({ customerId: "r", ruhend: true, kundeName: "Ruht" }),
      roh({ customerId: "x", aktiv: false, kundeName: "Inaktiv" }),
    ]);
    expect(partner.map((p) => p.firma)).toEqual(["Beta Versicherungsmakler", "Muster Finanz GmbH"]);
    expect(partner[1]).toEqual({ firma: "Muster Finanz GmbH", name: "Max Muster", ort: "Berlin", registerNummer: "D-1234-ABCDE-12", fehlt: [] });
    expect(partner[0]).toMatchObject({ name: null, ort: null, registerNummer: "D-9999-ZZZZZ-99" });
    expect(partner[0].fehlt).toEqual(["Firma (Erstinformation oder Partner-Angaben)", "Name", "Sitz (Ort)"]);
    expect(stand?.toISOString()).toBe("2026-11-19T10:00:00.000Z");
    expect(partnerAus([]).stand).toBeNull();
  });

  it("Partner-Angaben gehen vor: Empfänger als Firma, Kontoname als Ansprechpartner", () => {
    const { partner } = partnerAus([
      roh({
        customerId: "d",
        kundeName: "Dennis Müller",
        erstinfo: { name: "Dennis Müller", firma: null, anschrift: null, registerNummer: null },
        partnerAngaben: { firma: "Nico Yagci", anschrift: "John-F.-Kennedy-Str. 27, 34128 Kassel", registerNr: "d-c9fq-v848d-75" },
      }),
    ]);
    expect(partner[0]).toEqual({ firma: "Nico Yagci", name: "Dennis Müller", ort: "Kassel", registerNummer: "D-C9FQ-V848D-75", fehlt: [] });
  });
});

describe("Einwilligungsnachweis je Lead (L3)", () => {
  const now = new Date("2026-11-20T11:00:00Z");
  const n = einwilligungNachweis("pkv-beitrag", "datenschutz@example.de", now);

  it("beim Absenden: Wortlaut mit Adresse, Fassung, Zeitpunkt, Kanäle, Knopf, Funnel", () => {
    expect(n).toEqual({
      at: "2026-11-20T11:00:00.000Z",
      funnel: "pkv-beitrag",
      version: EINWILLIGUNG_VERSION,
      text: einwilligungText("datenschutz@example.de"),
      kanaele: ["Telefon", "E-Mail", "WhatsApp"],
      knopf: "Kostenlos prüfen lassen",
    });
    expect(poolEinwilligung(JSON.parse(JSON.stringify(n)))).toEqual(n);
    expect(poolEinwilligung({ at: "x", text: "y" })).toBeNull();
    expect(poolEinwilligung(null)).toBeNull();
    expect(einwilligungKurz(n)).toContain("Kanäle: Telefon, E-Mail, WhatsApp");
  });

  it("am Lead: Nachweis wie aus dem Leadformular, zählt als vollständige Einwilligung", () => {
    const l = leadNachweisAus(n);
    expect(l).toMatchObject({ at: n.at, text: n.text, textVersion: EINWILLIGUNG_VERSION, kanaele: n.kanaele, knopf: n.knopf });
    expect(einwilligungStand({ waConsent: "ja", consentData: l, meta: false })).toMatchObject({ stufe: "vollstaendig", nachweis: { text: n.text } });
  });

  it("an den Abnehmer: Nachweis statt Bezugstext (PDF, maschinenlesbare Mail, Vorlage); ohne Nachweis wie bisher", () => {
    const sub = { consentText: "Alter Text am Bezug" };
    const mit = einwilligungFuer(sub, { consent: n, consentAt: new Date("2026-11-20T11:00:05Z") });
    expect(mit).toMatchObject({ text: n.text, at: now, nachweis: n });
    expect(mit.detail).toBe(`Fassung ${EINWILLIGUNG_VERSION} · Kanäle: Telefon, E-Mail, WhatsApp`);
    expect(einwilligungFuer(sub, { consent: null, consentAt: now })).toMatchObject({ text: "Alter Text am Bezug", detail: null });

    const m = machineMail({ id: "L1", date: now, product: "PKV-Tarifoptimierung", name: "Erika Muster", phone: "4915123456781", email: "e@x.de", answers: [], consentText: mit.text, consentAt: mit.at, consentVersion: n.version, consentChannels: n.kanaele, consentButton: n.knopf, consentFunnel: n.funnel });
    expect(m.text).toContain(`Einwilligungstext: ${n.text}`);
    expect(m.text).toContain(`Einwilligung Fassung: ${EINWILLIGUNG_VERSION}`);
    expect(m.text).toContain("Einwilligung Kanäle: Telefon, E-Mail, WhatsApp");
    expect(m.json.einwilligung).toMatchObject({ text: n.text, fassung: EINWILLIGUNG_VERSION, kanaele: n.kanaele, knopf: n.knopf, funnel: "pkv-beitrag" });
    const ohne = machineMail({ id: "L1", date: now, product: "X", name: null, phone: null, email: null, answers: [], consentText: "T", consentAt: null });
    expect(ohne.text).not.toContain("Einwilligung Fassung");

    const pdf = leadPdfData({ id: "L1", product: "PKV-Tarifoptimierung", name: "Erika", phone: null, email: null, answers: [], date: now, consentText: mit.text, consentAt: mit.at, consentDetail: mit.detail });
    expect(pdf.einwilligung).toMatchObject({ text: n.text, zitat: true });
    expect(pdf.einwilligung.am).toContain(EINWILLIGUNG_VERSION);

    const v = renderTemplate("Name: {name}\nEinwilligung: {einwilligung}\nAm: {einwilligung_zeitpunkt}", { id: "L1", name: "Erika", phone: null, email: null, answers: [], consent: { text: n.text, at: n.at, version: n.version, kanaele: n.kanaele } });
    expect(v).toContain(`Einwilligung: ${n.text}`);
    expect(renderTemplate("Name: {name}\nEinwilligung: {einwilligung}", { id: "L1", name: "Erika", phone: null, email: null, answers: [] })).toBe("Name: Erika");
  });

  it("E-Mail „Dein Experte“ (L9): Du-Form, ohne Nummer, Widerruf, keine Gedankenstriche", () => {
    const m = experteMail({ email: "e@x.de", vorname: "Erika", experte: { name: "Max Muster", firma: "Muster Finanz GmbH", telefon: "030 1234567" }, datenschutzEmail: "datenschutz@example.de" });
    expect(m.subject).toBe("Dein Experte für die PKV-Prüfung: Max Muster");
    expect(m.text).toContain("Hallo Erika,");
    expect(m.text).toContain("Max Muster von Muster Finanz GmbH ruft dich in den nächsten Tagen wegen deiner PKV-Prüfung an.");
    expect(m.text).not.toContain("030 1234567");
    expect(m.text).toContain("Widerruf jederzeit per E-Mail an datenschutz@example.de.");
    expect(m.text).not.toMatch(/[–—]/);
  });
});
