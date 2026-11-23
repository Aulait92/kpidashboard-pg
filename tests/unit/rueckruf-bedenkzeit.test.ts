import { describe, expect, it } from "vitest";
import {
  bereinigeNotiz,
  fensterAusKey,
  rueckrufBestaetigung,
  rueckrufFensterPush,
  rueckrufNotiz,
  rueckrufPauseBis,
  rueckrufTage,
  rueckrufTexte,
  waehleFenster,
  wannText,
} from "@/lib/rueckruf";
import {
  BEDENKZEIT_AUFGABE,
  BEDENKZEIT_KNOEPFE,
  bedenkzeitAusDatum,
  bedenkzeitBestaetigung,
  bedenkzeitDatum,
  bedenkzeitFrage,
  bedenkzeitNeustartText,
  bedenkzeitTag,
  erkenneBedenkzeit,
} from "@/lib/bedenkzeit";
import { DEFAULT_LEAD_TIMES, type LeadTimes } from "@/lib/calendar/lead-times";
import { SEQUENCES } from "@/lib/lead-sequences";
import { planeNachrichten, type PlanEingabe } from "@/lib/nachrichtenplan";
import { knopfAktion } from "@/lib/whatsapp/knopf";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { BEDENKZEIT_PURPOSES, CORE_PURPOSES, buildTemplateRequest, categoryFor, exampleValuesFor, metaTemplateProblems, plannedTemplates, purposesFor, templateNameFor } from "@/lib/whatsapp/template-plan";
import { TEMPLATE_BUTTONS } from "@/lib/whatsapp/templates";

const herr = { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" };
const ole = { nom: "Ole", dat: "Ole" };
const becker = { fullName: "Anna Becker", firstName: "Anna", lastName: "Becker", salutation: "Frau" as const };
// Berlin = UTC+1 im November
const berlin = (iso: string) => new Date(`${iso}+01:00`);
const DAY = 86400000;

describe("Rückruf: Zeitfenster aus den Geschäftszeiten", () => {
  it("Standard (Mo bis Fr 10 bis 16:30 Uhr): heute und morgen je Vormittag und Nachmittag, kein Abend", () => {
    const tage = rueckrufTage(berlin("2026-11-17T09:00:00"), DEFAULT_LEAD_TIMES);
    expect(tage.map((t) => t.titel)).toEqual(["Heute", "Morgen"]);
    expect(tage[0].fenster.map((f) => [f.label, f.zeit])).toEqual([
      ["Vormittag", "10 bis 12 Uhr"],
      ["Nachmittag", "12 bis 16:30 Uhr"],
    ]);
    expect(tage[0].fenster[0].von.toISOString()).toBe("2026-11-17T09:00:00.000Z");
    expect(tage[0].fenster[0].key).toBe("2026-11-17_vormittag");
  });

  it("heute nur, was ab jetzt plus 15 Minuten noch mindestens 30 Minuten dauert (auf die halbe Stunde gerundet)", () => {
    const tage = rueckrufTage(berlin("2026-11-17T10:40:00"), DEFAULT_LEAD_TIMES);
    expect(tage[0].fenster[0].zeit).toBe("11 bis 12 Uhr");
    // 15:50 Uhr: heute nichts mehr, also morgen und Donnerstag
    expect(rueckrufTage(berlin("2026-11-17T15:50:00"), DEFAULT_LEAD_TIMES).map((t) => t.titel)).toEqual(["Morgen", "Donnerstag, 19.11."]);
    // Freitagabend: Montag und Dienstag
    expect(rueckrufTage(berlin("2026-11-20T18:00:00"), DEFAULT_LEAD_TIMES).map((t) => t.titel)).toEqual(["Montag, 23.11.", "Dienstag, 24.11."]);
  });

  it("eigene Zeiten mit Abend; ohne Geschäftszeiten keine Fenster", () => {
    const lt: LeadTimes = { weekdays: [], times: [], durationMin: 60, schedule: { step: 60, days: { 2: [["08:00", "20:00"]], 3: [["08:00", "20:00"]] } } };
    const tage = rueckrufTage(berlin("2026-11-17T07:00:00"), lt);
    expect(tage[0].fenster.map((f) => f.zeit)).toEqual(["8 bis 12 Uhr", "12 bis 17 Uhr", "17 bis 20 Uhr"]);
    expect(rueckrufTage(berlin("2026-11-17T07:00:00"), { weekdays: [], times: [] })).toEqual([]);
  });

  it("Wahl prüfen: nur, was die Seite gerade anbietet", () => {
    const now = berlin("2026-11-17T09:00:00");
    expect(waehleFenster("2026-11-17_nachmittag", now, DEFAULT_LEAD_TIMES)?.zeit).toBe("12 bis 16:30 Uhr");
    expect(waehleFenster("2026-11-17_vormittag", berlin("2026-11-17T12:30:00"), DEFAULT_LEAD_TIMES)).toBeNull();
    expect(waehleFenster("2026-11-17_abend", now, DEFAULT_LEAD_TIMES)).toBeNull();
    expect(waehleFenster("kaputt", now, DEFAULT_LEAD_TIMES)).toBeNull();
    expect(fensterAusKey("2026-11-18_vormittag", DEFAULT_LEAD_TIMES)?.zeit).toBe("10 bis 12 Uhr");
  });

  it("Aufgabe, Push, Bestätigung und Seite in Sie- und Du-Form, ohne Gedankenstriche", () => {
    const now = berlin("2026-11-17T09:00:00");
    const f = rueckrufTage(now, DEFAULT_LEAD_TIMES)[0].fenster[1];
    expect(rueckrufNotiz(f, "Frage zum   Beitrag")).toBe("Rückrufwunsch: 12 bis 16:30 Uhr · „Frage zum Beitrag“");
    expect(rueckrufNotiz(null)).toBe("Rückrufwunsch: so bald wie möglich");
    // Ohne Tag (den trägt die Fälligkeit), damit das Fenster in der Anrufliste am Handy lesbar bleibt
    expect(rueckrufNotiz(rueckrufTage(now, DEFAULT_LEAD_TIMES)[1].fenster[0]).length).toBeLessThanOrEqual(32);
    const push = rueckrufFensterPush({ leadId: "l1", name: "Frau Becker", fenster: f, notiz: "Frage zum Beitrag", now });
    expect(push).toMatchObject({ title: "Frau Becker wünscht einen Rückruf", url: "/buyer?anrufen=l1#anrufen" });
    expect(push.body).toBe("Heute 12 bis 16:30 Uhr, zum Angebot. „Frage zum Beitrag“ Tippen Sie, um direkt anzurufen.");
    expect(wannText(f, now)).toBe("heute zwischen 12 und 16:30 Uhr");
    const sie = rueckrufBestaetigung({ an: "sie", hi: "Guten Tag Frau Becker,", person: herr, fenster: f, now });
    expect(sie).toBe("Guten Tag Frau Becker, vielen Dank für Ihren Rückrufwunsch! Herr Kannapinn ruft Sie heute zwischen 12 und 16:30 Uhr an.");
    const du = rueckrufBestaetigung({ an: "du", hi: "Hallo Anna,", person: ole, fenster: f, now });
    expect(du).toContain("Ole ruft dich heute zwischen");
    const t = rueckrufTexte("sie", herr);
    expect(t.titel).toBe("Wann passt Ihnen ein Anruf?");
    expect(t.anrufVon).toBe("Anruf von Herrn Kannapinn");
    expect(rueckrufTexte("du", ole).titel).toBe("Wann passt dir ein Anruf?");
    const alle = [sie, du, ...Object.values(t), ...Object.values(rueckrufTexte("du", ole))].join(" ");
    expect(hatGedankenstrich(alle)).toBe(false);
  });

  it("Notiz bereinigt, Pause bis zwei Tage nach dem Fenster", () => {
    expect(bereinigeNotiz("  hallo\n\n welt ")).toBe("hallo welt");
    expect(bereinigeNotiz("   ")).toBeNull();
    expect(bereinigeNotiz(42)).toBeNull();
    expect(bereinigeNotiz("x".repeat(300))).toHaveLength(200);
    const bis = new Date("2026-11-17T15:30:00Z");
    expect(rueckrufPauseBis({ bis }, new Date()).getTime()).toBe(bis.getTime() + 2 * DAY);
  });
});

describe("Bedenkzeit: Tag, Erkennung, Texte", () => {
  it("1 Woche, 2 Wochen (Standard), Ende des Monats, Wochenende auf Montag, 10 Uhr", () => {
    const di = berlin("2026-11-17T11:00:00");
    expect(bedenkzeitTag("1w", di)).toBe("2026-11-24");
    expect(bedenkzeitTag("2w", di)).toBe("2026-12-01");
    expect(bedenkzeitTag("monatsende", di)).toBe("2026-11-30");
    // Weniger als 7 Tage bis zum Monatsende: Ende des nächsten Monats
    expect(bedenkzeitTag("monatsende", berlin("2026-11-26T11:00:00"))).toBe("2026-12-31");
    // Samstag plus 7 Tage ist Samstag: Montag danach
    expect(bedenkzeitTag("1w", berlin("2026-11-21T11:00:00"))).toBe("2026-11-30");
    expect(bedenkzeitDatum("2w", di).toISOString()).toBe("2026-12-01T09:00:00.000Z");
    expect(bedenkzeitAusDatum("2026-11-17", di)).toBeNull();
    expect(bedenkzeitAusDatum("2026-11-18", di)?.toISOString()).toBe("2026-11-18T09:00:00.000Z");
    expect(bedenkzeitAusDatum("2027-03-01", di)).toBeNull();
    expect(bedenkzeitAusDatum("18.11.2026", di)).toBeNull();
  });

  it("erkennt „ich überlege noch“ und „ich melde mich“, nicht Fragen, Absagen oder Abmelden", () => {
    for (const t of ["Ich überlege noch", "Danke, ich melde mich", "Muss ich mir in Ruhe überlegen.", "Ich muss das erst mit meiner Frau besprechen", "Ich brauche noch etwas Zeit", "Ich denke nochmal drüber nach"]) {
      expect(erkenneBedenkzeit(t), t).toEqual({ bedenkzeit: true, wahl: null, andereZeit: false });
    }
    expect(erkenneBedenkzeit("Ich melde mich in 2 Wochen")).toEqual({ bedenkzeit: true, wahl: "2w", andereZeit: false });
    expect(erkenneBedenkzeit("überlege es mir bis nächste Woche")).toEqual({ bedenkzeit: true, wahl: "1w", andereZeit: false });
    expect(erkenneBedenkzeit("Ich melde mich Ende des Monats")).toEqual({ bedenkzeit: true, wahl: "monatsende", andereZeit: false });
    expect(erkenneBedenkzeit("Ich überlege bis Freitag")).toEqual({ bedenkzeit: true, wahl: null, andereZeit: true });
    expect(erkenneBedenkzeit("melde mich am 3.12.")).toEqual({ bedenkzeit: true, wahl: null, andereZeit: true });
    for (const t of ["Ich überlege noch, was kostet das genau?", "Ich melde mich ab", "Kein Interesse, ich überlege nicht weiter", "Ja, passt", "Eher der Beitrag", "", null]) {
      expect(erkenneBedenkzeit(t).bedenkzeit, String(t)).toBe(false);
    }
  });

  it("Knöpfe im Chat (Payload) und Texte in beiden Fassungen ohne Gedankenstriche", () => {
    expect(BEDENKZEIT_KNOEPFE.map((k) => k.title)).toEqual(["1 Woche", "2 Wochen", "Ende des Monats"]);
    expect(BEDENKZEIT_KNOEPFE.every((k) => k.title.length <= 20)).toBe(true);
    expect(knopfAktion("interactive", "2 Wochen", "bedenkzeit:2w")).toEqual({ aktion: "bedenkzeit", wahl: "2w" });
    expect(knopfAktion("interactive", "Ende des Monats", "bedenkzeit:monatsende")).toEqual({ aktion: "bedenkzeit", wahl: "monatsende" });
    // Getippt statt Knopf: normale Antwort
    expect(knopfAktion("text", "2 Wochen", null)).toBeNull();
    const bis = new Date("2026-12-01T09:00:00Z");
    expect(bedenkzeitBestaetigung("sie", bis)).toBe("Alles klar, dann melde ich mich am Dienstag, 1. Dezember wieder. Wenn vorher Fragen aufkommen, schreiben Sie einfach hier.");
    expect(bedenkzeitBestaetigung("du", bis)).toContain("schreib einfach hier");
    expect(bedenkzeitFrage("sie")).toBe("Gern, nehmen Sie sich ruhig Zeit. Wann darf ich mich wieder bei Ihnen melden?");
    const neu = bedenkzeitNeustartText({ an: "sie", hi: "Guten Tag Frau Becker,", topic: "Haftpflicht und Hausrat", person: herr });
    expect(neu).toBe(
      "Guten Tag Frau Becker, wie besprochen melde ich mich wieder zu Ihrem Angebot für Haftpflicht und Hausrat. Haben Sie noch Fragen? Ist für Sie eher der Beitrag oder die Leistung entscheidend?",
    );
    expect(bedenkzeitNeustartText({ an: "du", hi: "Hallo Anna,", topic: "Hausrat", person: ole, selbst: true })).toContain("zum Angebot, das Ole dir geschickt hat");
    expect(hatGedankenstrich([bedenkzeitFrage("du"), bedenkzeitFrage("sie"), bedenkzeitBestaetigung("du", bis), neu].join(" "))).toBe(false);
  });
});

describe("Bedenkzeit: Abfolge und Nachrichtenplan", () => {
  const ctx = { firstName: "Anna", hi: "Guten Tag Frau Becker,", kontakt: becker, topic: "Haftpflicht und Hausrat", an: "sie" as const, person: herr };

  it("startet neu mit einer WhatsApp zum Angebot, nie mit der Terminvorschlags-Vorlage followup", () => {
    const s = SEQUENCES.offer_bedenkzeit.steps;
    expect(s.map((x) => [x.day, x.action])).toEqual([
      [0, "whatsapp"],
      // Paket M4: 2 Std. nach der WhatsApp die Mail „Wie besprochen“ (nur beim Versand über die App)
      [2 / 24, "email"],
      [3, "call"],
      [5, "email"],
      [10, "whatsapp"],
      [12, "call"],
    ]);
    expect(SEQUENCES.offer_selbst_bedenkzeit.steps.some((x) => x.action === "email")).toBe(false);
    const wa = s[0] as Extract<(typeof s)[number], { action: "whatsapp" }>;
    expect(wa.purpose).toBe("offer_bedenkzeit");
    expect(wa.fallback?.purpose).toBe("followup_offer");
    expect(wa.fallbackNote).toBe(BEDENKZEIT_AUFGABE);
    for (const k of ["offer_bedenkzeit", "offer_selbst_bedenkzeit"] as const) {
      for (const st of SEQUENCES[k].steps) if (st.action === "whatsapp") expect(st.purpose).not.toBe("followup");
    }
    expect(wa.text(ctx)).toContain("wie besprochen melde ich mich wieder zu Ihrem Angebot für Haftpflicht und Hausrat");
  });

  const basis = (now: Date, abfolgen: PlanEingabe["abfolgen"], anrufplan: Partial<PlanEingabe["anrufplan"]> = {}): PlanEingabe => ({
    now,
    an: "sie",
    hi: "Guten Tag Frau Becker,",
    person: herr,
    label: "Frau Becker",
    leadId: "l1",
    termine: [],
    email: false,
    emailKontakt: true,
    whatsapp: true,
    abfolgen,
    abfolgeKontext: ctx,
    anrufplan: { followUpAt: null, followUpNote: null, callAttempts: 0, callPlanStartedAt: null, lastCallAttemptAt: null, ...anrufplan },
  });

  it("Pause: bis zum Tag der Bedenkzeit nichts, dann WhatsApp und die übrigen Schritte ab diesem Tag", () => {
    const now = new Date("2026-11-17T10:00:00Z");
    const bis = new Date("2026-12-01T09:00:00Z");
    const plan = planeNachrichten(basis(now, [{ id: "b1", kind: "offer_bedenkzeit", step: 0, startedAt: now, nextAt: bis, neustartAt: bis, stoppedAt: null }]));
    // Erster Eintrag: Vorab-Check am Vorabend (Mo 30.11., 18 Uhr), dann die WhatsApp am Tag
    expect(plan[0]).toMatchObject({ kanal: "push", at: "2026-11-30T17:00:00.000Z" });
    const wa = plan.find((e) => e.kanal === "whatsapp")!;
    expect(wa.at).toBe(bis.toISOString());
    expect(wa.titel).toContain("Bedenkzeit zum Angebot: WhatsApp (Schritt 1 von 6), nach der Bedenkzeit");
    // Paket M4: Mail „Wie besprochen“ 2 Std. nach der WhatsApp, ohne eigenen Vorab-Check
    const mail = plan.find((e) => e.kanal === "email")!;
    expect(mail.at).toBe(new Date(bis.getTime() + 2 * 60 * 60 * 1000).toISOString());
    expect(mail.vorschau).toContain("wie besprochen melde ich mich heute");
    expect(plan.filter((e) => e.kanal === "push" && e.at === "2026-11-30T17:00:00.000Z")).toHaveLength(1);
    expect(wa.vorschau).toContain("wie besprochen melde ich mich wieder");
    expect(plan.every((e) => e.at >= "2026-11-30")).toBe(true);
    // Anruf-Aufgabe 3 Tage nach dem Neustart, nicht nach dem Start der Pause
    expect(plan.find((e) => e.kanal === "anruf")?.at).toBe(new Date(bis.getTime() + 3 * DAY).toISOString());
  });

  it("Rückruf: verschobene Angebots-Abfolge und die Aufgabe mit Zeitfenster stehen im Plan", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    const start = new Date("2026-11-17T09:00:00Z");
    // Nach dem Rückruf-Wunsch um 2 Tage verschoben (pauseAngebotsAbfolge): Tag 5 (E-Mail) fällt auf den 24.11.
    const shift = 2 * DAY;
    const plan = planeNachrichten(
      basis(now, [{ id: "o1", kind: "offer", step: 2, startedAt: start, nextAt: new Date(start.getTime() + 5 * DAY + shift), neustartAt: new Date(start.getTime() + shift), stoppedAt: null }], {
        followUpAt: new Date("2026-11-20T11:00:00Z"),
        followUpNote: "Rückrufwunsch: 12 bis 16:30 Uhr",
      }),
    );
    expect(plan[0]).toMatchObject({ kanal: "anruf", titel: "Rückrufwunsch: 12 bis 16:30 Uhr", at: "2026-11-20T11:00:00.000Z" });
    expect(plan.find((e) => e.kanal === "email")?.at).toBe("2026-11-24T09:00:00.000Z");
    // Letzte WhatsApp Tag 10 ab dem verschobenen Start (So 29.11.), also Mo 30.11. 9 Uhr
    expect(plan.find((e) => e.kanal === "whatsapp")?.at).toBe("2026-11-30T08:00:00.000Z");
  });
});

describe("Vorlage offer_bedenkzeit", () => {
  it("zur Einreichung freigegeben (Ole, 17.11.2026), Meta-tauglich, ohne Terminvorschläge, mit den Angebots-Knöpfen", () => {
    for (const p of BEDENKZEIT_PURPOSES) {
      expect(CORE_PURPOSES).toContain(p);
      expect(plannedTemplates(purposesFor({ bestand: false })).filter((t) => t.purpose === p)).toHaveLength(3);
      for (const form of ["du", "sie", "sie_ohne_name"] as const) {
        const req = buildTemplateRequest(p, { firm: "Agentur Meier", advisor: "Susanne Meier" }, undefined, form);
        const body = (req.components as { type: string; text?: string }[]).find((c) => c.type === "BODY")!.text!;
        expect(metaTemplateProblems(body, exampleValuesFor(p, form)), `${p} ${form}`).toEqual([]);
        expect(hatGedankenstrich(body)).toBe(false);
        expect(body).toContain("Wie besprochen melde ich mich wieder");
      }
      expect(templateNameFor(p, undefined, "sie")).toBe(`pg_${p}_v6_sie`);
      expect(categoryFor(p)).toBe("MARKETING");
    }
    expect(TEMPLATE_BUTTONS.offer_bedenkzeit).toEqual(["Eher der Beitrag", "Eher die Leistung", "Kein Bedarf mehr"]);
  });
});
