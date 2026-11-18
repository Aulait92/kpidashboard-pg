// Paket P6 „Nächste Nachrichten sichtbar“ (Ole, 17.11.2026): Aktionen und Markierungen im Nachrichtenplan, Zählung für
// „Heute“, Schlüssel der Aktionen und die Ablaufübersicht (dieselben Daten wie der Plan).
import { describe, expect, it } from "vitest";
import { planeNachrichten, zaehleAutomatische, type PlanEingabe, type PlanTermin } from "@/lib/nachrichtenplan";
import { zielAus } from "@/lib/nachrichtenplan-aktionen";
import { morgenText } from "@/lib/morgen-text";
import { abstandText, standardAblauf, vorherText } from "@/lib/ablauf";
import { SEQUENCES } from "@/lib/lead-sequences";

const H = 60 * 60 * 1000;
const DAY = 24 * H;
// Di 17.11.2026, 10:00 Berlin
const now = new Date("2026-11-17T09:00:00.000Z");

const basis = (extra: Partial<PlanEingabe> = {}): PlanEingabe => ({
  now,
  an: "sie",
  hi: "Guten Tag Frau Becker,",
  person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" },
  label: "Frau Becker",
  leadId: "l1",
  termine: [],
  email: true,
  whatsapp: true,
  abfolgen: [],
  abfolgeKontext: { firstName: "Anna", hi: "Guten Tag Frau Becker,", kontakt: { fullName: "Anna Becker", salutation: "Frau" }, topic: "Hausrat", an: "sie" },
  anrufplan: { followUpAt: null, followUpNote: null, callAttempts: 0, callPlanStartedAt: null, lastCallAttemptAt: null },
  ...extra,
});

const termin = (extra: Partial<PlanTermin> = {}): PlanTermin => ({
  id: "t1",
  startsAt: new Date(now.getTime() + 48 * H),
  createdAt: now,
  mode: "video",
  meetUrl: "https://meet.google.com/x",
  status: "booked",
  komplettcheck: false,
  reminderSentAt: null,
  soonReminderSentAt: null,
  startReminderSentAt: null,
  startPushAt: null,
  rescheduleRequestedAt: null,
  attendance: null,
  ...extra,
});

describe("Nachrichtenplan: Aktionen je Eintrag", () => {
  it("Erinnerungen überspringbar, Push an Sie nur Anzeige; jeder Eintrag mit eindeutigem Schlüssel", () => {
    const plan = planeNachrichten(basis({ termine: [termin()] }));
    expect(plan.map((e) => [e.key, e.aktionen ?? []])).toEqual([
      ["erinnerung:t1:vortag", ["ueberspringen"]],
      ["erinnerung:t1:vortag_mail", ["ueberspringen"]],
      ["erinnerung:t1:stunde", ["ueberspringen"]],
      ["erinnerung:t1:gleich", ["ueberspringen"]],
      ["start:t1", []],
    ]);
    expect(new Set(plan.map((e) => e.key)).size).toBe(plan.length);
  });

  it("übersprungene Erinnerung bleibt sichtbar (durchgestrichen) mit „Rückgängig“", () => {
    const plan = planeNachrichten(basis({ termine: [termin({ erinnerungenUebersprungen: ["stunde"] })] }));
    const stunde = plan.find((e) => e.key === "erinnerung:t1:stunde")!;
    expect(stunde.uebersprungen).toBe(true);
    expect(stunde.aktionen).toEqual(["rueckgaengig"]);
    expect(plan.find((e) => e.key === "erinnerung:t1:vortag")!.uebersprungen).toBeUndefined();
  });

  it("Abfolge: nächster Schritt jetzt/verschieben/überspringen, spätere nur überspringen, Anruf ohne „jetzt“", () => {
    const plan = planeNachrichten(
      basis({ abfolgen: [{ id: "s1", kind: "not_reached", step: 0, startedAt: now, nextAt: now, stoppedAt: null }] }),
    );
    const a = plan.filter((e) => e.quelle === "abfolge");
    expect(a.map((e) => [e.key, e.kanal, e.aktionen])).toEqual([
      ["abfolge:s1:0", "whatsapp", ["jetzt", "verschieben", "ueberspringen"]],
      ["abfolge:s1:1", "anruf", ["ueberspringen"]],
      ["abfolge:s1:2", "whatsapp", ["ueberspringen"]],
    ]);
    const anruf = planeNachrichten(basis({ abfolgen: [{ id: "s1", kind: "not_reached", step: 1, startedAt: now, nextAt: new Date(now.getTime() + 2 * DAY), stoppedAt: null }] }));
    expect(anruf[0].aktionen).toEqual(["verschieben", "ueberspringen"]);
  });

  it("übersprungener Angebots-Schritt: kein Vorab-Check und kein Push dazu", () => {
    const abfolge = { id: "o1", kind: "offer", step: 0, startedAt: now, nextAt: new Date(now.getTime() + 2 * DAY), stoppedAt: null };
    const normal = planeNachrichten(basis({ abfolgen: [abfolge] }));
    expect(normal.some((e) => e.key === "vorab:o1:0")).toBe(true);
    expect(normal.some((e) => e.key === "push:o1:1")).toBe(true);
    const weg = planeNachrichten(basis({ abfolgen: [{ ...abfolge, uebersprungen: [0, 1] }] }));
    expect(weg.some((e) => e.key === "vorab:o1:0" || e.key === "push:o1:1")).toBe(false);
    expect(weg.find((e) => e.key === "abfolge:o1:0")).toMatchObject({ uebersprungen: true, aktionen: ["rueckgaengig"] });
  });

  it("Verschieben über neustartAt: die folgenden Schritte rücken mit", () => {
    const a = { id: "o1", kind: "offer", step: 0, startedAt: now, nextAt: new Date(now.getTime() + 2 * DAY), stoppedAt: null };
    const vorher = planeNachrichten(basis({ abfolgen: [a] })).find((e) => e.key === "abfolge:o1:1")!;
    const nachher = planeNachrichten(basis({ abfolgen: [{ ...a, nextAt: new Date(now.getTime() + 4 * DAY), neustartAt: new Date(now.getTime() + 2 * DAY) }] })).find((e) => e.key === "abfolge:o1:1")!;
    // Tag 3 (Anruf-Aufgabe, ohne Versandfenster) liegt jetzt zwei Tage später
    expect(new Date(nachher.at).getTime() - new Date(vorher.at).getTime()).toBe(2 * DAY);
  });

  it("„Alle pausieren“: Nachrichten an den Lead und die Abfolge pausiert, Push zum Terminbeginn und Anrufplan nicht", () => {
    const plan = planeNachrichten(
      basis({
        pausiertAt: now,
        termine: [termin()],
        anrufplan: { followUpAt: new Date(now.getTime() + H), followUpNote: "Anrufversuch 2 von 6", callAttempts: 1, callPlanStartedAt: now, lastCallAttemptAt: now },
      }),
    );
    expect(plan.filter((e) => e.quelle === "erinnerung").every((e) => e.pausiert)).toBe(true);
    expect(plan.find((e) => e.key === "start:t1")!.pausiert).toBeUndefined();
    const anruf = plan.find((e) => e.key === "anruf:2")!;
    expect(anruf.pausiert).toBeUndefined();
    // nächster Anrufversuch verschiebbar, die weiteren nicht
    expect(anruf.aktionen).toEqual(["verschieben"]);
    expect(plan.find((e) => e.key === "anruf:3")!.aktionen).toBeUndefined();
  });
});

describe("Zeile auf „Heute“: morgen automatische Nachrichten", () => {
  it("zählt nur WhatsApp und E-Mail an den Lead im Zeitraum, ohne übersprungene und pausierte", () => {
    // Termin übermorgen 10 Uhr: Vortag (WhatsApp + Mail) morgen 10 Uhr, 1 Std. und 15 Min. übermorgen
    const von = new Date("2026-11-17T23:00:00.000Z");
    const bis = new Date("2026-11-18T23:00:00.000Z");
    const t = termin();
    expect(zaehleAutomatische(planeNachrichten(basis({ termine: [t] })), von, bis).map((e) => e.key)).toEqual(["erinnerung:t1:vortag", "erinnerung:t1:vortag_mail"]);
    expect(zaehleAutomatische(planeNachrichten(basis({ termine: [termin({ erinnerungenUebersprungen: ["vortag_mail"] })] })), von, bis)).toHaveLength(1);
    expect(zaehleAutomatische(planeNachrichten(basis({ termine: [t], pausiertAt: now })), von, bis)).toHaveLength(0);
  });
  it("Text", () => {
    expect(morgenText(1)).toBe("Morgen: 1 automatische Nachricht");
    expect(morgenText(3)).toBe("Morgen: 3 automatische Nachrichten");
  });
});

describe("Schlüssel der Aktionen", () => {
  it("liest Abfolge, Erinnerung und Anrufversuch, sonst null", () => {
    expect(zielAus("abfolge:s1:2")).toEqual({ art: "abfolge", abfolgeId: "s1", schritt: 2 });
    expect(zielAus("erinnerung:t1:vortag_mail")).toEqual({ art: "erinnerung", terminId: "t1", erinnerung: "vortag_mail" });
    expect(zielAus("anruf:3")).toEqual({ art: "anruf", versuch: 3 });
    expect(zielAus("erinnerung:t1:quatsch")).toBeNull();
    expect(zielAus("start:t1")).toBeNull();
    expect(zielAus("vorab:o1:0")).toBeNull();
  });
});

describe("Ablaufübersicht (Einstellungen → Assistent → Ablauf)", () => {
  const person = { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" };
  const montag = new Date("2026-11-23T09:00:00.000Z");
  const sie = standardAblauf({ an: "sie", person, beispielTermin: montag, anrufStart: montag });
  const du = standardAblauf({ an: "du", person: { nom: "Ole", dat: "Ole" }, beispielTermin: montag, anrufStart: montag });

  it("Phasen in der Reihenfolge der Strecke, mit allen Stationen", () => {
    expect(sie.map((p) => p.key)).toEqual(["erstkontakt", "termin", "angebot", "bedenkzeit"]);
    expect(sie[0].schritte.map((s) => s.key)).toEqual(["erstanschreiben", "zwischenfrage", "terminvorschlag"]);
    expect(sie[1].schritte.map((s) => s.key)).toEqual(["buchung", "vortag", "stunde", "gleich", "start"]);
    expect(sie[1].schritte.map((s) => s.wann).slice(1, 4)).toEqual(["1 Tag vorher", "1 Std. vorher", "15 Min. vorher"]);
  });

  it("Nachfassen zum Angebot aus denselben Abfolgen wie der Plan (Tag 2, 3, 5, 10, 12)", () => {
    const offer = sie[2].schritte.filter((s) => s.key.startsWith("offer:"));
    expect(offer.map((s) => [s.wann, s.kanal])).toEqual(SEQUENCES.offer.steps.map((st) => [`Tag ${st.day}`, st.action === "call" ? "anruf" : st.action]));
    expect(offer.find((s) => s.kanal === "email")!.vorschau).toMatch(/^Betreff: /);
    expect(offer[0].vorschau).toContain("Guten Tag Frau Becker,");
  });

  it("Anrufplan mit sechs Versuchen, Zeiten aus dem Anrufplan", () => {
    const anruf = sie[0].sonst!.find((z) => z.key === "anrufplan")!;
    expect(anruf.schritte.filter((s) => s.kanal === "anruf").map((s) => s.titel)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `Anrufversuch ${n} von 6`));
    expect(anruf.schritte.find((s) => s.key === "anruf:2")!.wann).toBe("Tag 1, 12 Uhr");
  });

  it("Texte in der eingestellten Ansprache, mit dem Namen des Vermittlers, ohne Gedankenstriche", () => {
    const texte = (ps: typeof sie) => ps.flatMap((p) => [...p.schritte, ...(p.sonst ?? []).flatMap((z) => z.schritte)]).map((s) => s.vorschau ?? "");
    expect(texte(sie).join("\n")).toContain("Herrn Kannapinn");
    expect(texte(sie).some((t) => /\b(dich|dir|dein)\b/.test(t))).toBe(false);
    expect(texte(du).some((t) => /\b(dich|dir|dein)\b/i.test(t))).toBe(true);
    for (const t of [...texte(sie), ...texte(du)]) expect(t).not.toMatch(/ [–—] /);
  });

  it("Abstände lesbar", () => {
    expect(abstandText(0)).toBe("Sofort");
    expect(abstandText(2 / 24)).toBe("nach 2 Std.");
    expect(abstandText(3)).toBe("nach 3 Tagen");
    expect(abstandText(5, "tag")).toBe("Tag 5");
    expect(vorherText(15 * 60 * 1000)).toBe("15 Min. vorher");
  });
});
