// Feinschliff der Termin-Strecke (Ole, 17.11.2026): Zeit-Knöpfe mit Payload, Ja/Nein-Knöpfe, Nutzen konkret, Bereitlegen
// höchstens 3 Punkte, Komplettcheck mit Frage nach bestehenden Verträgen, Nachfassen-Fenster, Erstanschreiben v6.
// Rein, ohne Datenbank und ohne LLM.
import { describe, expect, it } from "vitest";
import {
  abschlussEinleitung,
  abschlussText,
  bereitlegenListe,
  buchungsText,
  KALENDER_KNOEPFE,
  knoepfeFuerText,
  knopfZeit,
  KOMPLETTCHECK_KNOEPFE,
  KOMPLETTCHECK_RE,
  komplettcheckFrage,
  MAX_BEREITLEGEN,
  terminKnoepfe,
  terminNachfassText,
  terminNutzenSatz,
  terminVorschlagText,
  vermittlerName,
  vertragsFrage,
  VERTRAGSFRAGE_RE,
  WUNSCHZEIT_REGEL,
} from "@/lib/whatsapp/gespraech";
import { wunschTagAb } from "@/lib/whatsapp/bot";
import { knopfAktion, knopfHinweis } from "@/lib/whatsapp/knopf";
import { folgefragen, spartenDesLeads, type RechnerSparte } from "@/lib/preise/rechner-angaben";
import { testLeadAnswers } from "@/lib/testlead";
import { gaengigeSparten, nochNichtGenannt, normalisiereVertraege, sagtKeine, sparteAus, vertraegeAusText, vertragZeile } from "@/lib/whatsapp/vorvertraege";
import { inSendWindow, TERMIN_NACHFASS_STUNDEN } from "@/lib/lead-sequences";
import { inStreckenFenster } from "@/lib/whatsapp/termin-strecke";
import {
  ERSTANSCHREIBEN_V6,
  ERSTANSCHREIBEN_V7,
  erstanschreibenText,
  erstanschreibenV6Params,
  erstanschreibenV8Params,
  erstanschreibenV9Params,
  erstanschreibenZweck,
  ersteFrage,
  ersteFrageKnoepfe,
  frageOhneFragezeichen,
} from "@/lib/whatsapp/erstanschreiben";
import { ERSTINFO_FOOTER_V9, fillNames, OUTREACH_PURPOSES, rankOutreach, renderTemplate, TEMPLATE_BUTTONS, templateTextFor, type NoticePurpose } from "@/lib/whatsapp/templates";
import { buildTemplateRequest, metaTemplateProblems, plannedTemplates, templateNameFor } from "@/lib/whatsapp/template-plan";
import type { Ansprache } from "@/lib/ansprache";

const NOW = new Date("2026-11-17T10:00:00Z"); // Dienstag, 11 Uhr deutscher Zeit
const PERSON = vermittlerName("sie", { name: "Ole Kannapinn", anrede: "Herr", fallback: "Ole Agentur" });
const PERSON_DU = vermittlerName("du", { name: "Ole Kannapinn", anrede: "Herr", fallback: "Ole Agentur" });

describe("Zeit-Knöpfe zum Terminvorschlag", () => {
  const s1 = "2026-11-17T15:00:00.000Z";
  const s2 = "2026-11-18T09:00:00.000Z";

  it("„Heute 16 Uhr“, „Morgen 10 Uhr“, „Andere Zeit“; Payload trägt die Startzeit; höchstens 20 Zeichen", () => {
    const k = terminKnoepfe([s1, s2], NOW);
    expect(k).toEqual([
      { id: `slot:${s1}`, title: "Heute 16 Uhr" },
      { id: `slot:${s2}`, title: "Morgen 10 Uhr" },
      { id: "andere_zeit", title: "Andere Zeit" },
    ]);
    expect(knopfZeit(new Date("2026-11-19T09:30:00Z"), NOW)).toMatch(/^Do\.? 19\.11\. 10:30 Uhr$/);
    for (const iso of ["2026-11-21T08:30:00Z", "2026-11-23T17:45:00Z", "2026-12-24T11:15:00Z"]) expect(knopfZeit(new Date(iso), NOW).length).toBeLessThanOrEqual(20);
  });

  it("Payload → Aktion: genau diese Zeit (zum Buchen), „Andere Zeit“, nie über den Knopftext geraten", () => {
    expect(knopfAktion("interactive", "Heute 16 Uhr", `slot:${s1}`)).toEqual({ aktion: "zeit", start: s1 });
    expect(knopfAktion("interactive", "Andere Zeit", "andere_zeit")).toEqual({ aktion: "andere_zeit" });
    expect(knopfAktion("interactive", "Heute 16 Uhr", "slot:kaputt")).toEqual({ aktion: "zeit", start: null });
    // getippt statt geklickt: kein Knopf
    expect(knopfAktion("text", "Heute 16 Uhr", null)).toBeNull();
    const hint = knopfHinweis({ aktion: "zeit", start: s1 }, NOW)!;
    expect(hint).toContain(`start=${s1}`);
    expect(hint).toMatch(/book_appointment \(modus video\)/);
    expect(knopfHinweis({ aktion: "andere_zeit" }, NOW)).toMatch(/termin_vorschlagen mit erneut=true/);
  });

  it("Komplettcheck, Kalender und Ja/Nein am Payload; „Nein, danke“ mit Payload ist kein „Kein Bedarf“", () => {
    expect(knopfAktion("interactive", "Ja, gern", "komplettcheck:ja")).toEqual({ aktion: "komplettcheck", ja: true });
    expect(knopfAktion("interactive", "Nein, danke", "komplettcheck:nein")).toEqual({ aktion: "komplettcheck", ja: false });
    expect(knopfAktion("interactive", "Nein, danke", "Nein, danke")).toEqual({ aktion: "kein_bedarf" });
    expect(knopfAktion("interactive", "Ja", "kalender:ja")).toEqual({ aktion: "kalender", art: "ja" });
    // Frage nach dem Kalendereintrag (Ole, 18.11.2026)
    expect(knopfAktion("interactive", "Ja, eingetragen", "eingetragen:ja")).toEqual({ aktion: "eingetragen", ja: true });
    expect(knopfAktion("interactive", "Nein, bitte nochmal", "eingetragen:nein")).toEqual({ aktion: "eingetragen", ja: false });
    expect(knopfAktion("text", "Nein, bitte nochmal", null)).toBeNull();
    expect(knopfAktion("interactive", "Mache ich gleich", "kalender:gleich")).toEqual({ aktion: "kalender", art: "gleich" });
    expect(knopfAktion("interactive", "Nein", "folge:oeffentlicherDienst:nein")).toEqual({ aktion: "folge", key: "oeffentlicherDienst", wert: "Nein" });
    expect(knopfHinweis({ aktion: "folge", key: "oeffentlicherDienst", wert: "Nein" }, NOW)).toMatch(/öffentlicher Dienst.*record_qualification/);
  });

  it("Terminvorschlag: Nutzen konkret, kurze Sätze, genau eine Frage, kein „doppelt zahlen“, keine Versprechen", () => {
    const t = terminVorschlagText({ an: "sie", source: "Privatschutz", formular: testLeadAnswers("Privatschutz"), person: PERSON, zeiten: ["heute um 16 Uhr", "morgen um 10 Uhr"] });
    expect(t).toBe(
      "Danke! In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Ihre Familie kosten und worauf Sie achten sollten. Passt Ihnen heute um 16 Uhr oder morgen um 10 Uhr?",
    );
    const erneut = terminVorschlagText({ an: "sie", source: "Privatschutz", formular: [], person: PERSON, zeiten: ["Donnerstag, 19.11. um 10 Uhr", "Freitag, 20.11. um 14 Uhr"], erneut: true });
    expect(erneut).toBe("Passt Ihnen Donnerstag, 19.11. um 10 Uhr oder Freitag, 20.11. um 14 Uhr?");
    for (const produkt of ["Privatschutz", "Hausratversicherung", "Unfallversicherung", "TKV-Katze", "Hundekrankenversicherung", "Zahnzusatz", "PKV-Tarifoptimierung", "PKV Wechsel", "Sterbegeld"]) {
      for (const an of ["sie", "du"] as const) {
        const n = terminNutzenSatz({ source: produkt, formular: testLeadAnswers(produkt), an, person: an === "du" ? PERSON_DU : PERSON });
        const was = `${produkt} ${an}`;
        expect(n, was).toMatchSnapshot();
        expect(n, was).not.toMatch(/doppelt|sparen|günstig|garant|versprech|beste|[–—]/i);
        expect(n, was).not.toMatch(/\?/);
        expect(n.startsWith("In einem kurzen Videotermin"), was).toBe(true);
        if (an === "du") expect(n, was).not.toMatch(/\b(Sie|Ihnen|Ihre?n?)\b/);
      }
    }
    // Familie, Paar, allein; Interesse aus dem Chat, wenn das Formular nichts sagt
    const nutzen = (formular: { label: string; value: string }[], angaben?: unknown) => terminNutzenSatz({ source: "Privatschutz", formular, angaben, an: "sie", person: PERSON });
    expect(nutzen([{ label: "Versicherungsinteresse", value: "Haftpflicht" }, { label: "Lebenssituation", value: "Paar" }])).toContain("was Haftpflicht für Sie beide kostet");
    expect(nutzen([], { interesse: "Hausrat, Unfall", versichern: "nur ich" })).toContain("was Hausrat und Unfall für Sie kosten");
  });

  it("Nachfassen nach 2 Std.: kurz, gleiche Zeiten, Vermittler im Dativ", () => {
    expect(terminNachfassText("sie", PERSON, ["heute um 16 Uhr", "morgen um 10 Uhr"])).toBe("Kurze Nachfrage: Passt Ihnen heute um 16 Uhr oder morgen um 10 Uhr für den Videotermin mit Herrn Kannapinn?");
    expect(terminNachfassText("du", PERSON_DU, ["heute um 16 Uhr", "morgen um 10 Uhr"])).toBe("Kurze Nachfrage: Passt dir heute um 16 Uhr oder morgen um 10 Uhr für den Videotermin mit Ole?");
  });
});

describe("Nachfassen: Zeitfenster Mo bis Sa 8 bis 20 Uhr", () => {
  const at = (iso: string) => new Date(iso);
  it("Termin-Nachfassen 8 bis 20 Uhr, sonst Abfolgen 9 bis 19 Uhr; sonntags nie", () => {
    // 17.11.2026 ist ein Dienstag; MEZ = UTC+1
    expect(inSendWindow(at("2026-11-17T07:30:00Z"), TERMIN_NACHFASS_STUNDEN)).toBe(true); // 8:30
    expect(inSendWindow(at("2026-11-17T07:30:00Z"))).toBe(false);
    expect(inSendWindow(at("2026-11-17T06:59:00Z"), TERMIN_NACHFASS_STUNDEN)).toBe(false); // 7:59
    expect(inSendWindow(at("2026-11-17T18:30:00Z"), TERMIN_NACHFASS_STUNDEN)).toBe(true); // 19:30
    expect(inSendWindow(at("2026-11-17T19:00:00Z"), TERMIN_NACHFASS_STUNDEN)).toBe(false); // 20:00
    expect(inSendWindow(at("2026-11-21T10:00:00Z"), TERMIN_NACHFASS_STUNDEN)).toBe(true); // Samstag
    expect(inSendWindow(at("2026-11-22T10:00:00Z"), TERMIN_NACHFASS_STUNDEN)).toBe(false); // Sonntag
    expect(inStreckenFenster(at("2026-11-17T07:30:00Z"))).toBe(true);
    expect(inStreckenFenster(at("2026-11-22T10:00:00Z"))).toBe(false);
  });
});

describe("Ja/Nein-Angaben der Rechner-Tabelle als Knöpfe", () => {
  it("öffentlicher Dienst und Keller mit „Ja“/„Nein“, ohne „(ja oder nein)“ im Text", () => {
    const fr = folgefragen(["haftpflicht", "wohngebaeude"], { formular: [], angaben: {} });
    const od = fr.find((f) => f.key === "oeffentlicherDienst")!;
    expect(od.sie).toBe("Sind Sie im öffentlichen Dienst tätig?");
    expect(od.knoepfe).toEqual(["Ja", "Nein"]);
    expect(fr.find((f) => f.key === "keller")?.knoepfe).toEqual(["Ja", "Nein"]);
    expect(fr.find((f) => f.key === "geburt")?.knoepfe).toBeUndefined();
    for (const f of fr) expect(f.sie).not.toMatch(/ja oder nein/i);
    expect(knoepfeFuerText("Danke! Sind Sie im öffentlichen Dienst tätig?", fr)).toEqual([
      { id: "folge:oeffentlicherDienst:ja", title: "Ja" },
      { id: "folge:oeffentlicherDienst:nein", title: "Nein" },
    ]);
    expect(knoepfeFuerText("Wie lautet Ihr Geburtsdatum?", fr)).toBeNull();
    expect(knoepfeFuerText("… *Haben Sie sich den Termin schon im Kalender eingetragen?*", fr)).toBe(KALENDER_KNOEPFE);
    expect(knoepfeFuerText(komplettcheckFrage("sie", PERSON, false), fr)).toBe(KOMPLETTCHECK_KNOEPFE);
  });
});

describe("Bereitlegen: höchstens 3 Punkte, nichts doppelt", () => {
  const produkte = ["Privatschutz", "Hausratversicherung", "Rechtsschutzversicherung", "Wohngebäudeversicherung", "Unfallversicherung", "TKV-Katze", "Hundekrankenversicherung", "Zahnzusatz", "PKV-Tarifoptimierung", "Sterbegeld"];
  for (const produkt of produkte) {
    for (const komplettcheck of [false, true]) {
      it(`${produkt}${komplettcheck ? " mit Komplettcheck" : ""}`, () => {
        const quelle = { formular: testLeadAnswers(produkt), angaben: {} };
        const sparten = spartenDesLeads(produkt, quelle);
        for (const an of ["sie", "du"] as const) {
          const l = bereitlegenListe(produkt, sparten, an, { quelle, komplettcheck });
          expect(l.length, produkt).toBeLessThanOrEqual(MAX_BEREITLEGEN);
          expect(new Set(l).size).toBe(l.length);
          for (const x of l) expect(x).not.toMatch(/[–—]/);
          // P2: „bestehende Verträge und Policen“ nur bei Komplettcheck, dann oben; IBAN zuletzt
          if (komplettcheck) expect(l[0]).toMatch(/bestehenden Verträge und Policen/);
          else expect(l.join(" ")).not.toMatch(/bestehenden Verträge|bisherigen Policen/);
        }
      });
    }
  }

  it("Privatschutz: Wohnfläche nur, falls nicht schon erfragt, Geburtsdaten bei Familie, IBAN; Verträge nur mit Komplettcheck; nie mehr als 3", () => {
    const sparten: RechnerSparte[] = ["haftpflicht", "hausrat"];
    const GEB = "die Geburtsdaten aller Personen, die mitversichert werden sollen";
    const IBAN = "Ihre IBAN, falls Sie direkt abschließen möchten";
    const offen = bereitlegenListe("Privatschutz", sparten, "sie", { quelle: { formular: testLeadAnswers("Privatschutz"), angaben: {} } });
    expect(offen).toEqual(["die Wohnfläche Ihrer Wohnung", GEB, IBAN]);
    const erfragt = bereitlegenListe("Privatschutz", sparten, "sie", { quelle: { formular: testLeadAnswers("Privatschutz"), angaben: { wohnflaeche: "90 m²" } } });
    expect(erfragt).toEqual([GEB, IBAN]);
    // Geburtsdaten bei Familie für alle Sparten (nicht nur Unfall), ohne Familie nicht
    expect(bereitlegenListe("Privatschutz", ["haftpflicht"], "sie", { quelle: { formular: testLeadAnswers("Privatschutz"), angaben: {} } })).toEqual([GEB, IBAN]);
    expect(bereitlegenListe("Privatschutz", ["haftpflicht"], "sie", { quelle: { formular: [{ label: "Lebenssituation", value: "Single" }], angaben: {} } })).toEqual([IBAN]);
    expect(bereitlegenListe("Privatschutz", ["haftpflicht"], "sie", { quelle: { formular: testLeadAnswers("Privatschutz"), angaben: {} }, komplettcheck: true })).toEqual(["Ihre bestehenden Verträge und Policen", GEB, IBAN]);
    const viele = bereitlegenListe("Privatschutz", ["haftpflicht", "hausrat", "unfall", "wohngebaeude", "tierhalter-hund"], "sie", { quelle: { formular: [{ label: "Lebenssituation", value: "Familie mit Kindern" }], angaben: {} } });
    expect(viele).toHaveLength(3);
  });
});

describe("Buchung, Komplettcheck und Abschluss", () => {
  it("Buchungsnachricht kurz, ohne Frage, ohne erfundene Knappheit (Sie und Du)", () => {
    const t = buchungsText({ an: "sie", start: new Date("2026-11-18T09:00:00Z"), mode: "video", meetUrl: "https://meet.google.com/abc-defg-hij", person: PERSON });
    expect(t).toBe("Ihr Videotermin ist gebucht: *Mittwoch, 18.11. um 10 Uhr*. Herr Kannapinn hält sich die Zeit nur für Sie frei und bereitet Ihre Beiträge vor.\nIhr Link: https://meet.google.com/abc-defg-hij");
    expect(t).not.toMatch(/\?|nur noch|knapp|letzte|[–—]/);
    const du = buchungsText({ an: "du", start: new Date("2026-11-18T09:00:00Z"), mode: "video", meetUrl: "https://meet.google.com/x", person: PERSON_DU });
    expect(du).toBe("Dein Videotermin ist gebucht: *Mittwoch, 18.11. um 10 Uhr*. Ole hält sich die Zeit nur für dich frei und bereitet deine Beiträge vor.\nDein Link: https://meet.google.com/x");
  });

  it("Komplettcheck: Sie, Familie, Du (Fassung a bisher, b neu mit „doppelt zahlen und sparen“)", () => {
    // Fassung a (bisher) im Splittest komplettcheck_text
    expect(komplettcheckFrage("sie", PERSON, true, "a")).toBe(
      "Danke! Soll Herr Kannapinn im Termin auch kurz schauen, ob Sie und Ihre Familie insgesamt gut abgesichert sind und wo Sie vielleicht etwas sparen können? Das dauert nur ein paar Minuten länger.",
    );
    expect(komplettcheckFrage("du", PERSON_DU, false, "a")).toBe(
      "Danke! Soll Ole im Termin auch kurz schauen, ob du insgesamt gut abgesichert bist und wo du vielleicht etwas sparen kannst? Das dauert nur ein paar Minuten länger.",
    );
    // Fassung b (Standard, Ole 19.11.2026): Leitmotiv doppelt zahlen und sparen, „können“ statt Versprechen, kostenlos
    expect(komplettcheckFrage("sie", PERSON, false)).toBe(
      "Danke! Oft zahlen Menschen für dieselbe Absicherung doppelt. Soll Herr Kannapinn im Termin kurz drüberschauen, wo Sie vielleicht doppelt zahlen und sparen können? Kostenlos und nur ein paar Minuten länger.",
    );
    expect(komplettcheckFrage("sie", PERSON, true)).toContain("wo Sie und Ihre Familie vielleicht doppelt zahlen und sparen können?");
    expect(komplettcheckFrage("du", PERSON_DU, false)).toBe(
      "Danke! Oft zahlen Menschen für dieselbe Absicherung doppelt. Soll Ole im Termin kurz drüberschauen, wo du vielleicht doppelt zahlst und sparen kannst? Kostenlos und nur ein paar Minuten länger.",
    );
    expect(komplettcheckFrage("du", PERSON_DU, true)).toContain("wo ihr als Familie vielleicht doppelt zahlt und sparen könnt?");
    for (const v of ["a", "b"] as const)
      for (const an of ["sie", "du"] as const)
        for (const fam of [true, false]) {
          const t = komplettcheckFrage(an, an === "du" ? PERSON_DU : PERSON, fam, v);
          expect((t.match(/\?/g) ?? []).length).toBe(1);
          expect(t).toMatch(KOMPLETTCHECK_RE);
          expect(t).not.toMatch(/[–—]|werden Sie sparen|garantiert|Minuten? länger als|\d+ ?Min/);
        }
    expect(KOMPLETTCHECK_KNOEPFE.map((k) => k.title)).toEqual(["Ja, gern", "Nein, danke"]);
    expect(KALENDER_KNOEPFE.map((k) => k.title)).toEqual(["Ja", "Mache ich gleich"]);
  });

  it("Vertragsfrage nach „Ja, gern“ (Sie, Familie, Du)", () => {
    expect(vertragsFrage("sie", false)).toBe(
      "Super! Welche Versicherungen haben Sie heute schon? Zum Beispiel Haftpflicht, Hausrat, Unfall, Berufsunfähigkeit, Rechtsschutz, Kfz, Kranken- oder Lebensversicherung und Altersvorsorge. Gern auch mit Versicherer.",
    );
    expect(vertragsFrage("sie", true)).toContain("Welche Versicherungen haben Sie und Ihre Familie heute schon?");
    expect(vertragsFrage("du", false)).toContain("Welche Versicherungen hast du heute schon?");
    for (const t of [vertragsFrage("sie", true), vertragsFrage("du", true), vertragsFrage("du", false)]) {
      expect(t).toMatch(VERTRAGSFRAGE_RE);
      expect(t).not.toMatch(/gesund|[–—]/i);
    }
  });

  it("Schluss nach den Verträgen: Bereitlegen in einer Zeile (Verträge zuerst), Adresse zuletzt", () => {
    const ab = abschlussText({
      an: "sie",
      person: PERSON,
      bereitlegen: bereitlegenListe("Privatschutz", ["haftpflicht", "hausrat"], "sie", { quelle: { formular: testLeadAnswers("Privatschutz"), angaben: { wohnflaeche: "90" } }, komplettcheck: true }),
      email: "julia@example.com",
      nachFragen: true,
      einleitung: abschlussEinleitung("sie", PERSON, "vertraege"),
    });
    expect(ab).toBe(
      "Danke, das schaut sich Herr Kannapinn im Termin mit an. Legen Sie zum Termin gern bereit: Ihre bestehenden Verträge, die Geburtsdaten der Mitversicherten und Ihre IBAN für einen direkten Abschluss.\n\n" +
        "Zum Schluss: Die Einladung mit Kalendereintrag geht an julia@example.com. Stimmt die Adresse?",
    );
    expect((ab.match(/\?/g) ?? []).length).toBe(1);
    expect(knoepfeFuerText(ab)?.map((k) => k.id)).toEqual(["email:ja", "email:andere"]);
  });
});

describe("Bestehende Verträge (KI-Extraktion tolerant, Rückfall per Muster)", () => {
  it("Sparten tolerant erkennen, nur Sparte, Gesellschaft, Person; Unbekanntes und Gesundheit fallen weg", () => {
    expect(sparteAus("PHV")).toBe("Haftpflicht");
    expect(sparteAus("BU")).toBe("Berufsunfähigkeit");
    expect(sparteAus("Autoversicherung")).toBe("Kfz");
    expect(sparteAus("Hundehaftpflicht")).toBe("Tierhalterhaftpflicht");
    expect(sparteAus("Riester")).toBe("Altersvorsorge");
    expect(sparteAus("Bausparvertrag")).toBe("Altersvorsorge");
    const n = normalisiereVertraege([
      { sparte: "Haftpflicht", gesellschaft: "HUK", fuer: "Familie" },
      { sparte: "Haftpflicht", gesellschaft: "HUK", fuer: "Familie" },
      { sparte: "Kfz", gesellschaft: "-" },
      { sparte: "Bluthochdruck" },
      { sparte: "Hausrat", diagnose: "Rückenschmerzen" },
    ]);
    expect(n).toEqual([
      { sparte: "Haftpflicht", gesellschaft: "HUK", fuer: "Familie" },
      { sparte: "Hausrat", gesellschaft: null, fuer: null },
      { sparte: "Kfz", gesellschaft: null, fuer: null },
    ]);
    expect(JSON.stringify(n)).not.toMatch(/Rücken|Blut/);
    expect(vertragZeile(n[0])).toBe("Haftpflicht (HUK, für Familie)");
  });

  it("Rückfall ohne KI: „Haftpflicht bei der HUK, Hausrat und eine BU“", () => {
    expect(vertraegeAusText("Haftpflicht bei der HUK, Hausrat und eine BU").map((v) => [v.sparte, v.gesellschaft])).toEqual([
      // bekannte Versicherer mit vollem Namen (Ole, 19.11.2026: auch Kurzformen und Tippfehler erkennen)
      ["Haftpflicht", "HUK-Coburg"],
      ["Hausrat", null],
      ["Berufsunfähigkeit", null],
    ]);
    expect(sagtKeine("Keine")).toBe(true);
    expect(sagtKeine("noch nichts")).toBe(true);
    expect(sagtKeine("keine BU, aber Haftpflicht")).toBe(false);
  });

  it("noch nicht genannt: gängige Sparten der Lebenssituation, neutral, nur wenn der Lead geantwortet hat", () => {
    expect(gaengigeSparten("Familie mit Kindern")).toEqual(["Haftpflicht", "Hausrat", "Berufsunfähigkeit", "Altersvorsorge", "Unfall", "Risikoleben"]);
    const v = { at: "", liste: normalisiereVertraege([{ sparte: "Haftpflicht" }, { sparte: "Kfz" }]) };
    expect(nochNichtGenannt(v, "Familie mit Kindern")).toEqual(["Hausrat", "Berufsunfähigkeit", "Altersvorsorge", "Unfall", "Risikoleben"]);
    expect(nochNichtGenannt(v, "Single")).toEqual(["Hausrat", "Berufsunfähigkeit", "Altersvorsorge"]);
    expect(nochNichtGenannt({ at: "", liste: [] }, "Single")).toEqual([]);
    expect(nochNichtGenannt({ at: "", liste: [], keine: true }, "Single")).toEqual(["Haftpflicht", "Hausrat", "Berufsunfähigkeit", "Altersvorsorge"]);
  });
});

// ─── Erstanschreiben v6 (Ole, 17.11.2026) ───────────────────────────────────────────────────────

const PRODUKTE = ["Privatschutz", "Hausratversicherung", "TKV-Katze", "Hundekrankenversicherung", "Pferdeversicherung", "Zahnzusatz", "PKV-Tarifoptimierung", "PKV Wechsel", "Sterbegeld", null];
const LAGEN: Record<string, (p: string | null) => { label: string; value: string }[]> = {
  leer: () => [],
  teilweise: (p) => testLeadAnswers(p ?? "Sterbegeld").slice(0, 1),
  vollstaendig: (p) => testLeadAnswers(p ?? "Sterbegeld"),
};

describe("Erstanschreiben v9 (vorher v8): Text und Parameter", () => {
  it("v6/v7 bleiben als Konstanten (Rückfall bis zur Freigabe), v9 eine Zeile mit festem Thema und fetter Frage", () => {
    // v6 und v7 bleiben unverändert (bei Meta freigegeben, werden bis zur Freigabe neuerer Fassungen gesendet)
    expect(ERSTANSCHREIBEN_V6.sie).toBe("danke für Ihre Anfrage zum Thema {{2}}! Ich bin der digitale KI-Assistent von {{3}}.\n\n*{{4}}?*");
    expect(ERSTANSCHREIBEN_V7.sie).toBe("danke für Ihre Anfrage zum Thema {{2}}! Ich bin der digitale KI-Assistent von {{3}}.\n\n{{4}}?");
    expect(ERSTANSCHREIBEN_V7.du).toBe("danke für deine Anfrage zum Thema {{2}}! Ich bin der digitale KI-Assistent von {{3}}.\n\n{{4}}?");
    expect(templateTextFor("outreach_privatschutz", "sie")).toBe("Hallo {{1}}, danke für Ihre Anfrage zum Privatschutz! *{{2}}?*");
    expect(templateTextFor("outreach_privatschutz", "sie_ohne_name")).toBe("Hallo, danke für Ihre Anfrage zum Privatschutz! *{{1}}?*");
    expect(templateTextFor("outreach", "du")).toBe("Hallo {{1}}, danke für deine Anfrage! *{{2}}?*");
    expect(templateTextFor("outreach_tkv", "sie")).toBe("Hallo {{1}}, schön, dass Sie {{2}} gut absichern möchten 🐾 *{{3}}?*");
  });

  it("Beispiel Privatschutz, Sie, Lead ohne Anrede, Formular mit Interesse", () => {
    const t = erstanschreibenText({
      an: "sie",
      kontakt: { fullName: "Julia Schneider" },
      name: "Ole",
      vermittler: "Herrn Kannapinn",
      source: "Privatschutz",
      formular: [{ label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat" }],
    });
    expect(t).toBe("Hallo Frau Schneider, danke für Ihre Anfrage zum Privatschutz! *Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu?*\n\n_KI-Assistent · Erstinformation folgt als PDF_");
  });

  it("Parameter je Lage: Formular leer, teilweise, vollständig (Privatschutz, Sie)", () => {
    const p = (formular: { label: string; value: string }[]) => erstanschreibenV6Params({ source: "Privatschutz", an: "sie", formular, person: PERSON, kurz: "Ole" });
    // v8 (Ole, 17.11.2026): Privatschutz fragt zuerst nach bestehenden Verträgen (Privatschutz = Haftpflicht und Hausrat)
    expect(p([])).toEqual(["Privatschutz", "Herrn Kannapinn", "Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu"]);
    expect(p([{ label: "Versicherungsinteresse", value: "Hausrat" }])).toEqual(["Privatschutz", "Herrn Kannapinn", "Sind Sie bei Hausrat schon versichert, oder wäre es neu"]);
    expect(p(testLeadAnswers("Privatschutz"))).toEqual(["Privatschutz", "Herrn Kannapinn", "Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu"]);
    // alles beantwortet: Terminfrage (Video) mit dem Vermittler im Dativ
    const alles = [...testLeadAnswers("Privatschutz"), { label: "Bereits versichert", value: "nein" }];
    expect(p(alles)[2]).toBe("Passt Ihnen ein kurzer Videotermin mit Herrn Kannapinn in den nächsten Tagen");
    // Du: Vorname des Vermittlers; Thema im Nominativ
    expect(erstanschreibenV6Params({ source: "PKV Wechsel", an: "du", formular: [], person: PERSON_DU, kurz: "Ole" })).toEqual(["private Krankenversicherung", "Ole", "Wie bist du aktuell beruflich aufgestellt"]);
    expect(erstanschreibenV6Params({ source: null, an: "sie", formular: [], person: PERSON, kurz: "Ole" })).toEqual(["Versicherung", "Herrn Kannapinn", "Wann erreicht Herr Kannapinn Sie am besten für ein kurzes Telefonat"]);
  });

  for (const source of PRODUKTE) {
    for (const [lage, formular] of Object.entries(LAGEN)) {
      it(`${source ?? "ohne Produkt"}, Formular ${lage}: jede erste Frage endet auf „?“, Vorlage ohne „??“; Freitext gleich der Vorlage v9 (plus KI-Zeile)`, () => {
        for (const an of ["sie", "du"] as const) {
          for (const kontakt of [{ fullName: "Julia Schneider", salutation: "Frau" as const }, { fullName: "Julia" }]) {
            const person = an === "du" ? PERSON_DU : PERSON;
            const f = formular(source);
            // Vorlage je Produkt, nur Hausrat angefragt: outreach_hausrat (Ole, 18.11.2026)
            const purpose: NoticePurpose = erstanschreibenZweck(source, f);
            const frage = ersteFrage(source, an, "Ole", f, person);
            expect(frage.endsWith("?"), frage).toBe(true);
            const params = erstanschreibenV9Params({ source, an, formular: f, person, kurz: "Ole" });
            expect(params.at(-1)!.endsWith("?")).toBe(false);
            expect(params).toHaveLength(purpose === "outreach_tkv" ? 2 : 1);
            // gleiche erste Frage wie in den Rückfall-Fassungen v8 und v6/v7
            expect(erstanschreibenV8Params({ source, an, formular: f, person, kurz: "Ole" })[1]).toBe(params.at(-1));
            expect(erstanschreibenV6Params({ source, an, formular: f, person, kurz: "Ole" })[2]).toBe(params.at(-1));
            const mitName = an === "du" || kontakt.salutation;
            const name = an === "du" ? "Julia" : "Frau Schneider";
            const tpl = renderTemplate(fillNames(templateTextFor(purpose, mitName ? an : "sie_ohne_name"), "X"), mitName ? [name, ...params] : params);
            expect(tpl).not.toContain("??");
            expect(tpl).not.toMatch(/[–—]/);
            expect(tpl.endsWith(` *${frage}*`)).toBe(true);
            expect(tpl).not.toContain("\n");
            const o = { an, kontakt, name: "Ole", vermittler: person.dat, vermittlerNom: person.nom, source, formular: f };
            const frei = erstanschreibenText(o, { ohneFuss: true });
            // Freitext wie die Vorlage (ohne Produkt mit dem Produktnamen), darunter die KI-Kennzeichnung der Fußzeile
            const ohneThema = frei.replace(/ zum Thema [^!]+!/, "!");
            expect(purpose === "outreach" ? ohneThema : frei, `${source} ${an}`).toBe(tpl);
            expect(erstanschreibenText(o)).toBe(`${frei}\n\n_KI-Assistent · Erstinformation folgt als PDF_`);
            if (an === "du") expect(tpl).not.toMatch(/\b(Sie|Ihnen|Ihre?)\b/);
          }
        }
      });
    }
  }

  it("frageOhneFragezeichen schneidet nur das letzte „?“ ab", () => {
    expect(frageOhneFragezeichen("Wie alt ist Ihre Katze?")).toBe("Wie alt ist Ihre Katze");
    expect(frageOhneFragezeichen("Wie alt ist Ihre Katze??  ")).toBe("Wie alt ist Ihre Katze");
    expect(frageOhneFragezeichen("Wann passt es Ihnen")).toBe("Wann passt es Ihnen");
  });

  it("Knöpfe im Freitext nur zur passenden Frage; v6-Vorlage ohne Knöpfe", () => {
    // v8: Privatschutz öffnet mit der Frage nach bestehenden Verträgen (ohne Knöpfe)
    expect(ersteFrageKnoepfe("Privatschutz", [])).toEqual([]);
    expect(ersteFrageKnoepfe("PKV Wechsel", [])).toEqual(["Angestellt", "Selbstständig", "Beamter"]);
    expect(ersteFrageKnoepfe(null, [])).toEqual(["Heute", "Morgen", "Lieber schriftlich"]);
    for (const p of OUTREACH_PURPOSES) expect(TEMPLATE_BUTTONS[p]).toBeUndefined();
  });
});

describe("Erstanschreiben v9: Einreichung, Auswahl und Erstinformation (Live-Test 17.11.2026)", () => {
  const names = { firm: "Agentur Ole Kannapinn", advisor: "Ole Kannapinn", kurz: "Ole" };

  it("v9 je Fassung nur mit PDF-Kopf (keine _ohnepdf mehr), Meta-Regeln erfüllt, Kategorie Marketing", () => {
    const geplant = plannedTemplates([...OUTREACH_PURPOSES]);
    expect(geplant).toHaveLength(OUTREACH_PURPOSES.length * 3);
    for (const { purpose, form, variant, kopf } of geplant) {
      expect(kopf).toBe(true);
      const req = buildTemplateRequest(purpose, names, undefined, form, { variant, documentExample: "https://x.de/erstinformation/abc/pdf", kopf });
      expect(req.name).toBe(templateNameFor(purpose, undefined, form, variant, kopf));
      expect(req.name).toMatch(/_v9(_sie(_ohne_name)?)?$/);
      expect(req.category).toBe("MARKETING");
      const comps = req.components as { type: string; text?: string; example?: { body_text: string[][] } }[];
      expect(comps.map((c) => c.type)).toEqual(["HEADER", "BODY", "FOOTER"]);
      const body = comps.find((c) => c.type === "BODY")!;
      expect(metaTemplateProblems(body.text!, body.example?.body_text[0] ?? []), `${req.name}: ${body.text}`).toEqual([]);
      expect(body.text).not.toContain("Assistent");
      expect(comps.find((c) => c.type === "FOOTER")!.text).toBe(ERSTINFO_FOOTER_V9);
      expect(body.example!.body_text[0].at(-1)!.endsWith("?")).toBe(false);
    }
  });

  const tpl = (name: string, purpose: NoticePurpose, header: boolean, body: string) => ({ name, purpose, body, headerFormat: header ? "DOCUMENT" : null });
  const V5 = "Hallo {{1}}, danke für Ihre Anfrage zum Thema {{2}}!\nIch bin der digitale KI-Assistent von Ole …\n\n*Worum geht es Ihnen vor allem?*";
  const V5_OHNE = "Hallo, danke für Ihre Anfrage zum Thema {{1}}! …";
  const V6 = { du: `Hallo {{1}}, ${ERSTANSCHREIBEN_V6.du}`, sie: `Hallo {{1}}, ${ERSTANSCHREIBEN_V6.sie}`, ohne: "Hallo, danke für Ihre Anfrage zum Thema {{1}}! Ich bin der digitale KI-Assistent von {{2}}.\n\n*{{3}}?*" };
  const P: NoticePurpose[] = ["outreach_privatschutz", "outreach"];
  const freigegebenV5 = [tpl("pg_outreach_privatschutz_v5_sie", "outreach_privatschutz", true, V5), tpl("pg_outreach_privatschutz_v5_sie_ohne_name", "outreach_privatschutz", true, V5_OHNE)];
  const v6 = [
    tpl("pg_outreach_privatschutz_v6_sie", "outreach_privatschutz", true, V6.sie),
    tpl("pg_outreach_privatschutz_v6_ohnepdf_sie", "outreach_privatschutz", false, V6.sie),
    tpl("pg_outreach_privatschutz_v6_sie_ohne_name", "outreach_privatschutz", true, V6.ohne),
  ];
  const pick = (list: ReturnType<typeof tpl>[], an: Ansprache, kontakt: { fullName: string; salutation?: "Herr" | "Frau" }, pdf: "vollstaendig" | "entwurf" | "keins") => {
    const r = rankOutreach(list, P, an, kontakt, { pdf });
    return r && "tpl" in r ? [r.tpl.name, r.dokument] : r;
  };

  it("solange v6 nicht freigegeben ist, geht v5 raus; danach v6 mit PDF; v7 sobald freigegeben", () => {
    expect(pick(freigegebenV5, "sie", { fullName: "Julia Schneider", salutation: "Frau" }, "vollstaendig")).toEqual(["pg_outreach_privatschutz_v5_sie", "vollstaendig"]);
    const beide = [...freigegebenV5, ...v6];
    expect(pick(beide, "sie", { fullName: "Julia Schneider", salutation: "Frau" }, "vollstaendig")).toEqual(["pg_outreach_privatschutz_v6_sie", "vollstaendig"]);
    expect(pick(beide, "sie", { fullName: "Julia" }, "vollstaendig")).toEqual(["pg_outreach_privatschutz_v6_sie_ohne_name", "vollstaendig"]);
    const mitV7 = [...beide, tpl("pg_outreach_privatschutz_v7_sie", "outreach_privatschutz", true, templateTextFor("outreach_privatschutz", "sie"))];
    expect(pick(mitV7, "sie", { fullName: "Julia Schneider", salutation: "Frau" }, "vollstaendig")).toEqual(["pg_outreach_privatschutz_v7_sie", "vollstaendig"]);
    const r = rankOutreach(beide, P, "sie", { fullName: "Julia Schneider", salutation: "Frau" }, { pdf: "vollstaendig" });
    if (!r || !("tpl" in r)) throw new Error("keine Vorlage");
    expect(r.params(["Privatschutz", "Herrn Kannapinn", "Worum geht es Ihnen vor allem"])).toEqual(["Frau Schneider", "Privatschutz", "Herrn Kannapinn", "Worum geht es Ihnen vor allem"]);
  });

  it("nie ohne Erstinformation: _ohnepdf wird nie gewählt; unvollständig → PDF im aktuellen Stand; gar kein PDF → warten", () => {
    const beide = [...freigegebenV5, ...v6];
    const kontakt = { fullName: "Julia Schneider", salutation: "Frau" as const };
    // _ohnepdf zuerst in der Liste (neuer aktualisiert): trotzdem die Fassung mit PDF-Kopf
    const ohneZuerst = [v6[1], v6[0], v6[2], ...freigegebenV5];
    expect(pick(ohneZuerst, "sie", kontakt, "vollstaendig")).toEqual(["pg_outreach_privatschutz_v6_sie", "vollstaendig"]);
    expect(pick(beide, "sie", kontakt, "entwurf")).toEqual(["pg_outreach_privatschutz_v6_sie", "entwurf"]);
    expect(pick(beide, "sie", kontakt, "keins")).toEqual({ wartenAufPdf: true });
    // nur _ohnepdf freigegeben: keine passende Vorlage (wartet), nie ohne PDF
    expect(pick([v6[1]], "sie", kontakt, "vollstaendig")).toBeNull();
  });

  it("Live-Test Ole Agentur (Sie, Privatschutz, Lead „Ole …“ ohne Anrede): nur allgemeine v6 freigegeben, Du lokal schon, Sie noch nicht", () => {
    // Lage am 17.11. 14:27: lokal freigegeben nur die Du-Fassungen pg_outreach_v6 (mit Kopf) und _ohnepdf, neuer zuerst
    const lokal = [
      tpl("pg_outreach_v6_ohnepdf", "outreach", false, V6.du),
      tpl("pg_outreach_v6", "outreach", true, V6.du),
    ];
    const kontakt = { fullName: "Ole Kannapinn Testlead" };
    // Früher: Du-Fassung ohne PDF. Jetzt: keine Du-Fassung an Sie-Kunden, also warten (NoTemplateError), bis Sie freigegeben ist
    expect(pick(lokal, "sie", kontakt, "vollstaendig")).toBeNull();
    // Sobald die Sie-Fassungen lokal freigegeben sind (Abgleich liest jetzt alle Seiten): Sie mit PDF-Kopf
    const spaeter = [
      ...lokal,
      tpl("pg_outreach_v6_ohnepdf_sie", "outreach", false, V6.sie),
      tpl("pg_outreach_v6_ohnepdf_sie_ohne_name", "outreach", false, V6.ohne),
      tpl("pg_outreach_v6_sie", "outreach", true, V6.sie),
      tpl("pg_outreach_v6_sie_ohne_name", "outreach", true, V6.ohne),
    ];
    const r = rankOutreach(spaeter, P, "sie", kontakt, { pdf: "vollstaendig" });
    if (!r || !("tpl" in r)) throw new Error("keine Vorlage");
    expect([r.tpl.name, r.dokument, r.purpose]).toEqual(["pg_outreach_v6_sie", "vollstaendig", "outreach"]);
    const params = r.params(["Privatschutz", "Herrn Kannapinn", "Sind Haftpflicht und Hausrat schon irgendwo versichert, oder wäre beides neu"]);
    const text = renderTemplate(r.tpl.body, params);
    expect(text).toBe("Hallo Herr Testlead, danke für Ihre Anfrage zum Thema Privatschutz! Ich bin der digitale KI-Assistent von Herrn Kannapinn.\n\n*Sind Haftpflicht und Hausrat schon irgendwo versichert, oder wäre beides neu?*");
    expect(text).not.toMatch(/\b(deine?|dich|dir)\b/);
    // Du-Kunde bekommt weiter die Du-Fassung
    const du = rankOutreach(spaeter, P, "du", { fullName: "Ole Kannapinn Testlead" }, { pdf: "vollstaendig" });
    if (!du || !("tpl" in du)) throw new Error("keine Vorlage");
    expect(du.tpl.name).toBe("pg_outreach_v6");
  });
});


// Tier: gewünschter Umfang aus dem Chat geht vor der Kampagne (Ole, 19.11.2026: „nur OP“, Satz sagte „Krankenversicherung“)
describe("Terminnutzen Tier: OP oder Krankenversicherung nach Wunsch des Leads", () => {
  const satz = (angaben?: unknown, source = "Tierkrankenversicherung Katze") =>
    terminNutzenSatz({ source, formular: [{ label: "Name des Tieres", value: "Minka" }], angaben, an: "sie", person: PERSON });
  it("nur OP im Chat: OP-Versicherung, auch bei Kampagne Krankenversicherung", () => {
    expect(satz({ tarifwunsch: "nur OP-Schutz" })).toContain("was eine OP-Versicherung für Minka kostet");
  });
  it("auch Behandlungen: Krankenversicherung, auch bei OP-Kampagne", () => {
    expect(satz({ tarifwunsch: "volle Krankenversicherung (auch Tierarztbehandlung)" }, "Katzen-OP-Versicherung")).toContain("eine Krankenversicherung für Minka");
  });
  it("ohne Angabe oder offen: wie die Kampagne", () => {
    expect(satz(undefined, "Katzen-OP-Versicherung")).toContain("eine OP-Versicherung");
    expect(satz({ tarifwunsch: "offen" })).toContain("eine Krankenversicherung");
  });
});

// Wunschtag: Suche ab diesem Tag statt immer der nächsten Zeiten (Ole, 19.11.2026: „Dienstag ist leider noch nicht frei“)
describe("Terminsuche ab Wunschtag", () => {
  const now = new Date("2026-11-19T22:00:00Z");
  it("liest JJJJ-MM-TT als 0 Uhr deutscher Zeit", () => {
    expect(wunschTagAb("2026-11-24", now)?.toISOString()).toBe("2026-11-23T23:00:00.000Z");
  });
  it("ignoriert Vergangenheit, mehr als 90 Tage und Unsinn", () => {
    expect(wunschTagAb("2026-11-18", now)).toBeNull();
    expect(wunschTagAb("2027-03-30", now)).toBeNull();
    expect(wunschTagAb("Dienstag", now)).toBeNull();
    expect(wunschTagAb(undefined, now)).toBeNull();
  });
  it("Regel nennt die Suche ab Wunschtag und keine abgelehnten Zeiten", () => {
    expect(WUNSCHZEIT_REGEL).toContain("ab = diesem Tag");
    expect(WUNSCHZEIT_REGEL).toContain("nie noch einmal anbieten");
  });
});
