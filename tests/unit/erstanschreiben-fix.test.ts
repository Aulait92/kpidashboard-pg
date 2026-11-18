// Live-Test Ole, 17.11.2026 (Testkunde „Ole Agentur“, Privatschutz, Sie): Statt der freigegebenen v5 kam die alte v3
// („Ich bin kein Mensch …“), der Assistent fragte Bekanntes umformuliert ab und die Termin-Strecke war zu lang.
// Hier: Vorlagenwahl (rankOutreach), Anrede ohne Raten, Frageplan je Produkt, Terminvorschlag, Folgefragen nach der
// Rechner-Tabelle, Buchungs- und Abschlussnachricht. Rein, ohne Datenbank und ohne echtes LLM.
import { describe, expect, it } from "vitest";
import { rankOutreach, rankTemplates, templateTextFor, type NoticePurpose } from "@/lib/whatsapp/templates";
import { anredeName, anredeZeile } from "@/lib/ansprache";
import { frageplan, ersteFrage, ersteFrageRegel, erstanschreibenText, outreachProdukt, MAX_FRAGEN_VOR_TERMIN } from "@/lib/whatsapp/erstanschreiben";
import { testLeadAnswers } from "@/lib/testlead";
import { buildSystemPrompt } from "@/lib/whatsapp/bot";
import { abschlussText, bereitlegenListe, buchungsText, nachBuchungRegel, terminVorschlagText, vermittlerName, versicherungWort, zeitKurz } from "@/lib/whatsapp/gespraech";
import { folgefragen, folgefrageText, spartenDesLeads, type RechnerSparte } from "@/lib/preise/rechner-angaben";
import { buildIcs, type CustomerEvent } from "@/lib/calendar/add-to-calendar";

const tpl = (name: string, purpose: NoticePurpose, header: boolean, body = "x") => ({ name, purpose, body, headerFormat: header ? "DOCUMENT" : null });
const v = (purpose: NoticePurpose, form: "sie" | "sie_ohne_name" | "du") => templateTextFor(purpose, form);
// Freigegebener Text der v5 (seit v6 nicht mehr in TEMPLATE_BODY): Frage fest im Text
const V5_PRIVATSCHUTZ_SIE =
  "Hallo {{1}}, danke für Ihre Anfrage zum Thema {{2}}!\nIch bin der digitale KI-Assistent von Ole und kläre kurz zwei, drei Fragen, damit Ole Ihnen ein passendes Angebot machen kann.\n\n*Worum geht es Ihnen vor allem?*";

// Freigegeben bei Meta für „Ole Agentur“ (Sie): Privatschutz v5/v4 und allgemein v5/v4 mit PDF-Kopf, v3 ohne Kopf
const FREIGEGEBEN = [
  tpl("pg_outreach_privatschutz_v5_sie", "outreach_privatschutz", true, v("outreach_privatschutz", "sie")),
  tpl("pg_outreach_privatschutz_v4", "outreach_privatschutz", true, "Hallo {{1}}, danke für deine Anfrage zum Thema {{2}}!"),
  tpl("pg_outreach_privatschutz_v4_sie", "outreach_privatschutz", true, "Guten Tag {{1}}, vielen Dank für Ihre Anfrage zum Thema {{2}}!"),
  tpl("pg_outreach_v5_sie", "outreach", true, v("outreach", "sie")),
  tpl("pg_outreach_v5_sie_ohne_name", "outreach", true, v("outreach", "sie_ohne_name")),
  tpl("pg_outreach_v4_sie", "outreach", true, "Guten Tag {{1}}, vielen Dank für Ihre Anfrage!"),
  tpl("pg_outreach_v3_sie", "outreach", false, "Guten Tag {{1}}, vielen Dank für Ihre Anfrage! Hier schreibt der digitale KI-Assistent von Ole Agentur. Ich bin kein Mensch {{2}}"),
  tpl("pg_outreach_v3_sie_ohne_name", "outreach", false, "Guten Tag, vielen Dank für Ihre Anfrage! Ich bin kein Mensch {{1}}"),
];
const TESTLEAD = { fullName: "Ole Kannapinn Testlead" };
const PURPOSES: NoticePurpose[] = ["outreach_privatschutz", "outreach"];

describe("1. Vorlagenwahl Erstanschreiben (rankOutreach)", () => {
  it("Ursache: ohne vollständiges PDF schloss die alte Wahl alle Vorlagen mit PDF-Kopf aus, übrig blieb v3", () => {
    const ps = FREIGEGEBEN.filter((t) => t.purpose === "outreach_privatschutz");
    expect(rankTemplates(ps, "outreach_privatschutz", "sie", TESTLEAD, { documentHeader: false })).toBeNull();
    const allg = FREIGEGEBEN.filter((t) => t.purpose === "outreach");
    expect(rankTemplates(allg, "outreach", "sie", TESTLEAD, { documentHeader: false })?.tpl.name).toBe("pg_outreach_v3_sie");
  });

  it("jetzt: v5 des Produkts gewinnt; Erstinformation unvollständig → PDF im aktuellen Stand im Kopf, nie v3", () => {
    const r = rankOutreach(FREIGEGEBEN, PURPOSES, "sie", TESTLEAD, { pdf: "entwurf" });
    expect(r && "tpl" in r ? [r.tpl.name, r.dokument, r.version] : r).toEqual(["pg_outreach_privatschutz_v5_sie", "entwurf", 5]);
    const voll = rankOutreach(FREIGEGEBEN, PURPOSES, "sie", TESTLEAD, { pdf: "vollstaendig" });
    expect(voll && "tpl" in voll ? [voll.tpl.name, voll.dokument] : voll).toEqual(["pg_outreach_privatschutz_v5_sie", "vollstaendig"]);
  });

  it("nie ohne Erstinformation (Live-Test 17.11.2026): Fassungen ohne PDF-Kopf werden nicht gewählt", () => {
    const ohneKopf = [...FREIGEGEBEN, tpl("pg_outreach_privatschutz_v5_sie_r2", "outreach_privatschutz", false, v("outreach_privatschutz", "sie"))];
    const r = rankOutreach(ohneKopf, PURPOSES, "sie", TESTLEAD, { pdf: "entwurf" });
    expect(r && "tpl" in r ? [r.tpl.name, r.dokument] : r).toEqual(["pg_outreach_privatschutz_v5_sie", "entwurf"]);
    // Kein PDF erzeugbar: auch eine Fassung ohne Kopf geht nicht raus, das Erstanschreiben wartet
    const allgOhne = [...FREIGEGEBEN, tpl("pg_outreach_v5_sie_r2", "outreach", false, v("outreach", "sie"))];
    expect(rankOutreach(allgOhne, PURPOSES, "sie", TESTLEAD, { pdf: "keins" })).toEqual({ wartenAufPdf: true });
  });

  it("kein PDF erzeugbar: warten statt v3; nur v3 (ohne PDF-Kopf) freigegeben: keine Vorlage, nie v3", () => {
    expect(rankOutreach(FREIGEGEBEN, PURPOSES, "sie", TESTLEAD, { pdf: "keins" })).toEqual({ wartenAufPdf: true });
    const nurV3 = FREIGEGEBEN.filter((t) => t.name.includes("_v3_"));
    expect(rankOutreach(nurV3, PURPOSES, "sie", TESTLEAD, { pdf: "vollstaendig" })).toBeNull();
    expect(rankOutreach([], PURPOSES, "sie", TESTLEAD, { pdf: "vollstaendig" })).toBeNull();
  });

  it("Anrede-Fassung: mit Nachnamen „Hallo Herr Kannapinn,“ (eindeutiger Vorname), ohne Nachnamen die Fassung ohne Namen", () => {
    const r = rankOutreach(FREIGEGEBEN, PURPOSES, "sie", { fullName: "Ole Kannapinn" }, { pdf: "vollstaendig" });
    if (!r || !("tpl" in r)) throw new Error("keine Vorlage");
    expect(r.params(["Privatschutz"])).toEqual(["Herr Kannapinn", "Privatschutz"]);
    const nurVorname = rankOutreach(FREIGEGEBEN, ["outreach"], "sie", { fullName: "Ole" }, { pdf: "vollstaendig" });
    expect(nurVorname && "tpl" in nurVorname ? nurVorname.tpl.name : nurVorname).toBe("pg_outreach_v5_sie_ohne_name");
  });
});

describe("2. Anrede: Herr/Frau aus Formular oder eindeutigem Vornamen (Ole, 18.11.2026)", () => {
  it("Sie: Herr Nachname, zweideutiger Vorname voller Name; Du: Vorname", () => {
    expect(anredeName("sie", { fullName: "Ole Kannapinn" })).toBe("Herr Kannapinn");
    expect(anredeName("sie", { fullName: "Kai Kannapinn" })).toBe("Kai Kannapinn");
    expect(anredeName("sie", TESTLEAD)).toBe("Herr Testlead");
    expect(anredeName("sie", { fullName: "Peter Meier" })).toBe("Herr Meier");
    expect(anredeName("sie", { fullName: "Ole Kannapinn", salutation: "Herr" })).toBe("Herr Kannapinn");
    expect(anredeName("du", { fullName: "Ole Kannapinn" })).toBe("Ole");
    expect(anredeZeile("sie", { fullName: "Maria Schneider" })).toBe("Guten Tag Frau Schneider,");
  });

  it("Vermittler: Sie „Herr Kannapinn“ (Dativ „Herrn“), ohne Anrede Vor- und Nachname, Du Vorname, Agentur nur als Rückfall", () => {
    expect(vermittlerName("sie", { name: "Ole Kannapinn", anrede: "Herr", fallback: "Ole Agentur" })).toEqual({ nom: "Herr Kannapinn", dat: "Herrn Kannapinn" });
    expect(vermittlerName("sie", { name: "Julia Brand", anrede: "Frau", fallback: "X" })).toEqual({ nom: "Frau Brand", dat: "Frau Brand" });
    expect(vermittlerName("sie", { name: "Ole Kannapinn", anrede: null, fallback: "X" }).nom).toBe("Ole Kannapinn");
    expect(vermittlerName("du", { name: "Ole Kannapinn", anrede: "Herr", fallback: "X" }).nom).toBe("Ole");
    expect(vermittlerName("sie", { name: "Agentur Meier", anrede: null, fallback: "Agentur Meier" }).nom).toBe("Agentur Meier");
  });
});

// Alle Produkte aus dem Katalog bzw. testLeadAnswers (Testlead mit vollständigen Formularangaben)
const PRODUKTE = [
  "Privatschutz",
  "Hausratversicherung",
  "Rechtsschutzversicherung",
  "Wohngebäudeversicherung",
  "Unfallversicherung",
  "TKV-Katze",
  "Katzenkrankenversicherung",
  "Hundekrankenversicherung",
  "Pferdeversicherung",
  "Zahnzusatz",
  "PKV-Tarifoptimierung",
  "PKV Wechsel",
  "Neugeschäft",
  "Sterbegeld",
];

describe("3./4. Frageplan je Produkt (Testlead mit vollständigen Formularangaben)", () => {
  for (const produkt of PRODUKTE) {
    it(`${produkt}: keine Frage, deren Antwort im Formular steht; Terminvorschlag spätestens in der 3. Nachricht`, () => {
      const formular = testLeadAnswers(produkt);
      const p = outreachProdukt(produkt);
      const purpose = p?.purpose ?? "outreach";
      // a) Vorlage v6 mit der ersten offenen Frage ist das Erstanschreiben
      void purpose;
      const gesendet = erstanschreibenText({ an: "sie", kontakt: TESTLEAD, name: "Ole", vermittler: "Herrn Kannapinn", source: produkt, formular });
      const plan = frageplan(produkt, formular, { gesendet });
      for (const f of plan.offen) expect(f.bekannt, `${produkt}: ${f.sie}`).toBeNull();
      const fragenGesamt = (plan.gestellt ? 1 : 0) + plan.offen.length;
      expect(fragenGesamt).toBeLessThanOrEqual(MAX_FRAGEN_VOR_TERMIN);
      // Nachricht 1 = Erstanschreiben, je offene Frage eine Nachricht, dann der Terminvorschlag
      expect(1 + plan.offen.length + 1).toBeLessThanOrEqual(3);
      // b) Freitext im offenen Fenster: fragt nur Offenes
      const frei = frageplan(produkt, formular);
      for (const f of frei.offen) expect(f.bekannt).toBeNull();
      expect(frei.offen.length).toBeLessThanOrEqual(MAX_FRAGEN_VOR_TERMIN);
      const erste = ersteFrage(produkt, "sie", "Ole", formular);
      for (const f of frei.fragen.filter((x) => x.bekannt)) expect(erste).not.toBe(f.sie);
    });
  }

  it("Privatschutz live: Vorlagenfrage „Worum geht es Ihnen vor allem?“ gilt als beantwortet, danach nur „schon versichert?“", () => {
    const formular = testLeadAnswers("Privatschutz");
    const gesendet = V5_PRIVATSCHUTZ_SIE.replace("{{1}}", "Ole Kannapinn Testlead").replace("{{2}}", "Privatschutz");
    const plan = frageplan("Privatschutz", formular, { gesendet });
    expect(plan.gestellt?.key).toBe("frage1");
    expect(plan.gestellt?.bekannt).toBe("Versicherungsinteresse: Haftpflicht, Hausrat");
    expect(plan.offen.map((f) => f.sie)).toEqual(["Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu?"]);
    const regel = ersteFrageRegel("Privatschutz", "Herr Kannapinn", { gesendet, an: "sie", formular });
    expect(regel).toMatch(/gilt als beantwortet/);
    expect(regel).toMatch(/verfolge die Frage nicht weiter/);
    expect(regel).not.toMatch(/Wer soll versichert werden/);
    // ältere Fassung (v3) ohne Frage: nicht so tun, als sei Frage 1 gestellt worden
    const v3 = frageplan("Privatschutz", formular, { gesendet: "Guten Tag Herr Testlead, … Haben Sie kurz Zeit für zwei Fragen?" });
    expect(v3.gestellt).toBeNull();
    expect(v3.offen.map((f) => f.key)).toEqual(["vorhanden"]);
  });

  it("Prompt: Formularangaben gelten als beantwortet, keine Umformulierungs-Rückfragen, keine Checkliste mit Hund/Pferd", () => {
    const s = buildSystemPrompt({ systemPrompt: "", knowledge: "", personality: "" }, "Privatschutz", {
      qualified: false,
      summary: null,
      contact: { name: "Ole Kannapinn Testlead", phone: "4915100000000", email: "ole@example.com" },
      upcoming: null,
      formAnswers: testLeadAnswers("Privatschutz"),
      advisorName: "Ole Kannapinn",
      person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" },
      aiDisclosed: true,
      ansprache: "sie",
    });
    expect(s).toMatch(/gelten als beantwortet, auch Mehrfachauswahl/);
    expect(s).toMatch(/nie „Worum geht es Ihnen dabei vor allem\?“/);
    expect(s).not.toMatch(/Pflichtangaben für das Angebot/);
    expect(s).not.toMatch(/Hund oder Pferd im Haushalt/);
    expect(s).toContain("In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Ihre Familie kosten und worauf Sie achten sollten.");
    expect(s).toMatch(/Nutze termin_vorschlagen/);
    expect(s).toMatch(/Die E-Mail-Adresse ist bekannt, frag nicht danach/);
    expect(s).toMatch(/Nur Videotermine/);
    expect(s).not.toMatch(/Telefon geht natürlich auch/);
    expect(s).not.toMatch(/bereitet das Gespräch mit seinen Angaben vor/);
  });
});

describe("Terminvorschlag (Nutzen, Vermittler als Person, zwei Videozeiten, kein Link, kein Telefon)", () => {
  const personen = {
    mitAnrede: { name: "Ole Kannapinn", anrede: "Herr" as const },
    ohneAnrede: { name: "Ole Kannapinn", anrede: null },
  };
  for (const produkt of ["Privatschutz", "PKV-Tarifoptimierung", "TKV-Katze", "Hundekrankenversicherung", "Zahnzusatz", "Sterbegeld"]) {
    for (const an of ["sie", "du"] as const) {
      for (const [k, p] of Object.entries(personen)) {
        it(`${produkt}, ${an}, Vermittler ${k}`, () => {
          const person = vermittlerName(an, { ...p, fallback: "Ole Agentur" });
          const t = terminVorschlagText({ an, source: produkt, formular: testLeadAnswers(produkt), person, zeiten: ["heute um 16 Uhr", "morgen um 10 Uhr"] });
          expect(t).toMatchSnapshot();
          expect(t).not.toMatch(/telefon/i);
          expect(t).not.toMatch(/https?:|\/book\//);
          expect(t).not.toMatch(/[–—]/);
          expect(t).not.toMatch(/vorbereit/i);
          expect((t.match(/\?/g) ?? []).length).toBe(1);
        });
      }
    }
  }

  it("Beispiel von Ole wörtlich", () => {
    const t = terminVorschlagText({
      an: "sie",
      source: "Privatschutz",
      formular: testLeadAnswers("Privatschutz"),
      person: vermittlerName("sie", { name: "Ole Kannapinn", anrede: "Herr", fallback: "X" }),
      zeiten: ["heute um 16 Uhr", "morgen um 10 Uhr"],
    });
    expect(t).toBe(
      "Danke! In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Ihre Familie kosten und worauf Sie achten sollten. Passt Ihnen heute um 16 Uhr oder morgen um 10 Uhr?",
    );
    expect(versicherungWort("Haftpflicht, Hausrat, Unfall")).toBe("Haftpflicht-, Hausrat- und Unfallversicherung");
  });

  it("Zeiten kurz: heute, morgen, sonst Wochentag mit Datum", () => {
    const now = new Date("2026-11-17T10:00:00Z");
    expect(zeitKurz(new Date("2026-11-17T15:00:00Z"), now)).toBe("heute um 16 Uhr");
    expect(zeitKurz(new Date("2026-11-18T09:30:00Z"), now)).toBe("morgen um 10:30 Uhr");
    expect(zeitKurz(new Date("2026-11-19T09:00:00Z"), now)).toBe("Donnerstag, 19.11. um 10 Uhr");
  });
});

describe("Folgefragen nach der Buchung (Rechner-Tabelle docs/preise-pilot.md)", () => {
  const src = (formular: { label: string; value: string }[], angaben: Record<string, string> = {}) => ({ formular, angaben });
  const keys = (sparten: RechnerSparte[], s: ReturnType<typeof src>) => folgefragen(sparten, s).map((f) => f.key);

  it("Pflichtfall Ole: Privatschutz, Familie, 80331, Haftpflicht + Hausrat → Geburtsdatum, Wohnfläche, öffentlicher Dienst", () => {
    const formular = testLeadAnswers("Privatschutz");
    const s = src(formular);
    const sparten = spartenDesLeads("Privatschutz", s);
    expect(sparten).toEqual(["haftpflicht", "hausrat"]);
    const fr = folgefragen(sparten, s);
    expect(fr.map((f) => f.key)).toEqual(["geburt", "wohnflaeche", "oeffentlicherDienst"]);
    expect(fr.map((f) => f.sie)).toEqual(["Wie lautet Ihr Geburtsdatum?", "Wie groß ist Ihre Wohnung ungefähr?", "Sind Sie im öffentlichen Dienst tätig?"]);
    expect(fr[2].knoepfe).toEqual(["Ja", "Nein"]);
    expect(folgefrageText(fr[0], "sie", "Herr Kannapinn", true)).toBe("Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: Wie lautet Ihr Geburtsdatum?");
    // Beantwortet im Chat: fällt weg
    expect(keys(sparten, src(formular, { geburt: "14.05.1985", wohnflaeche: "90 m²" }))).toEqual(["oeffentlicherDienst"]);
    expect(keys(sparten, src(formular, { geburt: "14.05.1985", wohnflaeche: "90 m²", beruf: "Angestellt, kein öffentlicher Dienst" }))).toEqual([]);
  });

  it("je Sparte nur berechnungsrelevante, unbekannte Angaben; was der Vermittler festlegt, nie", () => {
    const ort = [{ label: "Postleitzahl", value: "80331" }, { label: "Lebenssituation", value: "Single" }];
    expect(keys(["haftpflicht"], src(ort))).toEqual(["geburt", "oeffentlicherDienst"]);
    expect(keys(["hausrat"], src(ort))).toEqual(["geburt", "wohnflaeche"]);
    expect(keys(["rechtsschutz"], src(ort))).toEqual(["geburt", "lebensbereiche", "beruf"]); // Lebensbereiche braucht der Rechner (P2)
    expect(keys(["unfall"], src(ort))).toEqual(["geburt", "versichern", "beruf"]); // Summen legt der Vermittler fest
    expect(keys(["wohngebaeude"], src(ort))).toEqual(["adresseGebaeude", "gebaeudeFlaeche", "baujahr", "wohneinheiten", "keller", "bauweise"]);
    expect(keys(["wohngebaeude"], src(ort, { plz: "Lindenweg 3, 80331 München", gebaeude: "Bj. 1998, 140 m², Einfamilienhaus, Keller, massiv" }))).toEqual([]);
    expect(keys(["tierhalter-hund"], src(ort))).toEqual(["hunderasse", "hunde"]);
    expect(keys(["katze-kranken"], src(testLeadAnswers("TKV-Katze")))).toEqual([]);
    expect(keys(["hund-kranken"], src(testLeadAnswers("Hundekrankenversicherung")))).toEqual([]);
    // Ohne Tierhalterhaftpflicht im Interesse kein Hund und kein Pferd
    expect(spartenDesLeads("Privatschutz", src([{ label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat" }]))).not.toContain("tierhalter-hund");
    expect(spartenDesLeads("Privatschutz", src([{ label: "Versicherungsinteresse", value: "Tierkrankenversicherung / Tierhalterhaftpflicht" }], { tier: "Hund, Tierhalterhaftpflicht" }))).toEqual(["tierhalter-hund"]);
    // PKV und Zahn: keine Rechner-Tabelle, keine Folgefragen; nie Gesundheitsfragen
    expect(spartenDesLeads("PKV-Tarifoptimierung", src(testLeadAnswers("PKV-Tarifoptimierung")))).toEqual([]);
    expect(spartenDesLeads("Zahnzusatz", src(testLeadAnswers("Zahnzusatz")))).toEqual([]);
    const alle = folgefragen(["haftpflicht", "hausrat", "rechtsschutz", "wohngebaeude", "unfall", "tierhalter-hund", "tierhalter-pferd", "katze-kranken"], src([]));
    for (const f of alle) expect(f.sie).not.toMatch(/krank|gesund|vorerkrank|behandl|selbstbeteilig|summe|tarif/i);
  });
});

describe("Buchungsnachricht und Schluss (kurz, die Adresse am Schluss bestätigen)", () => {
  const person = vermittlerName("sie", { name: "Ole Kannapinn", anrede: "Herr", fallback: "X" });
  const start = new Date("2026-11-18T09:00:00Z");

  it("Buchungsnachricht kurz, ohne Frage (Video mit Link, Telefon ohne)", () => {
    const t = buchungsText({ an: "sie", start, mode: "video", meetUrl: "https://meet.google.com/abc-defg-hij", person });
    expect(t).toBe("Ihr Videotermin ist gebucht: *Mittwoch, 18.11. um 10 Uhr*. Herr Kannapinn hält sich die Zeit nur für Sie frei und bereitet Ihre Beiträge vor.\nIhr Link: https://meet.google.com/abc-defg-hij");
    expect(t).not.toMatch(/\?/);
    expect(buchungsText({ an: "sie", start, mode: "phone", meetUrl: null, person })).toBe(
      "Ihr Telefontermin ist gebucht: *Mittwoch, 18.11. um 10 Uhr*. Herr Kannapinn hält sich die Zeit nur für Sie frei, ruft Sie an und bereitet Ihre Beiträge vor.",
    );
  });

  it("Schluss: Angaben notiert, Bereitlegen in einer Zeile, Adresse bestätigen zuletzt; ohne Adresse freiwillig", () => {
    const sparten: RechnerSparte[] = ["haftpflicht", "hausrat"];
    const ab = abschlussText({ an: "sie", person, bereitlegen: bereitlegenListe("Privatschutz", sparten, "sie"), email: "ole@example.com", nachFragen: true });
    expect(ab).toBe(
      "Danke, damit sind alle wichtigen Angaben für Herrn Kannapinn notiert. Legen Sie zum Termin gern bereit: die Wohnfläche und Ihre IBAN für einen direkten Abschluss.\n\nZum Schluss: Die Einladung mit Kalendereintrag geht an ole@example.com. Stimmt die Adresse?",
    );
    expect((ab.match(/\?/g) ?? []).length).toBe(1);
    const ohne = abschlussText({ an: "du", person: vermittlerName("du", { name: "Ole Kannapinn", anrede: "Herr", fallback: "X" }), bereitlegen: [], email: null, nachFragen: true });
    expect(ohne.endsWith("Zum Schluss: Möchtest du die Einladung mit Kalendereintrag per E-Mail? Dann schreib mir einfach deine Adresse.")).toBe(true);
  });

  it("Prompt nach der Buchung: Fragen in Reihenfolge, Schluss mit Adresse, termin_zugesagt bzw. update_email", () => {
    const r = nachBuchungRegel({ an: "sie", person, fragen: [{ text: "Wie lautet Ihr Geburtsdatum?", feld: "geburt" }], abschlussGesendet: false, zugesagt: false });
    expect(r).toContain("1. „Wie lautet Ihr Geburtsdatum?“ (angaben.geburt)");
    expect(r).toMatch(/Die App schickt die nächste Nachricht selbst/);
    const k = nachBuchungRegel({ an: "sie", person, fragen: [], komplettcheckOffen: true, abschlussGesendet: false, zugesagt: false });
    expect(k).toMatch(/nutze komplettcheck mit ja=true bzw\. ja=false/);
    expect(r).toMatch(/update_email/);
    expect(r).toMatch(/Frag nicht selbst nach der E-Mail-Adresse/);
    // Lebensbereiche werden gefragt, wenn der Rechner sie braucht (P2): kein Widerspruch im Prompt
    expect(r).not.toMatch(/Lebensbereiche/);
    const vor = nachBuchungRegel({ an: "sie", person, fragen: [], komplettcheckGestellt: false, abschlussGesendet: false, zugesagt: false });
    expect(vor).toMatch(/Die App schickt gleich selbst die nächste Frage/);
    const mail = nachBuchungRegel({ an: "sie", person, fragen: [], emailOffen: true, abschlussGesendet: true, zugesagt: false });
    expect(mail).toMatch(/Frage nach der E-Mail-Adresse[\s\S]*update_email/);
    const best = nachBuchungRegel({ an: "sie", person, fragen: [], adresseBestaetigenOffen: true, abschlussGesendet: true, zugesagt: false });
    expect(best).toMatch(/Stimmt|stimmt[\s\S]*termin_zugesagt/);
  });

  it("Bestätigungs-Mail: Kalenderdatei mit Meet-Link", () => {
    const ev = {
      uid: "a@termin",
      start,
      end: new Date(start.getTime() + 30 * 60000),
      summary: "Videotermin mit Ole Kannapinn",
      description: "Link: https://meet.google.com/abc-defg-hij",
      location: "https://meet.google.com/abc-defg-hij",
      manageUrl: "https://app.example/book/manage/t",
      token: "t",
      advisorName: "Ole Kannapinn",
      mode: "video",
      videoUrl: "https://meet.google.com/abc-defg-hij",
    } as CustomerEvent;
    const ics = buildIcs(ev);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("LOCATION:https://meet.google.com/abc-defg-hij");
    expect(ics).not.toContain("deinen");
  });
});
