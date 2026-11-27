// Nachfassen nach Status (Ole, 27.11.2026, Live-Test: „Chat ruht“ und Anrufversuch 1 bis 6 bei „Angebot gesendet“,
// dazu an einem Sonntag): Phasenregeln, Versandruhe an Sonn- und Feiertagen, Ziel nach Status, Plan-Anzeige.
import { describe, expect, it } from "vitest";
import { ANRUFPLAN, istPhasenGrund, leadPhase, passtZurPhase, phasenGrund } from "@/lib/lead-phase";
import { bundesweiteFeiertage, imVersandfenster, istRuhetag, naechsterVersandzeitpunkt } from "@/lib/versandruhe";
import { angebotSchliessenText, inSendWindow, naechstesSendefenster, SEQUENCES } from "@/lib/lead-sequences";
import { naechsterVersand } from "@/lib/angebot-senden";
import { anrufZiel } from "@/lib/anruf-ziel";
import { planeNachrichten, type PlanEingabe } from "@/lib/nachrichtenplan";
import { isWorkdayKey } from "@/lib/vertrieb/spaeter";

const b = (s: string) => new Date(`${s}+01:00`); // Berlin Winterzeit
const stand = (o: Partial<Parameters<typeof leadPhase>[0]> = {}) => ({ status: "Neuer Lead", kommenderTermin: false, terminWar: false, angebot: false, ...o });

describe("Phase eines Kontakts", () => {
  it("leitet die Phase aus Status, Terminen und Angebot ab", () => {
    expect(leadPhase(stand())).toBe("offen");
    expect(leadPhase(stand({ status: "In Beratung" }))).toBe("offen");
    expect(leadPhase(stand({ kommenderTermin: true }))).toBe("termin");
    expect(leadPhase(stand({ terminWar: true }))).toBe("nach_termin");
    expect(leadPhase(stand({ status: "Angebot gesendet", terminWar: true }))).toBe("angebot");
    expect(leadPhase(stand({ status: "In Beratung", angebot: true }))).toBe("angebot");
    // Neuer Termin geht vor dem Angebot (Fragen zum Angebot im Termin)
    expect(leadPhase(stand({ status: "Angebot gesendet", kommenderTermin: true }))).toBe("termin");
    expect(leadPhase(stand({ status: "Abschluss", kommenderTermin: true }))).toBe("abschluss");
    expect(leadPhase(stand({ status: "Kein Interesse" }))).toBe("verloren");
    expect(leadPhase(stand({ status: "Disqualifiziert" }))).toBe("verloren");
    expect(leadPhase(stand({ storno: true }))).toBe("verloren");
  });

  it("„Ist das Thema noch aktuell?“ (Chat ruht) und Anrufplan nur ohne Termin und ohne Angebot", () => {
    for (const art of ["silent", "not_reached", ANRUFPLAN]) {
      expect(passtZurPhase(art, "offen")).toBe(true);
      for (const p of ["termin", "nach_termin", "angebot", "abschluss", "verloren"] as const) expect(passtZurPhase(art, p)).toBe(false);
    }
  });

  it("Angebot: nur das Nachfassen zum Angebot (alle Arten), Abschluss: nur „Unterlagen fehlen“, Verloren: nichts", () => {
    for (const k of ["offer", "offer_selbst", "offer_bedenkzeit", "offer_selbst_bedenkzeit", "offer_status"]) {
      expect(passtZurPhase(k, "angebot")).toBe(true);
      expect(passtZurPhase(k, "offen")).toBe(false);
    }
    expect(passtZurPhase("unterlagen", "abschluss")).toBe(true);
    expect(passtZurPhase("offer", "abschluss")).toBe(false);
    expect(Object.keys(SEQUENCES).some((k) => passtZurPhase(k, "verloren"))).toBe(false);
    expect(passtZurPhase("recall", "nach_termin")).toBe(true);
    expect(passtZurPhase("silent", "termin")).toBe(false);
  });

  it("Grund ohne Personendaten, erkennbar für runSequences", () => {
    expect(phasenGrund("angebot")).toBe("Passt nicht mehr zum Stand: Angebot gesendet");
    expect(istPhasenGrund(phasenGrund("termin"))).toBe(true);
    expect(istPhasenGrund("Lead hat geantwortet")).toBe(false);
  });
});

describe("Versandruhe an Sonn- und bundesweiten Feiertagen", () => {
  it("kennt die bundesweiten Feiertage (Ostern beweglich)", () => {
    const f = bundesweiteFeiertage(2027);
    for (const t of ["2027-01-01", "2027-03-26", "2027-03-29", "2027-05-01", "2027-05-06", "2027-05-17", "2027-10-03", "2027-12-25", "2027-12-26"]) expect(f.has(t)).toBe(true);
    expect(f.size).toBe(9);
    // Fronleichnam, Reformationstag: regional, zählen nicht
    expect(f.has("2027-05-27")).toBe(false);
    expect(f.has("2027-10-31")).toBe(false);
  });

  it("Sonntag und Feiertag sind Ruhetage, Samstag nicht", () => {
    expect(istRuhetag(b("2026-11-29T14:24:00"))).toBe(true); // So 29.11., Anlass aus dem Live-Test
    expect(istRuhetag(b("2026-12-25T10:00:00"))).toBe(true); // Fr, 1. Weihnachtstag
    expect(istRuhetag(b("2026-11-28T10:00:00"))).toBe(false); // Sa
    expect(imVersandfenster(b("2026-11-28T10:00:00"))).toBe(true);
    expect(imVersandfenster(b("2026-11-29T14:24:00"), { von: 8, bis: 19 })).toBe(false);
  });

  it("verschiebt auf den nächsten Werktag 9 Uhr (auch über Feiertage hinweg)", () => {
    // So 29.11. 14:24 → Mo 30.11. 9:00
    expect(naechsterVersandzeitpunkt(b("2026-11-29T14:24:00")).toISOString()).toBe(b("2026-11-30T09:00:00").toISOString());
    // Do 24.12. 20 Uhr → Fr/Sa Weihnachten frei? 25. Fr und 26. Sa sind Feiertage, 27. So → Mo 28.12. 9:00
    expect(naechsterVersandzeitpunkt(b("2026-12-24T20:00:00")).toISOString()).toBe(b("2026-12-28T09:00:00").toISOString());
    // Alle Wege nutzen dieselbe Regel
    expect(naechstesSendefenster(b("2026-11-29T14:24:00"), { von: 8, bis: 19 }).toISOString()).toBe(b("2026-11-30T08:00:00").toISOString());
    expect(naechsterVersand(b("2026-12-25T11:00:00")).toISOString()).toBe(b("2026-12-28T09:00:00").toISOString());
    expect(inSendWindow(b("2027-03-29T10:00:00"))).toBe(false); // Ostermontag
  });

  it("Werktage im Vertrieb (Heiligabend und Silvester frei) nutzen dieselben Feiertage", () => {
    expect(isWorkdayKey("2027-03-26")).toBe(false); // Karfreitag
    expect(isWorkdayKey("2026-12-24")).toBe(false);
    expect(isWorkdayKey("2026-11-30")).toBe(true);
  });
});

describe("Nachfassen zum Angebot nach dem Status (offer_status)", () => {
  it("Tag 3 WhatsApp, Tag 7 Anruf-Aufgabe mit Push, Tag 14 „Soll ich das Angebot schließen?“", () => {
    const s = SEQUENCES.offer_status.steps;
    expect(s.map((x) => [x.day, x.action])).toEqual([
      [3, "whatsapp"],
      [7, "call"],
      [14, "whatsapp"],
    ]);
    expect(s[1]).toMatchObject({ note: "Angebot nachfassen: anrufen", push: true });
    expect(s[2]).toMatchObject({ nurFreitext: true, fallbackNote: "Angebot: Entscheidung erfragen, anrufen" });
  });

  it("Text in beiden Fassungen, ohne Gedankenstriche", () => {
    const person = { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" };
    const sie = angebotSchliessenText({ an: "sie", hi: "Guten Tag Frau Becker,", person });
    const du = angebotSchliessenText({ an: "du", hi: "Hallo Anna,", person });
    expect(sie).toBe("Guten Tag Frau Becker, kurze Frage zum Angebot, das Herr Kannapinn Ihnen geschickt hat: Möchten Sie es noch in Ruhe prüfen, oder soll ich es schließen? Eine kurze Antwort hier genügt.");
    expect(du).toBe("Hallo Anna, kurze Frage zum Angebot, das Herr Kannapinn dir geschickt hat: Möchtest du es noch in Ruhe prüfen, oder soll ich es schließen? Eine kurze Antwort hier genügt.");
    for (const t of [sie, du]) {
      expect(t).not.toMatch(/[–—]/);
      expect(t).not.toMatch(/garantie/i);
    }
  });
});

describe("Ziel nach Status", () => {
  it("„Angebot gesendet“ geht vor einer alten Plan-Notiz (vorher „Termin vereinbaren“)", () => {
    const z = anrufZiel({ kind: "followup", reason: "Anrufversuch 1 von 6", source: "Hausrat", status: "Angebot gesendet" });
    expect(z.ziel).toBe("Entscheidung zum Angebot");
  });
  it("Plan-Notiz ist nie „Ihre Notiz“", () => {
    const z = anrufZiel({ kind: "followup", reason: "Anrufversuch 2 von 6", source: "Hausrat" });
    expect(z.schritte.join(" ")).not.toContain("Anrufversuch");
    expect(z.ziel).toBe("Termin vereinbaren");
  });
  it("Termin war: Entscheidung nach dem Termin", () => {
    expect(anrufZiel({ kind: "followup", reason: "", source: null, letzterTermin: new Date("2026-11-20T10:00:00Z") }).ziel).toBe("Entscheidung nach dem Termin");
  });
});

describe("Nächste Nachrichten nach Phase", () => {
  const now = new Date("2026-11-27T09:00:00.000Z");
  const basis = (extra: Partial<PlanEingabe> = {}): PlanEingabe => ({
    now,
    an: "sie",
    hi: "Guten Tag Frau Becker,",
    person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" },
    label: "Frau Becker",
    leadId: "l1",
    termine: [],
    email: false,
    whatsapp: true,
    abfolgen: [
      { id: "s1", kind: "silent", step: 3, startedAt: new Date(now.getTime() - 2 * 86_400_000), nextAt: new Date(now.getTime() + 86_400_000), stoppedAt: null },
      { id: "s2", kind: "offer_status", step: 0, startedAt: now, nextAt: new Date(now.getTime() + 3 * 86_400_000), stoppedAt: null },
    ],
    abfolgeKontext: { firstName: "Anna", hi: "Guten Tag Frau Becker,", kontakt: { fullName: "Anna Becker", salutation: "Frau" }, topic: "Hausrat", an: "sie", person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" } },
    anrufplan: { followUpAt: new Date(now.getTime() - 86_400_000), followUpNote: "Anrufversuch 1 von 6", callAttempts: 0, callPlanStartedAt: null, lastCallAttemptAt: null },
    ...extra,
  });

  it("Angebot gesendet: kein „Chat ruht“, kein Anrufplan, nur das Nachfassen zum Angebot", () => {
    const plan = planeNachrichten(basis({ phase: "angebot" }));
    expect(plan.some((e) => e.titel.startsWith("Chat ruht"))).toBe(false);
    expect(plan.some((e) => e.quelle === "anrufplan")).toBe(false);
    expect(plan.filter((e) => e.abfolgeId === "s2").map((e) => e.kanal)).toEqual(expect.arrayContaining(["whatsapp", "anruf"]));
    expect(plan.some((e) => e.vorschau.includes("ob das Angebot") || e.vorschau.includes("soll ich es schließen"))).toBe(true);
  });

  it("Sonntag erscheint nie als Versandtag", () => {
    const plan = planeNachrichten(basis({ phase: "offen", now: b("2026-11-28T18:30:00") }));
    for (const e of plan.filter((x) => x.kanal === "whatsapp")) expect(istRuhetag(new Date(e.at))).toBe(false);
  });

  it("ohne Phase (alte Aufrufer) alles wie geplant", () => {
    const plan = planeNachrichten(basis());
    expect(plan.some((e) => e.quelle === "anrufplan")).toBe(true);
  });
});
