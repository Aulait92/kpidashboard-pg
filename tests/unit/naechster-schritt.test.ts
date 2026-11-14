// Nächster Schritt und Verloren-Schutz (Ole, 14.11.2026): reine Regeln ohne Datenbank.
import { describe, expect, it } from "vitest";
import { needsNextStep, nextStepRateOf, nextStepState } from "@/lib/lead-next-step";
import { canChooseUnreachable, lostReasonOf, lostWarningText, needsLostWarning, LOST_REASONS } from "@/lib/lead-lost";
import { callPlanNote, fmtAttemptAt, isCallPlanNote, isReplaceableCallTask, nextCallAttemptAt } from "@/lib/call-plan";
import { reminderText } from "@/lib/next-step-reminder";
import { candidateTips, type TipSignals } from "@/lib/zahlen-tipps";

const berlin = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

describe("Definition nächster Schritt", () => {
  it("Termin vereinbart mit künftigem Termin hat einen nächsten Schritt (Fehler aus der Kontakte-Liste)", () => {
    expect(nextStepState({ status: "In Beratung", hasUpcomingAppointment: true })).toBe("ok");
    expect(nextStepState({ status: "Termin vereinbart", hasUpcomingAppointment: true })).toBe("ok");
    expect(needsNextStep({ status: "In Beratung", hasUpcomingAppointment: true })).toBe(false);
  });
  it("Wiedervorlage (auch überfällig) und laufendes Bot-Gespräch zählen", () => {
    expect(nextStepState({ status: "Nicht erreicht", followUpAt: new Date("2020-01-01") })).toBe("ok");
    expect(nextStepState({ status: "Im Gespräch", hasActiveBotChat: true })).toBe("ok");
  });
  it("ohne alles: kein nächster Schritt; Termin vorbei ohne Ergebnis: Ergebnis fehlt", () => {
    expect(nextStepState({ status: "Im Gespräch" })).toBe("missing");
    expect(nextStepState({ status: "In Beratung", hasPastAppointmentWithoutResult: true })).toBe("result_missing");
    expect(needsNextStep({ status: "In Beratung", hasPastAppointmentWithoutResult: true })).toBe(true);
    // Vorbeigegangener Termin, aber neuer Termin gebucht: Schritt vorhanden
    expect(nextStepState({ status: "In Beratung", hasPastAppointmentWithoutResult: true, hasUpcomingAppointment: true })).toBe("ok");
  });
  it("neue, gewonnene, verlorene, stornierte und gelöschte Leads brauchen keinen Schritt", () => {
    expect(nextStepState({ status: "Neuer Lead" })).toBe("none");
    expect(nextStepState({ status: null })).toBe("none");
    expect(nextStepState({ status: "Abschluss" })).toBe("none");
    expect(nextStepState({ status: "Kein Interesse" })).toBe("none");
    expect(nextStepState({ status: "Disqualifiziert" })).toBe("none");
    expect(nextStepState({ status: "Storno" })).toBe("none");
    expect(nextStepState({ status: "Im Gespräch", stornoState: "requested" })).toBe("none");
    expect(nextStepState({ status: "Im Gespräch", stornoState: "rejected" })).toBe("missing");
    expect(nextStepState({ status: "Im Gespräch", erasedAt: new Date() })).toBe("none");
    expect(nextStepState({ status: "Im Gespräch", closedAt: new Date() })).toBe("none");
  });
  it("Quote", () => {
    expect(nextStepRateOf(0, 0)).toBeNull();
    expect(nextStepRateOf(10, 2)).toBe(0.8);
    expect(nextStepRateOf(4, 0)).toBe(1);
  });
});

describe("Verloren: Warnung unter 6 Anrufversuchen", () => {
  const neverReached = (n: number) => ({ reached: false, callAttempts: n });
  it("warnt bei nie erreichten Leads unter 6 Versuchen", () => {
    expect(needsLostWarning(neverReached(1), "schon_versichert")).toBe(true);
    expect(needsLostWarning(neverReached(5), "passt_nicht")).toBe(true);
    expect(needsLostWarning(neverReached(5), "sonstiges")).toBe(true);
    expect(lostWarningText(1)).toBe("Erst 1 von 6 Anrufversuchen. Viele Leads erreicht man erst beim 4. bis 6. Versuch.");
  });
  it("keine Warnung ab 6 Versuchen oder wenn der Lead erreicht wurde", () => {
    expect(needsLostWarning(neverReached(6), "schon_versichert")).toBe(false);
    expect(needsLostWarning({ reached: true, callAttempts: 0 }, "passt_nicht")).toBe(false);
  });
  it("Ausnahmen ohne Warnung: falsche Daten bzw. Nummer, hat nichts angefragt, kein Interesse im Gespräch", () => {
    for (const k of ["falsche_daten", "nicht_angefragt", "kein_interesse"] as const) expect(needsLostWarning(neverReached(0), k)).toBe(false);
  });
  it("„Nach 6 Versuchen nicht erreichbar“ erst nach 6 Versuchen ohne Erreichen", () => {
    expect(canChooseUnreachable(neverReached(5))).toBe(false);
    expect(canChooseUnreachable(neverReached(6))).toBe(true);
    expect(canChooseUnreachable({ reached: true, callAttempts: 9 })).toBe(false);
  });
  it("nie erreichte Gründe bleiben „nicht erreicht“ (Disqualifiziert statt Kein Interesse)", () => {
    const r = Object.fromEntries(LOST_REASONS.map((x) => [x.key, x]));
    expect(r.nicht_erreichbar.status).toBe("Disqualifiziert");
    expect(r.nicht_erreichbar.reached).toBe(false);
    expect(r.falsche_daten.status).toBe("Disqualifiziert");
    expect(r.kein_interesse.status).toBe("Kein Interesse");
    expect(r.sonstiges.needsNote).toBe(true);
  });
  it("alte Status und Gründe werden abgebildet", () => {
    expect(lostReasonOf({ status: "Kein Interesse" })).toBe("kein_interesse");
    expect(lostReasonOf({ status: "Disqualifiziert", disqualifyReason: "falsche_nummer" })).toBe("falsche_daten");
    expect(lostReasonOf({ status: "Disqualifiziert", disqualifyReason: "kein_bedarf" })).toBe("passt_nicht");
    expect(lostReasonOf({ status: "Disqualifiziert", lostReason: "nicht_angefragt" })).toBe("nicht_angefragt");
    expect(lostReasonOf({ status: "Im Gespräch", lostReason: "kein_interesse" })).toBeNull();
  });
  it("keine Gedankenstriche in den Texten", () => {
    for (const r of LOST_REASONS) expect(`${r.label} ${r.hint}`).not.toMatch(/[–—]/);
  });
});

describe("Anrufplan bei „nicht erreicht“", () => {
  // Di 17.11.2026, 10:00 Uhr Berlin
  const T0 = new Date("2026-11-17T09:00:00.000Z");
  const plan = () => {
    const out: Date[] = [];
    let last = T0;
    for (let done = 1; done < 6; done++) {
      const at = nextCallAttemptAt({ done, startedAt: T0, lastAt: last, now: last })!;
      out.push(at);
      last = at;
    }
    return out;
  };
  it("6 Versuche über mindestens 3 Tage zu verschiedenen Tageszeiten", () => {
    const p = plan().map(berlin);
    expect(p[0]).toBe("Di., 17.11., 12:00"); // + 2 Stunden
    expect(p[1]).toBe("Di., 17.11., 18:30"); // abends
    expect(p[2]).toBe("Mi., 18.11., 10:00"); // Tag 2 vormittags
    expect(p[3]).toBe("Fr., 20.11., 15:00"); // Tag 4 nachmittags
    expect(p[4]).toBe("Mo., 23.11., 18:30"); // Tag 6 abends, Sonntag → Montag
    expect(nextCallAttemptAt({ done: 6, startedAt: T0, lastAt: T0, now: T0 })).toBeNull();
  });
  it("nie nach 20 Uhr, nie vor 9 Uhr", () => {
    const late = new Date("2026-11-17T18:30:00.000Z"); // 19:30 Berlin
    const at = nextCallAttemptAt({ done: 1, startedAt: late, lastAt: late, now: late })!;
    expect(berlin(at)).toBe("Mi., 18.11., 09:00");
  });
  it("Plan-Aufgaben werden ersetzt, eigene Wiedervorlagen nicht", () => {
    expect(callPlanNote(3)).toBe("Anrufversuch 3 von 6");
    expect(isCallPlanNote("Anrufversuch 3 von 6")).toBe(true);
    expect(isReplaceableCallTask("Nachfassen: nochmal anrufen")).toBe(true);
    expect(isReplaceableCallTask("Nächsten Schritt festlegen")).toBe(true);
    expect(isReplaceableCallTask("Angebot nachfassen")).toBe(false);
    expect(isReplaceableCallTask(null)).toBe(false);
  });
  it("Anzeige des nächsten Versuchs", () => {
    expect(fmtAttemptAt(new Date("2026-11-17T11:00:00.000Z"), T0)).toBe("heute 12:00 Uhr");
    expect(fmtAttemptAt(new Date("2026-11-18T09:00:00.000Z"), T0)).toBe("morgen 10:00 Uhr");
  });
});

describe("Erinnerung und Tipp", () => {
  it("Text der Erinnerung ohne Gedankenstriche", () => {
    const t = reminderText(5, 2);
    expect(t.title).toBe("5 Leads brauchen einen nächsten Schritt");
    expect(t.body).toBe("3 Leads haben keinen nächsten Schritt, bei 2 Terminen fehlt das Ergebnis. Legen Sie fest, wie es weitergeht: Wiedervorlage, Termin, Gewonnen oder Verloren.");
    expect(reminderText(1, 0).title).toBe("1 Lead braucht einen nächsten Schritt");
    expect(`${t.title} ${t.body}`).not.toMatch(/[–—]/);
  });
  it("Tipp „Jedem Lead einen nächsten Schritt geben“ unter 90 %", () => {
    const base: TipSignals = {
      avgProvision: 300,
      paidLeadsPerMonth: 30,
      closedCustomers: 2,
      empfehlungEnabled: true,
      notAskedForReferral: 0,
      kollegenPraemie: null,
      kollegenEnabled: false,
      bestandImported: true,
      bestandCampaigns: 1,
      withoutCrossSell: 0,
      missingPremium: 0,
      rates: { reach: { own: null, avg: null }, termin: { own: null, avg: null }, close: { own: null, avg: null } },
    };
    expect(candidateTips({ ...base, withoutNextStep: 8, nextStepRate: 0.6 }).map((t) => t.key)).toContain("naechster_schritt");
    expect(candidateTips({ ...base, withoutNextStep: 8, nextStepRate: 0.95 }).map((t) => t.key)).not.toContain("naechster_schritt");
    expect(candidateTips(base).map((t) => t.key)).not.toContain("naechster_schritt");
  });
});
