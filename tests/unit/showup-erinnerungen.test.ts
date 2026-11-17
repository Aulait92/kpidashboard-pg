// Show-up-Paket (Ole, 17.11.2026): Regeln und Texte der drei Erinnerungen, vorbereitete Vorlagen (nicht eingereicht).
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
import { metaTemplateProblems, plannedTemplates, purposesFor, templateNameFor, buildTemplateRequest, VORBEREITETE_PURPOSES, CORE_PURPOSES, categoryFor, exampleValuesFor } from "@/lib/whatsapp/template-plan";
import { TEMPLATE_BODY, TEMPLATE_BUTTONS, VORBEREITETE_FASSUNG, templateTextFor, KNOPF } from "@/lib/whatsapp/templates";

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

describe("Neue Vorlagen: nur vorbereitet, nicht eingereicht", () => {
  it("15 Min. und „wartet im Videoraum“ sind nicht in der Einreichung, aber Meta-tauglich (UTILITY)", () => {
    for (const p of VORBEREITETE_PURPOSES) {
      expect(CORE_PURPOSES).not.toContain(p);
      expect(purposesFor({ bestand: true, empfehlung: true })).not.toContain(p);
      expect(plannedTemplates(purposesFor({ bestand: true, empfehlung: true })).some((t) => t.purpose === p)).toBe(false);
      expect(categoryFor(p)).toBe("UTILITY");
      for (const form of ["du", "sie", "sie_ohne_name"] as const) {
        const req = buildTemplateRequest(p, { firm: "Agentur Meier", advisor: "Susanne Meier" }, undefined, form);
        const body = (req.components as { type: string; text?: string }[]).find((c) => c.type === "BODY")!.text!;
        expect(metaTemplateProblems(body, exampleValuesFor(p, form)), `${p} ${form}`).toEqual([]);
      }
      expect(templateNameFor(p, undefined, "sie")).toBe(`pg_${p}_v5_sie`);
    }
    expect(TEMPLATE_BUTTONS.reminder_start).toEqual([KNOPF.verschieben]);
    expect(TEMPLATE_BODY.appt_waiting.sie).toContain("wartet schon im Videoraum auf Sie");
  });

  it("Vortag und 1 Stunde: neue Fassung v5 vorbereitet, eingereicht bleibt v4", () => {
    expect(templateNameFor("reminder", undefined, "sie")).toBe("pg_reminder_v4_sie");
    for (const p of ["reminder", "reminder_soon"] as const) {
      const f = VORBEREITETE_FASSUNG[p]!;
      expect(f.version).toBe("v5");
      for (const an of ["du", "sie"] as const) {
        const text = `${an === "du" ? "Hallo" : "Guten Tag"} {{1}}, ${f[an]}`;
        expect(metaTemplateProblems(text, f.beispiele[an]), `${p} ${an}`).toEqual([]);
        expect(text).not.toMatch(/[–—]/);
      }
      expect(f.sie).not.toMatch(/\b(du|dich|dir|dein)\b/);
      expect(f.du).not.toMatch(/\b(Sie|Ihnen|Ihr|Ihre)\b/);
    }
    expect(templateTextFor("reminder", "sie")).toContain("Passt der Termin für Sie?");
  });
});
