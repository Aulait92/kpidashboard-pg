// Splittest termin_zusage (Ole, 20.11.2026): Buchungsbestätigung mit Zusage-Frage (Fassung b), Knöpfe, Einleitungen
// („Super, danke!“, „Noch eine kurze Frage:“), getippte Zusage, Prompt-Regel, Reife-Filter; dazu die neue Vorlage
// „Halbzeit-Erinnerung“ (appt_halbzeit, nur eingereicht, Test termin_halbzeit folgt).
import { describe, expect, it } from "vitest";
import { EXPERIMENTE, reifeBedingung } from "@/lib/experimente";
import { SPLITTEST_HYPOTHESE } from "@/lib/ab-hypothesen";
import {
  buchungsText,
  buchungsTextMitZusage,
  istZusageText,
  knoepfeFuerText,
  nachBuchungRegel,
  ZUSAGE_FRAGE_RE,
  ZUSAGE_KNOEPFE,
  zusageFrage,
} from "@/lib/whatsapp/gespraech";
import { komplettcheckNachricht, mitEinleitung, ZUSAGE_EINLEITUNG, zusageOffen, type StreckenStand } from "@/lib/whatsapp/termin-strecke";
import { knopfAktion } from "@/lib/whatsapp/knopf";
import { vermittlerName } from "@/lib/vermittler-nennung";
import { KNOPF, templateTextFor, TEMPLATE_BUTTONS, PURPOSE_LABELS } from "@/lib/whatsapp/templates";
import {
  buildTemplateRequest,
  categoryFor,
  CORE_PURPOSES,
  CUSTOMER_TITLES,
  exampleValuesFor,
  metaTemplateProblems,
  plannedTemplates,
  templateBodyFor,
  templateNameFor,
} from "@/lib/whatsapp/template-plan";

const SIE = vermittlerName("sie", { name: "Ole Kannapinn", anrede: "Herr", fallback: "Ole Agentur" });
const DU = vermittlerName("du", { name: "Ole Kannapinn", anrede: "Herr", fallback: "Ole Agentur" });
const START = new Date("2026-11-24T09:00:00Z"); // Di 10 Uhr
const STRICH = /[–—]/;

describe("Fassung b: Bestätigung mit Zusage-Frage", () => {
  it("Sie und Du: Bestätigung, Leerzeile, fette Frage; ohne Gedankenstriche", () => {
    const sie = buchungsTextMitZusage({ an: "sie", start: START, mode: "video", meetUrl: "https://meet.google.com/abc", person: SIE });
    expect(sie).toBe(
      "Ihr Videotermin ist gebucht: *Dienstag, 24.11. um 10 Uhr*. Herr Kannapinn hält sich die Zeit nur für Sie frei und bereitet Ihre Beiträge vor.\nIhr Link: https://meet.google.com/abc\n\n*Kann Herr Kannapinn fest mit Ihnen rechnen?*",
    );
    const du = buchungsTextMitZusage({ an: "du", start: START, mode: "phone", meetUrl: null, person: DU });
    expect(du).toBe("Dein Telefontermin ist gebucht: *Dienstag, 24.11. um 10 Uhr*. Ole hält sich die Zeit nur für dich frei, ruft dich an und bereitet deine Beiträge vor.\n\n*Kann Ole fest mit dir rechnen?*");
    expect(sie.startsWith(buchungsText({ an: "sie", start: START, mode: "video", meetUrl: "https://meet.google.com/abc", person: SIE }))).toBe(true);
    for (const t of [sie, du, zusageFrage("sie", SIE), zusageFrage("du", DU)]) expect(t).not.toMatch(STRICH);
    expect(sie.split("\n")).toHaveLength(4);
  });

  it("Knöpfe [Ja, sicher] [Lieber andere Zeit], höchstens 20 Zeichen, werden am Payload erkannt", () => {
    expect(ZUSAGE_KNOEPFE).toEqual([
      { id: "zusage:ja", title: "Ja, sicher" },
      { id: "zusage:andere", title: "Lieber andere Zeit" },
    ]);
    for (const k of ZUSAGE_KNOEPFE) expect(k.title.length).toBeLessThanOrEqual(20);
    expect(knopfAktion("interactive", "Ja, sicher", "zusage:ja")).toEqual({ aktion: "zusage", ja: true });
    expect(knopfAktion("interactive", "Lieber andere Zeit", "zusage:andere")).toEqual({ aktion: "zusage", ja: false });
    // ohne Payload kein Zusage-Knopf (getippt zählt nur über istZusageText bei offener Frage)
    expect(knopfAktion("text", "Ja, sicher", "zusage:ja")).toBeNull();
    expect(knoepfeFuerText(zusageFrage("sie", SIE))).toEqual(ZUSAGE_KNOEPFE);
    expect(ZUSAGE_FRAGE_RE.test(zusageFrage("du", DU))).toBe(true);
  });

  it("„Ja, sicher“: „Super, danke!“ statt „Danke!“; ohne Tipp „Noch eine kurze Frage:“; Tierfrage ohne „Danke!“ bekommt die Einleitung davor", () => {
    for (const variante of ["a", "b"] as const) {
      const ja = komplettcheckNachricht({ an: "sie", person: SIE, familie: false, variante }, ZUSAGE_EINLEITUNG.ja).text;
      expect(ja).toMatch(/^Super, danke! (Soll|Oft)/);
      expect(ja).not.toMatch(/Danke! (Soll|Oft)/);
      const ohne = komplettcheckNachricht({ an: "du", person: DU, familie: true, variante }, ZUSAGE_EINLEITUNG.ohneAntwort).text;
      expect(ohne).toMatch(/^Noch eine kurze Frage: (Soll|Oft)/);
      for (const t of [ja, ohne]) expect(t).not.toMatch(STRICH);
    }
    expect(mitEinleitung("Ist Minka aktuell gesund?", "Super, danke!")).toBe("Super, danke! Ist Minka aktuell gesund?");
    expect(mitEinleitung("Danke! Welche Rasse hat Minka?", "Super, danke!")).toBe("Super, danke! Welche Rasse hat Minka?");
    expect(mitEinleitung("Ist Minka aktuell gesund?", null)).toBe("Ist Minka aktuell gesund?");
  });

  it("getippte Zusage: ja, passt, sicher, klar, Daumen; nicht bei Verneinung, Frage oder anderer Zeit", () => {
    for (const t of ["ja", "Ja!", "Passt!", "sicher", "Klar, bin dabei", "ja gerne", "Okay", "Auf jeden Fall", "👍", "Ja passt, bis dann"]) expect(istZusageText(t), t).toBe(true);
    for (const t of ["nein", "Ja, aber lieber eine andere Zeit", "Passt leider nicht", "Kann ich verschieben?", "Was kostet das?", "Ich weiß noch nicht", "vielleicht", "Ja, wenn nichts dazwischenkommt, aber eventuell später", ""]) {
      expect(istZusageText(t), t).toBe(false);
    }
  });

  it("Prompt-Regel: offene Zusage-Frage (termin_zugesagt bei Zusage, Verschieben bei anderer Zeit) bzw. andere Zeit gewünscht", () => {
    const basis = { an: "sie" as const, person: SIE, fragen: [], komplettcheckGestellt: false, abschlussGesendet: false, zugesagt: false };
    const offen = nachBuchungRegel({ ...basis, zusage: "offen" });
    expect(offen).toContain("Offen ist die Frage „Kann Herr Kannapinn fest mit Ihnen rechnen?“");
    expect(offen).toContain("nutze termin_zugesagt");
    expect(offen).toContain("reschedule_appointment");
    expect(offen).not.toContain("Die App schickt gleich selbst die nächste Frage");
    const andere = nachBuchungRegel({ ...basis, zusage: "andere" });
    expect(andere).toContain("Der Lead möchte eine andere Zeit");
    expect(nachBuchungRegel({ ...basis, an: "du", person: DU, zusage: "offen" })).toContain("„Kann Ole fest mit dir rechnen?“");
    expect(nachBuchungRegel(basis)).toContain("Die App schickt gleich selbst die nächste Frage");
  });

  it("zusageOffen: nur gefragt und unbeantwortet, solange weder Komplettcheck noch Tierfrage noch Schluss kamen", () => {
    const leer = { zusageFrageAt: null, zusageAntwort: null, komplettFrageAt: null, tierFrageLetzte: null, abschlussAt: null } as unknown as StreckenStand;
    const t = new Date();
    expect(zusageOffen(leer)).toBe(false);
    expect(zusageOffen({ ...leer, zusageFrageAt: t })).toBe(true);
    expect(zusageOffen({ ...leer, zusageFrageAt: t, zusageAntwort: { at: t, art: "ja" } })).toBe(false);
    expect(zusageOffen({ ...leer, zusageFrageAt: t, komplettFrageAt: t })).toBe(false);
    expect(zusageOffen({ ...leer, zusageFrageAt: t, tierFrageLetzte: { at: t, key: "gesundheit" } })).toBe(false);
  });
});

describe("Experiment termin_zusage", () => {
  it("Ziel erschienen, 150 je Fassung, Reife-Filter, Hypothese vorhanden", () => {
    expect(EXPERIMENTE.termin_zusage).toMatchObject({ ziel: "erschienen", min: 150, nurReif: "termin_vorbei" });
    expect("aktiv" in EXPERIMENTE.termin_zusage).toBe(false);
    expect(SPLITTEST_HYPOTHESE.termin_zusage).toMatch(/fest mit Ihnen rechnen/);
    for (const t of [EXPERIMENTE.termin_zusage.a, EXPERIMENTE.termin_zusage.b]) expect(t).not.toMatch(STRICH);
  });

  it("Reife-Filter: ohne Option keine Bedingung; mit termin_vorbei nur Termine, die mindestens 1 Tag vorbei bzw. nicht mehr gebucht sind", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    expect(reifeBedingung(undefined, now).sql.trim()).toBe("TRUE");
    const r = reifeBedingung("termin_vorbei", now);
    expect(r.sql).toContain('FROM "Appointment"');
    expect(r.sql).toContain("\"status\" = 'booked'");
    expect(r.values).toEqual([new Date("2026-11-19T12:00:00Z")]);
  });
});

describe("Vorlage Halbzeit-Erinnerung (appt_halbzeit)", () => {
  it("Sie, Du und ohne Namen; Knöpfe [Ja, passt] [Bitte verschieben]; UTILITY; wird bei allen eingereicht", () => {
    expect(templateTextFor("appt_halbzeit", "sie")).toBe("Guten Tag {{1}}, kurzer Gruß von {{2}}: Ihr Termin am {{3}} steht. Passt es weiterhin?");
    expect(templateTextFor("appt_halbzeit", "du")).toBe("Hallo {{1}}, kurzer Gruß von {{2}}: Dein Termin am {{3}} steht. Passt es weiterhin?");
    expect(templateTextFor("appt_halbzeit", "sie_ohne_name")).toBe("Guten Tag, kurzer Gruß von {{1}}: Ihr Termin am {{2}} steht. Passt es weiterhin?");
    expect(TEMPLATE_BUTTONS.appt_halbzeit).toEqual([KNOPF.passt, KNOPF.verschieben]);
    expect(categoryFor("appt_halbzeit")).toBe("UTILITY");
    expect(CORE_PURPOSES).toContain("appt_halbzeit");
    expect(plannedTemplates(["appt_halbzeit"]).map((t) => t.form)).toEqual(["du", "sie", "sie_ohne_name"]);
    expect(PURPOSE_LABELS.appt_halbzeit).toMatch(/Halbzeit/);
    expect(CUSTOMER_TITLES.appt_halbzeit.title.length).toBeGreaterThan(3);
  });

  it("Antrag: Name, Komponenten, Beispiele; Meta-Regeln erfüllt (kein Platzhalter am Anfang oder Ende, fortlaufend, keine Gedankenstriche)", () => {
    const names = { firm: "Agentur Kannapinn", advisor: "Ole Kannapinn" };
    for (const form of ["du", "sie", "sie_ohne_name"] as const) {
      const req = buildTemplateRequest("appt_halbzeit", names, undefined, form);
      expect(req.name).toBe(templateNameFor("appt_halbzeit", undefined, form));
      expect(req.category).toBe("UTILITY");
      const comps = req.components as { type: string; text?: string; example?: { body_text: string[][] }; buttons?: { type: string; text: string }[] }[];
      expect(comps.map((c) => c.type)).toEqual(["BODY", "BUTTONS"]);
      const body = comps[0];
      expect(body.text).toBe(templateBodyFor("appt_halbzeit", names, form));
      expect(body.example!.body_text[0]).toEqual(exampleValuesFor("appt_halbzeit", form));
      expect(metaTemplateProblems(body.text!, body.example!.body_text[0])).toEqual([]);
      expect(comps[1].buttons).toEqual([
        { type: "QUICK_REPLY", text: "Ja, passt" },
        { type: "QUICK_REPLY", text: "Bitte verschieben" },
      ]);
    }
    expect(templateNameFor("appt_halbzeit", undefined, "sie")).toBe("pg_appt_halbzeit_v5_sie");
    expect(templateNameFor("appt_halbzeit", undefined, "du")).toBe("pg_appt_halbzeit_v5");
    expect(exampleValuesFor("appt_halbzeit", "sie")).toEqual(["Frau Schneider", "Herr Schmidt", "Montag, 14.12. um 10 Uhr"]);
    expect(exampleValuesFor("appt_halbzeit", "du")).toEqual(["Julia", "Thomas", "Montag, 14.12. um 10 Uhr"]);
  });
});
