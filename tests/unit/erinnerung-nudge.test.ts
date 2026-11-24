// Erinnerung an Leads, die nach der Erstnachricht nicht antworten (Ole, 24.11.2026, Zweck followup_nudge v5):
// neuer Wortlaut ohne „digitaler KI-Assistent“, mit der Sparte aus dem Produkt des Leads. Der KI-Hinweis steht nur in der
// ERSTEN Nachricht (KI-VO Art. 50 Abs. 1 und 5); ist die Erinnerung selbst die erste, geht die Fassung mit Fußzeile.
// Rein, ohne Datenbank. Abläufe gegen die Datenbank: tests/integration/ki-erste-nachricht.test.ts.
import { describe, expect, it } from "vitest";
import { anfrageMitSparte, sparteDerAnfrage } from "@/lib/whatsapp/anfrage-sparte";
import { artikelBekannt, mitThema } from "@/lib/thema-artikel";
import { hasKiHinweis, KI_FUSSZEILE, kiHinweisNoetig, mitKiZeile } from "@/lib/whatsapp/ki-hinweis";
import {
  ANFRAGE_PARAM,
  CURRENT_VERSION_ONLY,
  freitextButtonsOf,
  hatKiFassung,
  istKiFassung,
  KI_ERST,
  neuePlatzhalter,
  noticeBody,
  noticeText,
  placeholderCount,
  PLATZHALTER_AB,
  rankTemplates,
  renderTemplate,
  REST_PARAMS,
  TEMPLATE_BODY,
  TEMPLATE_BODY_B,
  TEMPLATE_BUTTONS,
  templateTextFor,
  templateVersionFor,
  traegtKiHinweis,
  NAECHSTE_FASSUNG,
} from "@/lib/whatsapp/templates";
import {
  buildTemplateRequest,
  categoryFor,
  CORE_PURPOSES,
  exampleRestFor,
  exampleValuesFor,
  kiFassungen,
  metaTemplateProblems,
  plannedTemplates,
  previewBodyFor,
  templateBodyFor,
  templateNameFor,
  templateNamesOf,
} from "@/lib/whatsapp/template-plan";
import { erinnerungText, SEQUENCES } from "@/lib/lead-sequences";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { testLeadAnswers } from "@/lib/testlead";

const KRANERT = { fullName: "Peter Kranert", salutation: "Herr" };
const FIRMA = "Versicherung Henrik Lohmann Generalvertretung";
const KFZ = { source: "Kfz-Versicherung" };

describe("Wortlaut der Erinnerung (Ole, 24.11.2026)", () => {
  it("Sie und Du genau wie vorgegeben, mit Sparte", () => {
    expect(noticeText("followup_nudge", "sie", FIRMA, KRANERT, [anfrageMitSparte("sie", KFZ)])).toBe(
      "Guten Tag Herr Kranert, hier ist noch einmal Versicherung Henrik Lohmann Generalvertretung. Sollen wir mit Ihrer Anfrage zur Kfz-Versicherung weitermachen? Es dauert nur ein paar Minuten.",
    );
    expect(noticeText("followup_nudge", "du", "Agentur Susanne Meier", { fullName: "Julia Schneider" }, [anfrageMitSparte("du", KFZ)])).toBe(
      "Hallo Julia, hier ist noch einmal Agentur Susanne Meier. Sollen wir mit deiner Anfrage zur Kfz-Versicherung weitermachen? Es dauert nur ein paar Minuten.",
    );
  });

  it("ohne Sparte: „mit Ihrer Anfrage“ bzw. „mit deiner Anfrage“; ohne Nachnamen „Guten Tag,“", () => {
    expect(noticeText("followup_nudge", "sie", FIRMA, KRANERT, [anfrageMitSparte("sie", { source: null })])).toBe(
      "Guten Tag Herr Kranert, hier ist noch einmal Versicherung Henrik Lohmann Generalvertretung. Sollen wir mit Ihrer Anfrage weitermachen? Es dauert nur ein paar Minuten.",
    );
    expect(noticeText("followup_nudge", "du", "Agentur Meier", { fullName: "Julia Schneider" }, [anfrageMitSparte("du", null)])).toBe(
      "Hallo Julia, hier ist noch einmal Agentur Meier. Sollen wir mit deiner Anfrage weitermachen? Es dauert nur ein paar Minuten.",
    );
    expect(noticeText("followup_nudge", "sie", "Agentur Meier", { fullName: "Julia" }, [anfrageMitSparte("sie", KFZ)])).toBe(
      "Guten Tag, hier ist noch einmal Agentur Meier. Sollen wir mit Ihrer Anfrage zur Kfz-Versicherung weitermachen? Es dauert nur ein paar Minuten.",
    );
  });

  it("mit Tiername: „zur Tierkrankenversicherung für Minka“", () => {
    const lead = { source: "TKV Katze", formular: testLeadAnswers("TKV Katze") };
    expect(noticeText("followup_nudge", "sie", "Agentur Meier", KRANERT, [anfrageMitSparte("sie", lead)])).toBe(
      "Guten Tag Herr Kranert, hier ist noch einmal Agentur Meier. Sollen wir mit Ihrer Anfrage zur Tierkrankenversicherung für Minka weitermachen? Es dauert nur ein paar Minuten.",
    );
    expect(noticeText("followup_nudge", "du", "Agentur Meier", { fullName: "Julia Schneider" }, [anfrageMitSparte("du", lead)])).toBe(
      "Hallo Julia, hier ist noch einmal Agentur Meier. Sollen wir mit deiner Anfrage zur Tierkrankenversicherung für Minka weitermachen? Es dauert nur ein paar Minuten.",
    );
  });

  it("im offenen Fenster (Abfolge „Chat ruht“, Schritt nach 8 Std.) derselbe Text wie die Vorlage, mit den Knöpfen", () => {
    const step = SEQUENCES.silent.steps[1];
    if (step.action !== "whatsapp") throw new Error("Schritt 2 ist die Erinnerung");
    expect(step.purpose).toBe("followup_nudge");
    const ctx = { firstName: "Peter", hi: "Guten Tag Herr Kranert,", kontakt: KRANERT, topic: "Kfz-Versicherung", an: "sie" as const, firm: FIRMA, anfrage: anfrageMitSparte("sie", KFZ) };
    const text = step.text(ctx);
    expect(text).toBe(
      "Guten Tag Herr Kranert, hier ist noch einmal Versicherung Henrik Lohmann Generalvertretung. Sollen wir mit Ihrer Anfrage zur Kfz-Versicherung weitermachen? Es dauert nur ein paar Minuten.",
    );
    expect(text).toBe(noticeText("followup_nudge", "sie", FIRMA, KRANERT, [ctx.anfrage]));
    // Platzhalter der Vorlage: Name und die Anfrage samt Sparte
    expect(step.params(ctx)).toEqual(["Peter", "Ihrer Anfrage zur Kfz-Versicherung"]);
    const du = { ...ctx, an: "du" as const, hi: "Hallo Peter,", anfrage: anfrageMitSparte("du", KFZ) };
    expect(step.text(du)).toBe("Hallo Peter, hier ist noch einmal Versicherung Henrik Lohmann Generalvertretung. Sollen wir mit deiner Anfrage zur Kfz-Versicherung weitermachen? Es dauert nur ein paar Minuten.");
    expect(step.params(du)).toEqual(["Peter", "deiner Anfrage zur Kfz-Versicherung"]);
    // Knöpfe wie in der Vorlage
    expect(freitextButtonsOf("followup_nudge")).toEqual(["Ja, weitermachen", "Kein Bedarf mehr"]);
    expect(TEMPLATE_BUTTONS.followup_nudge).toEqual(["Ja, weitermachen", "Kein Bedarf mehr"]);
    // Ohne Sparte (kein Produkt) nie ein leerer Platzhalter
    const ohne = { firstName: "Peter", hi: "Guten Tag Herr Kranert,", kontakt: KRANERT, topic: "Ihrer Anfrage", an: "sie" as const, firm: "Agentur Meier" };
    expect(step.params(ohne)).toEqual(["Peter", "Ihrer Anfrage"]);
    expect(step.text(ohne)).toBe("Guten Tag Herr Kranert, hier ist noch einmal Agentur Meier. Sollen wir mit Ihrer Anfrage weitermachen? Es dauert nur ein paar Minuten.");
    // Ohne bekannten Firmennamen (Vorschau ohne Kundendaten) entfällt nur der Satz „hier ist noch einmal …“
    expect(erinnerungText({ ...ohne, firm: undefined })).toBe("Guten Tag Herr Kranert, sollen wir mit Ihrer Anfrage weitermachen? Es dauert nur ein paar Minuten.");
    for (const t of [text, step.text(du), step.text(ohne)]) {
      expect(hatGedankenstrich(t)).toBe(false);
      expect(hasKiHinweis(t)).toBe(false);
      expect(t).not.toMatch(/\{\{|\[Firma\]|digital|Assistent/);
    }
  });
});

describe("Sparte aus dem Produkt des Leads, mit passendem Artikel", () => {
  const sie = (source: string | null, formular?: unknown, tkvUmfang?: string | null) => anfrageMitSparte("sie", { source, formular, tkvUmfang });
  const du = (source: string | null, formular?: unknown) => anfrageMitSparte("du", { source, formular });
  const interesse = (value: string, label = "Welche Versicherungen interessieren Sie?") => [{ label, value }];

  it("Kfz, Tier, Zahn, PKV", () => {
    for (const s of ["Kfz-Versicherung", "KFZ-Versicherung", "Kfz", "Autoversicherung"]) expect(sie(s), s).toBe("Ihrer Anfrage zur Kfz-Versicherung");
    expect(du("Kfz-Versicherung")).toBe("deiner Anfrage zur Kfz-Versicherung");
    expect(sie("TKV-Katze")).toBe("Ihrer Anfrage zur Tierkrankenversicherung");
    expect(sie("Hundekrankenversicherung", [{ label: "Tiername", value: "Balu, Rex" }])).toBe("Ihrer Anfrage zur Tierkrankenversicherung für Balu und Rex");
    expect(du("Katzenversicherung (TKV)", [{ label: "Tiername", value: "Minka" }])).toBe("deiner Anfrage zur Tierkrankenversicherung für Minka");
    // Gewünschter Umfang nur OP (lib/tkv-umfang.ts): dann die OP-Versicherung, nicht die Krankenversicherung
    expect(sie("TKV Katze", [{ label: "Tiername", value: "Minka" }], "op")).toBe("Ihrer Anfrage zur Tier-OP-Versicherung für Minka");
    expect(sie("Tier-OP Hund")).toBe("Ihrer Anfrage zur Tier-OP-Versicherung");
    expect(sie("TKV Katze", null, "voll")).toBe("Ihrer Anfrage zur Tierkrankenversicherung");
    expect(sie("Zahnzusatz")).toBe("Ihrer Anfrage zur Zahnzusatzversicherung");
    expect(sie("PKV Wechsel")).toBe("Ihrer Anfrage zur privaten Krankenversicherung");
    expect(du("Neugeschäft")).toBe("deiner Anfrage zur privaten Krankenversicherung");
  });

  it("Privatschutz: nur die Sparten, die der Lead gewählt hat (Sparten-Treue), sonst ohne Sparte", () => {
    expect(sie("Privatschutz", interesse("Hausrat"))).toBe("Ihrer Anfrage zur Hausratversicherung");
    expect(sie("Hausrat")).toBe("Ihrer Anfrage zur Hausratversicherung");
    expect(sie("Privatschutz", interesse("rechtsschutz", "Welche Versicherung interessiert Sie am meisten?"))).toBe("Ihrer Anfrage zur Rechtsschutzversicherung");
    expect(sie("Privatschutz", interesse("Haftpflicht, Hausrat", "Versicherungsinteresse"))).toBe("Ihrer Anfrage zu Haftpflicht und Hausrat");
    expect(du("Privatschutz", interesse("Haftpflicht, Hausrat, Unfall"))).toBe("deiner Anfrage zu Haftpflicht, Hausrat und Unfall");
    // Ohne Interesse im Formular, mehr als drei Sparten, Tier-Interesse bzw. „Alles in einem Paket“: neutral, nie raten
    expect(sie("Privatschutz")).toBe("Ihrer Anfrage");
    expect(sie("Allianz Privatschutz")).toBe("Ihrer Anfrage");
    expect(sie("Privatschutz", interesse("Haftpflicht, Hausrat, Rechtsschutz, Unfall"))).toBe("Ihrer Anfrage");
    expect(sie("Privatschutz", interesse("Tierkrankenversicherung / Tierhalterhaftpflicht"))).toBe("Ihrer Anfrage");
    expect(sie("Privatschutz", interesse("Alles in einem Paket"))).toBe("Ihrer Anfrage");
    expect(sparteDerAnfrage({ source: "Privatschutz" })).toBeNull();
    // Interesse nennt auch etwas, das wir nicht sicher benennen: neutral statt nur einen Teil der Anfrage zu nennen
    expect(sie("Privatschutz", interesse("Kfz-Versicherung, Hausrat"))).toBe("Ihrer Anfrage");
    expect(sie("Privatschutz", interesse("Haftpflicht, Tierkrankenversicherung / Tierhalterhaftpflicht"))).toBe("Ihrer Anfrage");
    // andere Schreibweisen derselben Sparten
    expect(sie("Privatschutz", interesse("Hausrat- und Haftpflichtversicherung"))).toBe("Ihrer Anfrage zu Haftpflicht und Hausrat");
    expect(sie("Privatschutz", interesse("Privathaftpflicht"))).toBe("Ihrer Anfrage zur Haftpflichtversicherung");
    expect(sie("Privatschutz", interesse("Wohngebäude & Unfall"))).toBe("Ihrer Anfrage zu Wohngebäude und Unfall");
    // Nie „Haftpflicht und Hausrat“ für einen Lead, der Rechtsschutz gewählt hat (Produktionsfehler 24.11.2026)
    expect(sie("Privatschutz", interesse("Rechtsschutz"))).not.toMatch(/Haftpflicht|Hausrat/);
  });

  it("sonstige Produkte nur mit sicherem Artikel, Unbekanntes und Quellen ohne Produkt ohne Sparte", () => {
    expect(sie("Sterbegeld")).toBe("Ihrer Anfrage zum Sterbegeld");
    expect(sie("Kindersparpläne")).toBe("Ihrer Anfrage zu den Kindersparplänen");
    expect(sie("Tierhalterhaftpflicht")).toBe("Ihrer Anfrage zur Tierhalterhaftpflicht");
    for (const s of ["Kinderwunsch", "Empfehlung", "Bestandskunde", "", null]) expect(sie(s), String(s)).toBe("Ihrer Anfrage");
    expect(du(null)).toBe("deiner Anfrage");
    expect(anfrageMitSparte("sie", null)).toBe("Ihrer Anfrage");
    // Formulardaten in beliebiger Form (Lead.formData ist JSON)
    expect(sie("TKV Katze", "kaputt")).toBe("Ihrer Anfrage zur Tierkrankenversicherung");
    expect(sie("TKV Katze", [{ label: "Tiername" }, null, 7])).toBe("Ihrer Anfrage zur Tierkrankenversicherung");
  });

  it("Artikel-Helfer: bekannt bzw. unbekannt, Dativ Plural", () => {
    expect(artikelBekannt("Kfz-Versicherung")).toBe(true);
    expect(artikelBekannt("Sterbegeld")).toBe(true);
    expect(artikelBekannt("Kinderwunsch")).toBe(false);
    expect(artikelBekannt("Haftpflicht, Hausrat")).toBe(false);
    expect(artikelBekannt(null)).toBe(false);
    expect(mitThema("zu", "Kindersparpläne")).toBe("zu den Kindersparplänen");
    expect(mitThema("mit", "Kindersparpläne")).toBe("mit den Kindersparplänen");
    expect(mitThema("für", "Kindersparpläne")).toBe("für die Kindersparpläne");
    expect(mitThema("zu", "Versicherungen")).toBe("zu den Versicherungen");
  });

  it("nie leer, ohne Gedankenstriche, in der richtigen Ansprache", () => {
    for (const source of ["Kfz", "TKV Katze", "Zahnzusatz", "PKV Wechsel", "Privatschutz", "Hausrat", "Sterbegeld", "Unbekannt", "", null]) {
      for (const an of ["sie", "du"] as const) {
        const t = anfrageMitSparte(an, { source, formular: testLeadAnswers(source ?? "") });
        expect(t.trim().length, String(source)).toBeGreaterThan(5);
        expect(hatGedankenstrich(t)).toBe(false);
        expect(t.startsWith(an === "du" ? "deiner Anfrage" : "Ihrer Anfrage"), t).toBe(true);
      }
    }
  });
});

describe("Meta-Vorlage: neue Fassung v5, alte v4 bis zur Freigabe", () => {
  const names = templateNamesOf("Allianz Versicherung Henrik Lohmann Generalvertretung");

  it("neue Textversion mit eigenem Namen wird eingereicht (CORE_PURPOSES), Kategorie und Knöpfe unverändert", () => {
    expect(templateVersionFor("followup_nudge")).toBe("v5");
    expect(CORE_PURPOSES).toContain("followup_nudge");
    expect(templateNameFor("followup_nudge")).toBe("pg_followup_nudge_v5");
    expect(templateNameFor("followup_nudge", undefined, "sie")).toBe("pg_followup_nudge_v5_sie");
    expect(templateNameFor("followup_nudge", undefined, "sie_ohne_name")).toBe("pg_followup_nudge_v5_sie_ohne_name");
    expect(categoryFor("followup_nudge")).toBe("MARKETING");
    // kein Splittest auf der Erinnerung, keine vorgemerkte Fassung, ältere Fassung bleibt erlaubt
    expect(TEMPLATE_BODY_B.followup_nudge).toBeUndefined();
    expect(NAECHSTE_FASSUNG.followup_nudge).toBeUndefined();
    expect(CURRENT_VERSION_ONLY).not.toContain("followup_nudge");
  });

  it("Text je Fassung, Platzhalter und Beispiele erfüllen Metas Regeln (Variable nie leer, nicht am Anfang oder Ende)", () => {
    expect(templateTextFor("followup_nudge", "du")).toBe("Hallo {{1}}, hier ist noch einmal [Firma]. Sollen wir mit {{2}} weitermachen? Es dauert nur ein paar Minuten.");
    expect(templateTextFor("followup_nudge", "sie")).toBe("Guten Tag {{1}}, hier ist noch einmal [Firma]. Sollen wir mit {{2}} weitermachen? Es dauert nur ein paar Minuten.");
    expect(templateTextFor("followup_nudge", "sie_ohne_name")).toBe("Guten Tag, hier ist noch einmal [Firma]. Sollen wir mit {{1}} weitermachen? Es dauert nur ein paar Minuten.");
    expect(REST_PARAMS.followup_nudge).toEqual([ANFRAGE_PARAM]);
    expect(exampleValuesFor("followup_nudge", "sie")).toEqual(["Frau Schneider", "Ihrer Anfrage zur Kfz-Versicherung"]);
    expect(exampleValuesFor("followup_nudge", "du")).toEqual(["Julia", "deiner Anfrage zur Kfz-Versicherung"]);
    expect(exampleValuesFor("followup_nudge", "sie_ohne_name")).toEqual(["Ihrer Anfrage zur Kfz-Versicherung"]);
    for (const form of ["du", "sie", "sie_ohne_name"] as const) {
      const req = buildTemplateRequest("followup_nudge", names, undefined, form);
      const body = req.components.find((c) => (c as { type: string }).type === "BODY") as { text: string; example?: { body_text: string[][] } };
      expect(metaTemplateProblems(body.text, body.example?.body_text[0] ?? []), body.text).toEqual([]);
      // Firma aus der bestehenden Firmen-Logik ([Firma], lib/advisor-name.ts firmDisplayName)
      expect(body.text).toContain("hier ist noch einmal Versicherungsagentur Henrik Lohmann.");
      expect(body.text).not.toMatch(/KI|Assistent|\[Firma\]/);
    }
    expect(previewBodyFor("followup_nudge", names, "sie")).toBe(
      "Guten Tag Frau Schneider, hier ist noch einmal Versicherungsagentur Henrik Lohmann. Sollen wir mit Ihrer Anfrage zur Kfz-Versicherung weitermachen? Es dauert nur ein paar Minuten.",
    );
  });

  it("bis zur Freigabe der v5 bei Meta geht die freigegebene v4 raus, mit deren Platzhaltern (nur der Name)", () => {
    const v4 = { name: "pg_followup_nudge_v4_sie", body: "Guten Tag {{1}}, hier ist nochmal der digitale KI-Assistent von Agentur Meier. Sollen wir mit Ihrer Anfrage weitermachen? Es dauert nur ein paar Minuten." };
    const v4ohne = { name: "pg_followup_nudge_v4_sie_ohne_name", body: "Guten Tag, hier ist nochmal der digitale KI-Assistent von Agentur Meier. Sollen wir mit Ihrer Anfrage weitermachen? Es dauert nur ein paar Minuten." };
    const v5 = { name: "pg_followup_nudge_v5_sie", body: templateBodyFor("followup_nudge", "Agentur Meier", "sie") };
    const rest = [anfrageMitSparte("sie", KFZ)];
    // nur v4 freigegeben: v4, nicht „aktuell“, der zusätzliche Wert der v5 wird nicht mitgeschickt
    const alt = rankTemplates([v4, v4ohne], "followup_nudge", "sie", KRANERT)!;
    expect(alt.tpl.name).toBe("pg_followup_nudge_v4_sie");
    expect(alt.current).toBe(false);
    expect(alt.params(rest).slice(0, placeholderCount(alt.tpl.body))).toEqual(["Herr Kranert"]);
    expect(neuePlatzhalter("followup_nudge", 4)).toBe(false);
    expect(neuePlatzhalter("followup_nudge", 5)).toBe(true);
    expect(PLATZHALTER_AB.followup_nudge).toEqual({ version: 5, frueher: [] });
    expect(exampleRestFor("followup_nudge", "sie", 4)).toEqual([]);
    expect(exampleRestFor("followup_nudge", "sie", 5)).toEqual(["Ihrer Anfrage zur Kfz-Versicherung"]);
    // v5 freigegeben: v5 mit Name und der Anfrage samt Sparte
    const neu = rankTemplates([v4, v4ohne, v5], "followup_nudge", "sie", KRANERT)!;
    expect(neu.tpl.name).toBe("pg_followup_nudge_v5_sie");
    expect(neu.current).toBe(true);
    expect(renderTemplate(neu.tpl.body, neu.params(rest))).toBe(
      "Guten Tag Herr Kranert, hier ist noch einmal Agentur Meier. Sollen wir mit Ihrer Anfrage zur Kfz-Versicherung weitermachen? Es dauert nur ein paar Minuten.",
    );
    // ohne Nachnamen bis zur Freigabe der v5 ohne Namen weiter die v4 ohne Namen
    expect(rankTemplates([v4, v4ohne, v5], "followup_nudge", "sie", { fullName: "Julia" })!.tpl.name).toBe("pg_followup_nudge_v4_sie_ohne_name");
  });
});

describe("KI-Hinweis nur in der ersten Nachricht: die Erinnerung wiederholt ihn nicht", () => {
  const firma = "Agentur Meier";
  const v4 = { name: "pg_followup_nudge_v4_sie", body: "Guten Tag {{1}}, hier ist nochmal der digitale KI-Assistent von Agentur Meier. Sollen wir mit Ihrer Anfrage weitermachen? Es dauert nur ein paar Minuten." };
  const v5 = { name: "pg_followup_nudge_v5_sie", body: templateBodyFor("followup_nudge", firma, "sie") };
  const v5ki = { name: "pg_followup_nudge_v5_ki_sie", body: templateBodyFor("followup_nudge", firma, "sie") };

  it("Text der Erinnerung (Vorlage und Freitext, Sie und Du) trägt keinen KI-Hinweis", () => {
    for (const t of [TEMPLATE_BODY.followup_nudge.sie, TEMPLATE_BODY.followup_nudge.du!]) {
      expect(hasKiHinweis(t)).toBe(false);
      expect(t).not.toMatch(/digital|Assistent|KI\b/);
    }
    for (const an of ["sie", "du"] as const) {
      expect(hasKiHinweis(noticeText("followup_nudge", an, firma, KRANERT, [anfrageMitSparte(an, KFZ)]))).toBe(false);
      expect(hasKiHinweis(noticeBody("followup_nudge", an, firma, [anfrageMitSparte(an, null)]))).toBe(false);
    }
    // die normale Fassung der Vorlage hat keine Fußzeile
    const req = buildTemplateRequest("followup_nudge", firma, undefined, "sie");
    expect(req.name).toBe("pg_followup_nudge_v5_sie");
    expect(req.components.map((c) => (c as { type: string }).type)).toEqual(["BODY", "BUTTONS"]);
  });

  it("nach der ersten Nachricht geht die normale Fassung raus, nie die mit KI-Fußzeile", () => {
    const r = rankTemplates([v4, v5, v5ki], "followup_nudge", "sie", KRANERT)!;
    expect(r.tpl.name).toBe("pg_followup_nudge_v5_sie");
    expect(traegtKiHinweis(r.tpl)).toBe(false);
    // auch wenn die normale v5 noch nicht freigegeben ist: die bisherige v4, nicht die Fassung mit Fußzeile
    expect(rankTemplates([v4, v5ki], "followup_nudge", "sie", KRANERT)!.tpl.name).toBe("pg_followup_nudge_v4_sie");
    // nur wenn sonst gar nichts freigegeben ist, lieber die Fassung mit Fußzeile als keine Nachricht
    expect(rankTemplates([v5ki], "followup_nudge", "sie", KRANERT)!.tpl.name).toBe("pg_followup_nudge_v5_ki_sie");
  });

  it("der Hinweis aus der ersten Nachricht bleibt gültig: die Erinnerung löst keinen neuen Hinweis aus", () => {
    const now = new Date("2026-11-24T10:00:00Z");
    const erst = "[Erstinformation als PDF]\nHallo Herr Kranert, danke für Ihre Anfrage zur Kfz-Versicherung! *Wann läuft Ihr jetziger Vertrag aus?*\n\nDigitaler KI-Assistent";
    const erinnerung = noticeText("followup_nudge", "sie", firma, KRANERT, [anfrageMitSparte("sie", KFZ)]);
    expect(kiHinweisNoetig({ outbound: [erst, erinnerung, erinnerung], previousAt: new Date(now.getTime() - 3_600_000), now })).toBeNull();
    // ohne jede Kennzeichnung im Chat stellt der Assistent sie seiner ersten Antwort voran (wie bisher)
    expect(kiHinweisNoetig({ outbound: [erinnerung], previousAt: null, now })).toBe("erst");
  });
});

describe("Fassung mit KI-Fußzeile für die erste Nachricht (KI_ERST)", () => {
  it("Zwecke, Namen und Antrag: gleicher Text, dazu die Fußzeile „Digitaler KI-Assistent“", () => {
    expect(KI_ERST).toEqual({ booking_confirmation: "bevorzugt", followup_nudge: "pflicht" });
    expect(KI_FUSSZEILE).toBe("Digitaler KI-Assistent");
    expect(KI_FUSSZEILE.length).toBeLessThanOrEqual(60); // Meta: Fußzeile höchstens 60 Zeichen
    expect(hasKiHinweis(KI_FUSSZEILE)).toBe(true);
    for (const p of ["booking_confirmation", "followup_nudge"] as const) {
      expect(hatKiFassung(p)).toBe(true);
      expect(kiFassungen(p)).toEqual([false, true]);
      for (const form of ["du", "sie", "sie_ohne_name"] as const) {
        const normal = buildTemplateRequest(p, "Agentur Meier", undefined, form);
        const ki = buildTemplateRequest(p, "Agentur Meier", undefined, form, { ki: true });
        expect(ki.name).toBe(templateNameFor(p, undefined, form, "a", true, true));
        expect(istKiFassung(ki.name)).toBe(true);
        expect(istKiFassung(normal.name)).toBe(false);
        const comp = (r: typeof ki, type: string) => r.components.find((c) => (c as { type: string }).type === type);
        expect(comp(ki, "BODY")).toEqual(comp(normal, "BODY"));
        expect(comp(ki, "BUTTONS")).toEqual(comp(normal, "BUTTONS"));
        expect(comp(ki, "FOOTER")).toEqual({ type: "FOOTER", text: "Digitaler KI-Assistent" });
        expect(comp(normal, "FOOTER")).toBeUndefined();
        expect(ki.category).toBe(normal.category);
      }
    }
    expect(templateNameFor("booking_confirmation", undefined, "sie", "a", true, true)).toBe("pg_booking_confirmation_v4_ki_sie");
    expect(templateNameFor("followup_nudge", undefined, "du", "a", true, true)).toBe("pg_followup_nudge_v5_ki");
    expect(templateNameFor("followup_nudge", undefined, "sie_ohne_name", "a", true, true)).toBe("pg_followup_nudge_v5_ki_sie_ohne_name");
    // andere Zwecke haben keine solche Fassung
    for (const p of ["reminder", "followup", "outreach", "campaign_review"] as const) {
      expect(hatKiFassung(p), p).toBe(false);
      expect(kiFassungen(p), p).toEqual([false]);
    }
    const geplant = plannedTemplates(["booking_confirmation", "followup_nudge", "reminder"]);
    expect(geplant.filter((t) => t.ki).map((t) => `${t.purpose}:${t.form}`)).toEqual([
      "booking_confirmation:du",
      "booking_confirmation:sie",
      "booking_confirmation:sie_ohne_name",
      "followup_nudge:du",
      "followup_nudge:sie",
      "followup_nudge:sie_ohne_name",
    ]);
    expect(geplant).toHaveLength(15);
  });

  it("Namenserkennung: nur automatisch eingereichte …_ki-Fassungen, auch als Revision", () => {
    for (const n of ["pg_followup_nudge_v5_ki", "pg_followup_nudge_v5_ki_sie", "pg_booking_confirmation_v4_ki_sie_ohne_name", "pg_booking_confirmation_v4_ki_sie_r2", "pg_followup_nudge_v5_ki_r3"]) expect(istKiFassung(n), n).toBe(true);
    for (const n of ["pg_followup_nudge_v5", "pg_followup_nudge_v5_sie", "pg_booking_confirmation_v4_sie_ohne_name", "pg_outreach_kfz_v13_b_sie", "meine_vorlage_ki", "pg_followup_nudge_v5_kinder"]) expect(istKiFassung(n), n).toBe(false);
  });

  it("Erinnerung als erste Nachricht: Fassung mit Fußzeile, bis zur Freigabe die alte v4 mit dem Hinweis im Text, sonst keine Vorlage", () => {
    const v4 = { name: "pg_followup_nudge_v4_sie", body: "Guten Tag {{1}}, hier ist nochmal der digitale KI-Assistent von Agentur Meier. Sollen wir mit Ihrer Anfrage weitermachen? Es dauert nur ein paar Minuten." };
    const v5 = { name: "pg_followup_nudge_v5_sie", body: templateBodyFor("followup_nudge", "Agentur Meier", "sie") };
    const v5ki = { name: "pg_followup_nudge_v5_ki_sie", body: v5.body };
    const erst = { kiErst: true };
    expect(rankTemplates([v4, v5, v5ki], "followup_nudge", "sie", KRANERT, erst)!.tpl.name).toBe("pg_followup_nudge_v5_ki_sie");
    const alt = rankTemplates([v4, v5], "followup_nudge", "sie", KRANERT, erst)!;
    expect(alt.tpl.name).toBe("pg_followup_nudge_v4_sie");
    expect(hasKiHinweis(alt.tpl.body)).toBe(true);
    // nur die neue Fassung ohne Hinweis freigegeben: als erste Nachricht nicht senden (Anruf-Aufgabe statt WhatsApp)
    expect(rankTemplates([v5], "followup_nudge", "sie", KRANERT, erst)).toBeNull();
    expect(rankTemplates([v5], "followup_nudge", "sie", KRANERT)!.tpl.name).toBe("pg_followup_nudge_v5_sie");
  });

  it("Terminbestätigung als erste Nachricht: Fassung mit Fußzeile, bis zur Freigabe die bisherige (sie muss ankommen)", () => {
    const body = templateBodyFor("booking_confirmation", "Agentur Meier", "sie");
    const normal = { name: "pg_booking_confirmation_v4_sie", body };
    const ki = { name: "pg_booking_confirmation_v4_ki_sie", body };
    expect(hasKiHinweis(body)).toBe(false);
    expect(rankTemplates([normal, ki], "booking_confirmation", "sie", KRANERT, { kiErst: true })!.tpl.name).toBe("pg_booking_confirmation_v4_ki_sie");
    expect(rankTemplates([normal], "booking_confirmation", "sie", KRANERT, { kiErst: true })!.tpl.name).toBe("pg_booking_confirmation_v4_sie");
    // spätere Bestätigungen (Hinweis steht schon im Chat) ohne Fußzeile
    expect(rankTemplates([normal, ki], "booking_confirmation", "sie", KRANERT)!.tpl.name).toBe("pg_booking_confirmation_v4_sie");
    expect(rankTemplates([normal, ki], "booking_confirmation", "sie", KRANERT, { kiErst: false })!.tpl.name).toBe("pg_booking_confirmation_v4_sie");
  });

  it("übrige Nachfass-Vorlagen tragen den Hinweis im Text und bleiben auch als erste Nachricht unverändert", () => {
    for (const p of ["followup", "followup_offer", "followup_offer_selbst", "offer_bedenkzeit", "followup_noshow", "followup_absage", "followup_last"] as const) {
      expect(hasKiHinweis(TEMPLATE_BODY[p].sie), p).toBe(true);
      expect(hasKiHinweis(TEMPLATE_BODY[p].du!), p).toBe(true);
      const t = { name: templateNameFor(p, undefined, "sie"), body: templateBodyFor(p, "Agentur Meier", "sie") };
      expect(rankTemplates([t], p, "sie", KRANERT, { kiErst: true })!.tpl.name, p).toBe(t.name);
      expect(rankTemplates([t], p, "sie", KRANERT)!.tpl.name, p).toBe(t.name);
    }
    expect(hasKiHinweis(TEMPLATE_BODY_B.followup_last!.sie)).toBe(true);
    // Termin-Erinnerung ohne Hinweis im Text und ohne eigene Fassung: wie bisher
    const rem = { name: "pg_reminder_v5_sie", body: templateBodyFor("reminder", "Agentur Meier", "sie") };
    expect(rankTemplates([rem], "reminder", "sie", KRANERT, { kiErst: true })!.tpl.name).toBe("pg_reminder_v5_sie");
  });

  it("Freitext der ersten Nachricht: kursive Zeile darunter, nur wenn der Text sie nicht schon trägt", () => {
    expect(mitKiZeile("Guten Tag Herr Kranert, Ihr Videocall mit Herrn Lohmann ist bestätigt.")).toBe("Guten Tag Herr Kranert, Ihr Videocall mit Herrn Lohmann ist bestätigt.\n\n_Digitaler KI-Assistent_");
    const schon = "Hallo Herr Kranert, danke für Ihre Anfrage!\n\n_Digitaler KI-Assistent_";
    expect(mitKiZeile(schon)).toBe(schon);
    expect(mitKiZeile("Hier schreibt der digitale KI-Assistent von Herrn Lohmann.")).toBe("Hier schreibt der digitale KI-Assistent von Herrn Lohmann.");
    expect(hasKiHinweis(mitKiZeile("Hallo"))).toBe(true);
  });
});
