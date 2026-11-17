// Show-up-Paket (Ole, 17.11.2026): Regeln und Texte der drei Erinnerungen, Vorlagen (freigegeben und eingereicht ab 17.11.2026).
import { describe, expect, it } from "vitest";
import {
  anwesenheitsFrage,
  erinnerungFaellig,
  erinnerungsPlan,
  gleichText,
  leadLabel,
  nachherPush,
  startPush,
  stundeText,
  vortagParams,
  vortagText,
  wartetText,
} from "@/lib/showup";
import { metaTemplateProblems, plannedTemplates, purposesFor, templateNameFor, buildTemplateRequest, VORBEREITETE_PURPOSES, CORE_PURPOSES, categoryFor, exampleValuesFor, exampleRestFor } from "@/lib/whatsapp/template-plan";
import { TEMPLATE_BODY, TEMPLATE_BUTTONS, VORBEREITETE_FASSUNG, PLATZHALTER_AB, neuePlatzhalter, paramLabelsFor, templateTextFor, KNOPF } from "@/lib/whatsapp/templates";

const H = 60 * 60 * 1000;
const MIN = 60 * 1000;
// Mi 18.11.2026, 10:00 Uhr Berlin
const START = new Date("2026-11-18T09:00:00.000Z");
const person = { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" };
const ole = { nom: "Ole", dat: "Ole" };
const termin = (vorlaufH: number, extra: Record<string, unknown> = {}) => ({
  startsAt: START,
  createdAt: new Date(START.getTime() - vorlaufH * H),
  mode: "video",
  meetUrl: "https://meet.google.com/abc-defg-hij",
  ...extra,
});

describe("Erinnerungsregeln", () => {
  it("Vortag ab 26 h Vorlauf, 1 h ab 2 h Vorlauf, 15 Min. nur Video mit Link", () => {
    const lang = erinnerungsPlan(termin(48));
    expect(lang.vortag?.toISOString()).toBe(new Date(START.getTime() - 24 * H).toISOString());
    expect(lang.stunde?.toISOString()).toBe(new Date(START.getTime() - H).toISOString());
    expect(lang.gleich?.toISOString()).toBe(new Date(START.getTime() - 15 * MIN).toISOString());
    // weniger als 26 h vorher gebucht: keine Vortags-Erinnerung
    expect(erinnerungsPlan(termin(25.9)).vortag).toBeNull();
    expect(erinnerungsPlan(termin(26)).vortag).not.toBeNull();
    // weniger als 2 h vorher gebucht: keine 1-h-Erinnerung
    expect(erinnerungsPlan(termin(1.9)).stunde).toBeNull();
    expect(erinnerungsPlan(termin(2)).stunde).not.toBeNull();
    // Telefontermin bzw. ohne Link: keine 15-Min.-Erinnerung
    expect(erinnerungsPlan(termin(48, { mode: "phone" })).gleich).toBeNull();
    expect(erinnerungsPlan(termin(48, { meetUrl: null })).gleich).toBeNull();
  });

  it("fällig, warten, entfällt (auch nach „Bitte verschieben“ und wenn die 1-h-Erinnerung schon dran ist)", () => {
    const t = termin(48);
    expect(erinnerungFaellig("vortag", t, new Date(START.getTime() - 25 * H))).toBe("warten");
    expect(erinnerungFaellig("vortag", t, new Date(START.getTime() - 23 * H))).toBe("senden");
    expect(erinnerungFaellig("vortag", t, new Date(START.getTime() - 50 * MIN))).toBe("entfaellt");
    expect(erinnerungFaellig("stunde", t, new Date(START.getTime() - 55 * MIN))).toBe("senden");
    expect(erinnerungFaellig("stunde", t, new Date(START.getTime() - 5 * MIN))).toBe("entfaellt");
    expect(erinnerungFaellig("gleich", t, new Date(START.getTime() - 14 * MIN))).toBe("senden");
    expect(erinnerungFaellig("gleich", t, new Date(START.getTime() + MIN))).toBe("entfaellt");
    const verschoben = { ...t, rescheduleRequestedAt: new Date(START.getTime() - 30 * H) };
    for (const art of ["vortag", "stunde", "gleich"] as const) expect(erinnerungFaellig(art, verschoben, new Date(START.getTime() - 14 * MIN))).toBe("entfaellt");
    expect(erinnerungFaellig("stunde", { ...t, status: "cancelled" }, new Date(START.getTime() - 55 * MIN))).toBe("entfaellt");
  });
});

describe("Texte der Erinnerungen (Sie und Du, ohne Gedankenstriche)", () => {
  const nutzenSie = "In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Ihre Familie kosten und worauf Sie achten sollten.";
  it("Vortag: Nutzensatz, Komplettcheck-Satz, Link, „Passt es weiterhin?“", () => {
    const o = { an: "sie" as const, hi: "Guten Tag Frau Becker,", wann: "morgen um 10 Uhr", nutzen: nutzenSie, komplettcheck: true, mode: "video", meetUrl: "https://meet.google.com/abc", person };
    const t = vortagText(o);
    expect(t).toBe(
      `Guten Tag Frau Becker, kurze Erinnerung an Ihren Termin morgen um 10 Uhr. ${nutzenSie} Legen Sie gern Ihre bestehenden Verträge bereit.\n\nSo geht es los: https://meet.google.com/abc\n\nPasst es weiterhin?`,
    );
    expect(vortagText({ ...o, komplettcheck: false })).not.toContain("Verträge");
    expect(vortagParams({ ...o, mode: "phone" })[2]).toBe("Herr Kannapinn ruft Sie an.");
    const du = vortagText({ ...o, an: "du", hi: "Hallo Julia,", person: ole, nutzen: "In einem kurzen Videotermin zeigt dir Ole, was Haftpflicht kostet." });
    expect(du).toContain("an deinen Termin");
    expect(du).toContain("Leg gern deine bestehenden Verträge bereit.");
    for (const x of [t, du]) expect(x).not.toMatch(/[–—]/);
  });

  it("1 Stunde vorher und 15 Minuten vorher wie von Ole vorgegeben", () => {
    expect(stundeText({ an: "sie", hi: "Guten Tag Frau Becker,", mode: "video", person })).toBe(
      "Guten Tag Frau Becker, in einer Stunde ist Ihr Videotermin mit Herrn Kannapinn. Passt bei Ihnen alles? Falls etwas dazwischengekommen ist, finden wir gern eine neue Zeit.",
    );
    expect(stundeText({ an: "du", hi: "Hallo Julia,", mode: "phone", person: ole })).toBe(
      "Hallo Julia, in einer Stunde ist dein Telefontermin mit Ole. Passt bei dir alles? Falls etwas dazwischengekommen ist, finden wir gern eine neue Zeit.",
    );
    expect(gleichText({ an: "sie", hi: "Guten Tag Frau Becker,", person, startsAt: START, meetUrl: "https://meet.google.com/abc" })).toBe(
      "Guten Tag Frau Becker, gleich geht es los: Herr Kannapinn ist um 10 Uhr für Sie im Videoraum. Der Link funktioniert direkt im Handy-Browser, ohne App: https://meet.google.com/abc. Bis gleich!",
    );
    expect(wartetText({ an: "du", hi: "Hallo Julia,", person: ole, meetUrl: "https://x.y/z" })).toBe("Hallo Julia, Ole wartet schon im Videoraum auf dich: https://x.y/z");
  });
});

describe("Terminbeginn: Frage am Termin und Pushes", () => {
  const t = { startsAt: START, endsAt: new Date(START.getTime() + 30 * MIN), mode: "video", status: "booked", attendance: null as string | null };
  it("vor dem Termin keine Frage, ab Beginn „Ist … da?“, nach „Fehlt noch“ warten, nach dem Ende „noch gekommen?“", () => {
    expect(anwesenheitsFrage(t, new Date(START.getTime() - 10 * MIN))).toBeNull();
    expect(anwesenheitsFrage(t, new Date(START.getTime() + MIN))).toBe("start");
    expect(anwesenheitsFrage({ ...t, attendance: "fehlt" }, new Date(START.getTime() + 5 * MIN))).toBe("wartet");
    expect(anwesenheitsFrage({ ...t, attendance: "fehlt" }, new Date(START.getTime() + 31 * MIN))).toBe("nachher");
    expect(anwesenheitsFrage(t, new Date(START.getTime() + 31 * MIN))).toBe("nachher");
    expect(anwesenheitsFrage({ ...t, attendance: "erschienen" }, new Date(START.getTime() + 5 * MIN))).toBeNull();
    expect(anwesenheitsFrage({ ...t, mode: "phone" }, new Date(START.getTime() + 5 * MIN))).toBeNull();
    expect(anwesenheitsFrage({ ...t, status: "no_show" }, new Date(START.getTime() + 5 * MIN))).toBeNull();
  });
  it("Push ohne Knöpfe mit Deep-Link aufs Entscheidungsblatt, Name wie „Frau Becker“", () => {
    const name = leadLabel({ fullName: "Anna Becker", salutation: "Frau" });
    expect(name).toBe("Frau Becker");
    expect(leadLabel({ fullName: "Anna Becker" })).toBe("Anna Becker");
    expect(leadLabel(null)).toBe("Ihr Kontakt");
    const p = startPush({ appointmentId: "a1", name, startsAt: START });
    expect(p).toMatchObject({ title: "Ist Frau Becker da?", url: "/buyer/termine/a1" });
    expect(nachherPush({ appointmentId: "a1", name }).title).toBe("Ist Frau Becker noch gekommen?");
  });
});

describe("Show-up-Vorlagen: freigegeben und eingereicht (17.11.2026)", () => {
  const names = { firm: "Agentur Meier", advisor: "Susanne Meier" };
  const bodyOf = (req: ReturnType<typeof buildTemplateRequest>) => (req.components as { type: string; text?: string }[]).find((c) => c.type === "BODY")!.text!;

  it("15 Min. und „wartet im Videoraum“ stehen in CORE_PURPOSES und werden je Fassung eingereicht (UTILITY, v5)", () => {
    // Show-up freigegeben; vorbereitet ist nur noch der Glückwunsch zum Abschluss (P4)
    expect(VORBEREITETE_PURPOSES).toEqual(["glueckwunsch"]);
    for (const p of ["reminder_start", "appt_waiting"] as const) {
      expect(CORE_PURPOSES).toContain(p);
      expect(purposesFor({ bestand: false, empfehlung: false })).toContain(p);
      expect(plannedTemplates(purposesFor({ bestand: false })).filter((t) => t.purpose === p).map((t) => t.form)).toEqual(["du", "sie", "sie_ohne_name"]);
      expect(categoryFor(p)).toBe("UTILITY");
      for (const form of ["du", "sie", "sie_ohne_name"] as const) {
        expect(metaTemplateProblems(bodyOf(buildTemplateRequest(p, names, undefined, form)), exampleValuesFor(p, form)), `${p} ${form}`).toEqual([]);
      }
      expect(templateNameFor(p, undefined, "sie")).toBe(`pg_${p}_v5_sie`);
    }
    expect(TEMPLATE_BUTTONS.reminder_start).toEqual([KNOPF.verschieben]);
    expect(TEMPLATE_BUTTONS.appt_waiting).toBeUndefined();
    expect(TEMPLATE_BODY.appt_waiting.sie).toContain("wartet schon im Videoraum auf Sie");
    // Du-Beispiel ohne „Herr Schmidt“
    expect(renderBody("reminder_start", "du")).toContain("Hallo Julia, gleich geht es los: Thomas ist um 10:00 Uhr für dich im Videoraum.");
  });

  it("Vortag und 1 Stunde: v5 mit Oles Text wird eingereicht, nichts mehr nur vorbereitet", () => {
    expect(VORBEREITETE_FASSUNG).toEqual({});
    expect(templateNameFor("reminder", undefined, "sie")).toBe("pg_reminder_v5_sie");
    expect(templateNameFor("reminder_soon", undefined, "sie_ohne_name")).toBe("pg_reminder_soon_v5_sie_ohne_name");
    expect(templateTextFor("reminder", "sie")).toBe("Guten Tag {{1}}, kurze Erinnerung an Ihren Termin {{2}}. {{3}} So geht es los: {{4}} Passt es weiterhin?");
    expect(templateTextFor("reminder", "du")).toBe("Hallo {{1}}, kurze Erinnerung an deinen Termin {{2}}. {{3}} So geht es los: {{4}} Passt es weiterhin?");
    expect(templateTextFor("reminder", "sie_ohne_name")).toBe("Guten Tag, kurze Erinnerung an Ihren Termin {{1}}. {{2}} So geht es los: {{3}} Passt es weiterhin?");
    expect(templateTextFor("reminder_soon", "sie")).toBe(
      "Guten Tag {{1}}, in einer Stunde ist Ihr {{2}} mit {{3}}. Passt bei Ihnen alles? Falls etwas dazwischengekommen ist, finden wir gern eine neue Zeit.",
    );
    expect(paramLabelsFor("reminder_soon", "sie_ohne_name")).toEqual(["Terminart (Videotermin bzw. Telefontermin)", "Vermittler (Dativ)"]);
    for (const p of ["reminder", "reminder_soon"] as const) {
      expect(CORE_PURPOSES).toContain(p);
      for (const form of ["du", "sie", "sie_ohne_name"] as const) {
        const body = bodyOf(buildTemplateRequest(p, names, undefined, form));
        expect(metaTemplateProblems(body, exampleValuesFor(p, form)), `${p} ${form}`).toEqual([]);
        expect(body).not.toMatch(/[–—]/);
      }
      expect(TEMPLATE_BODY[p].sie).not.toMatch(/\b(du|dich|dir|dein)\b/);
      expect(TEMPLATE_BODY[p].du).not.toMatch(/\b(Sie|Ihnen|Ihr|Ihre)\b/);
      expect(TEMPLATE_BUTTONS[p]).toEqual([KNOPF.passt, KNOPF.verschieben]);
    }
    expect(renderBody("reminder", "sie")).toContain("Legen Sie gern Ihre bestehenden Verträge bereit. So geht es los: https://meet.google.com/abc-defg-hij Passt es weiterhin?");
    expect(renderBody("reminder", "du")).toContain("zeigt dir Thomas,");
    expect(renderBody("reminder_soon", "du")).toBe(
      "Hallo Julia, in einer Stunde ist dein Videotermin mit Thomas. Passt bei dir alles? Falls etwas dazwischengekommen ist, finden wir gern eine neue Zeit.",
    );
  });

  it("Rückfall: bis zur Freigabe von v5 die bisherige v4 mit ihrer Belegung (auch in der Vorschau)", () => {
    expect(PLATZHALTER_AB.reminder).toEqual({ version: 5, frueher: ["Datum/Uhrzeit", "Art", "Link/Hinweis"] });
    expect(PLATZHALTER_AB.reminder_soon).toEqual({ version: 5, frueher: ["Uhrzeit", "Art", "Link/Hinweis"] });
    for (const p of ["reminder", "reminder_soon"] as const) {
      expect(neuePlatzhalter(p, 5)).toBe(true);
      expect(neuePlatzhalter(p, 6)).toBe(true);
      expect(neuePlatzhalter(p, 4)).toBe(false);
      expect(neuePlatzhalter(p, 0)).toBe(false);
    }
    expect(neuePlatzhalter("booking_confirmation", 4)).toBe(true);
    // Vorschau der noch gesendeten v4: alte Beispielwerte
    expect(exampleRestFor("reminder", "sie", 4)).toEqual(["Mo., 14.12., 10:00 Uhr", "Telefon", "Wir rufen Sie unter Ihrer Nummer an."]);
    expect(exampleRestFor("reminder_soon", "du", 4)).toEqual(["10:00 Uhr", "Telefon", "Wir rufen dich unter deiner Nummer an."]);
    expect(exampleRestFor("reminder_soon", "sie", 5)).toEqual(["Videotermin", "Herrn Schmidt"]);
    expect(exampleRestFor("reminder_soon", "sie")).toEqual(["Videotermin", "Herrn Schmidt"]);
  });
});

function renderBody(p: "reminder" | "reminder_soon" | "reminder_start", form: "du" | "sie") {
  const vals = exampleValuesFor(p, form);
  return templateTextFor(p, form).replace(/\{\{(\d+)\}\}/g, (_, n: string) => vals[Number(n) - 1]);
}
