// Nachfassen nach Status (Ole, 27.11.2026, Live-Test): Statuswechsel auf „Angebot gesendet“ stoppt „Chat ruht“ und den
// Anrufplan und plant das Nachfassen zum Angebot; die Prüfung direkt vor dem Versand überspringt, was nicht mehr passt;
// sonntags geht nichts raus; Bereinigung bestehender Kontakte (Trockenlauf und echt, idempotent).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return { ...real, sendWhatsAppNotice: (...a: unknown[]) => send(...a) };
});
vi.mock("@/lib/whatsapp/termin-vorschlaege", () => ({ zweiTerminvorschlaege: async () => null }));
// Push an den Vermittler (Angebot Tag 7) nicht wirklich senden
vi.mock("@/lib/angebot-senden-server", async (orig) => {
  const real = await orig<typeof import("@/lib/angebot-senden-server")>();
  return { ...real, angebotAnrufPushSenden: async () => undefined };
});

import { prisma } from "@/lib/prisma";
import { restartSilentSequence, runSequences, startSequence } from "@/lib/lead-sequences";
import { syncFollowUpWithStatus } from "@/lib/lead-followup";
import { planNextCallAttempt } from "@/lib/call-attempts";
import { bereinigeNachfassen, passtNochZurPhase } from "@/lib/lead-phase-server";
import { loadNachrichtenPlan } from "@/lib/nachrichtenplan-server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const DAY = 24 * 60 * 60 * 1000;
// Fr 27.11.2026, 10:00 Berlin
const T0 = new Date("2026-11-27T09:00:00.000Z");
// So 29.11.2026, 14:24 Berlin (Anlass aus dem Live-Test)
const SONNTAG = new Date("2026-11-29T13:24:00.000Z");

describe("Nachfassen nach Status", () => {
  let customerId = "";
  let n = 0;
  const newLead = async (extra: Record<string, unknown> = {}) =>
    prisma.lead.create({ data: { customerId, name: "Anna Becker", phone: `49152000${String(++n).padStart(4, "0")}`, status: "Neuer Lead", ...extra } });
  /** Kontakt mit Termin vor zwei Tagen, „Chat ruht“ bei Schritt 4 und Anrufplan „Anrufversuch 1 von 6“ (wie im Live-Test). */
  const wieImLiveTest = async (now = T0) => {
    const lead = await newLead({ followUpAt: new Date(now.getTime() - DAY), followUpNote: "Anrufversuch 1 von 6" });
    await prisma.appointment.create({ data: { customerId, leadId: lead.id, startsAt: new Date(now.getTime() - 2 * DAY), endsAt: new Date(now.getTime() - 2 * DAY + 30 * 60_000), status: "completed", attendance: "erschienen", mode: "phone" } });
    const silent = await prisma.leadSequence.create({ data: { leadId: lead.id, customerId, kind: "silent", step: 3, startedAt: new Date(now.getTime() - DAY), nextAt: new Date(now.getTime() - 60_000) } });
    return { lead, silent };
  };

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    await prisma.agentConfig.create({ data: { customerId, active: true, followUpSequencesEnabled: true } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", apiKeyEnc: "x" } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ mode: "template", conversationId: "c" });
  });

  it("Statuswechsel auf „Angebot gesendet“: alte Strecke und Anrufplan enden, Nachfassen zum Angebot ist geplant", async () => {
    const { lead, silent } = await wieImLiveTest();
    await prisma.lead.update({ where: { id: lead.id }, data: { status: "Angebot gesendet" } });
    await syncFollowUpWithStatus(lead.id, "Angebot gesendet", T0);

    const alt = await prisma.leadSequence.findUniqueOrThrow({ where: { id: silent.id } });
    expect(alt.stoppedAt).not.toBeNull();
    expect(alt.stopReason).toBe("Passt nicht mehr zum Stand: Angebot gesendet");
    const neu = await prisma.leadSequence.findFirstOrThrow({ where: { leadId: lead.id, stoppedAt: null } });
    expect(neu.kind).toBe("offer_status");
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    // Anrufplan weg, keine klassische Wiedervorlage zusätzlich (das Nachfassen plant den Anruf an Tag 7)
    expect(l.followUpNote).toBeNull();
    const verlauf = await prisma.leadHistory.findMany({ where: { leadId: lead.id } });
    expect(verlauf.map((h) => h.text)).toContain("Nachfassen an den Stand „Angebot gesendet“ angepasst: „Chat ruht“ beendet, Anrufplan beendet, Nachfassen zum Angebot geplant");
    expect(verlauf.every((h) => !h.text.includes("Anna"))).toBe(true);

    // Nächste Nachrichten: kein „Chat ruht“, kein „Anrufversuch“, aber Tag 3, 7 und 14 zum Angebot
    const plan = await loadNachrichtenPlan(lead.id, T0);
    expect(plan.some((e) => e.titel.includes("Chat ruht") || e.titel.includes("Anrufversuch"))).toBe(false);
    expect(plan.filter((e) => e.abfolgeId === neu.id).length).toBeGreaterThanOrEqual(3);

    // Ablauf: Tag 3 WhatsApp (Vorlage wie selbst gesendet), Tag 7 Anruf-Aufgabe, Tag 14 ohne Fenster eine Anruf-Aufgabe
    await runSequences(new Date(T0.getTime() + 3 * DAY + 60 * 60_000)); // Mo 30.11. 11 Uhr
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ purpose: "followup_offer_selbst", leadId: lead.id });
    await runSequences(new Date(T0.getTime() + 7 * DAY + 60 * 60_000));
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpNote).toBe("Angebot nachfassen: anrufen");
    await prisma.lead.update({ where: { id: lead.id }, data: { followUpAt: null, followUpNote: null } });
    await runSequences(new Date(T0.getTime() + 14 * DAY + 60 * 60_000));
    expect(send).toHaveBeenCalledTimes(1);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpNote).toBe("Angebot: Entscheidung erfragen, anrufen");
  });

  it("Prüfung direkt vor dem Versand: „Chat ruht“ bei Angebot wird übersprungen, nichts geht raus", async () => {
    const { lead, silent } = await wieImLiveTest();
    // Status nur in der Datenbank gesetzt (alter Stand, ohne Statuswechsel-Aktion)
    await prisma.lead.update({ where: { id: lead.id }, data: { status: "Angebot gesendet" } });
    await runSequences(T0);
    expect(send).not.toHaveBeenCalled();
    const s = await prisma.leadSequence.findUniqueOrThrow({ where: { id: silent.id } });
    expect(s.stopReason).toBe("Passt nicht mehr zum Stand: Angebot gesendet");
    const h = await prisma.leadHistory.findFirst({ where: { leadId: lead.id, text: { contains: "übersprungen" } } });
    expect(h?.text).toBe("Automatisches Nachfassen „Chat ruht“ übersprungen: Passt nicht mehr zum Stand: Angebot gesendet");
    // Kein neues „Chat ruht“ nach einer Nachricht des Assistenten, kein Anrufplan nach „nicht erreicht“
    expect(await restartSilentSequence(lead.id, T0)).toBeNull();
    expect(await startSequence(lead.id, "not_reached", T0)).toBeNull();
    expect(await passtNochZurPhase(lead.id, "anrufplan", T0)).toBe("Passt nicht mehr zum Stand: Angebot gesendet");
    expect((await planNextCallAttempt(lead.id, T0)).nextAt).toBeNull();
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpNote).toBeNull();
  });

  it("Termin war, noch kein Angebot: „Ist das Thema noch aktuell?“ geht nicht raus", async () => {
    const { lead, silent } = await wieImLiveTest();
    await prisma.lead.update({ where: { id: lead.id }, data: { status: "In Beratung" } });
    await runSequences(T0);
    expect(send).not.toHaveBeenCalled();
    expect((await prisma.leadSequence.findUniqueOrThrow({ where: { id: silent.id } })).stopReason).toBe("Passt nicht mehr zum Stand: Termin war");
  });

  it("ohne Termin und Angebot läuft „Chat ruht“ weiter, aber sonntags nicht: der Schritt wartet auf Montag", async () => {
    const lead = await newLead();
    const seq = await prisma.leadSequence.create({ data: { leadId: lead.id, customerId, kind: "silent", step: 3, startedAt: new Date(SONNTAG.getTime() - 3 * DAY), nextAt: new Date(SONNTAG.getTime() - 60_000) } });
    const r = await runSequences(SONNTAG);
    expect(r.waiting).toBeGreaterThanOrEqual(1);
    expect(send).not.toHaveBeenCalled();
    expect((await prisma.leadSequence.findUniqueOrThrow({ where: { id: seq.id } })).step).toBe(3);
    // Nächste Nachrichten zeigen Montag 8 Uhr statt Sonntag
    const plan = await loadNachrichtenPlan(lead.id, SONNTAG);
    const e = plan.find((x) => x.abfolgeId === seq.id)!;
    expect(e.at).toBe("2026-11-30T07:00:00.000Z");
    await runSequences(new Date("2026-11-30T07:05:00.000Z"));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ purpose: "followup_last", leadId: lead.id });
  });

  it("Abschluss und Verloren stoppen alles, Termin vereinbart stoppt den Anrufplan", async () => {
    for (const status of ["Abschluss", "Kein Interesse"]) {
      const { lead } = await wieImLiveTest();
      await prisma.lead.update({ where: { id: lead.id }, data: { status } });
      await syncFollowUpWithStatus(lead.id, status, T0);
      expect(await prisma.leadSequence.count({ where: { leadId: lead.id, stoppedAt: null } })).toBe(0);
    }
    const lead = await newLead({ followUpAt: T0, followUpNote: "Anrufversuch 2 von 6" });
    await prisma.appointment.create({ data: { customerId, leadId: lead.id, startsAt: new Date(T0.getTime() + DAY), endsAt: new Date(T0.getTime() + DAY + 30 * 60_000), status: "booked", mode: "phone" } });
    const { phasenWechsel } = await import("@/lib/lead-phase-server");
    expect(await phasenWechsel(lead.id, T0)).toMatchObject({ phase: "termin", anrufplan: true });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpNote).toBeNull();
  });

  it("für jeden Status: über alle Strecken keine Schritte der Phase davor (Abfolgen, Anrufplan, Auslöser, Nächste Nachrichten)", async () => {
    const { runAntwortAusloeser } = await import("@/lib/anruf-ausloeser-server");
    const faelle: { status: string; termin?: "kommend" | "war"; phase: string }[] = [
      { status: "In Beratung", termin: "kommend", phase: "termin" },
      { status: "In Beratung", termin: "war", phase: "nach_termin" },
      { status: "Angebot gesendet", termin: "war", phase: "angebot" },
      { status: "Abschluss", termin: "war", phase: "abschluss" },
      { status: "Kein Interesse", phase: "verloren" },
      { status: "Disqualifiziert", phase: "verloren" },
      { status: "Storno", phase: "verloren" },
    ];
    for (const f of faelle) {
      const lead = await newLead({ followUpAt: T0, followUpNote: "Anrufversuch 2 von 6", outreachStatus: "sent", outreachAt: new Date(T0.getTime() - 2 * 60 * 60_000) });
      if (f.termin) {
        const startsAt = f.termin === "kommend" ? new Date(T0.getTime() + DAY) : new Date(T0.getTime() - DAY);
        await prisma.appointment.create({ data: { customerId, leadId: lead.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), status: f.termin === "kommend" ? "booked" : "completed", mode: "phone" } });
      }
      for (const kind of ["silent", "not_reached"]) {
        await prisma.leadSequence.create({ data: { leadId: lead.id, customerId, kind, step: 0, startedAt: new Date(T0.getTime() - DAY), nextAt: new Date(T0.getTime() + 60_000) } });
      }
      await prisma.lead.update({ where: { id: lead.id }, data: { status: f.status } });
      const r = await (await import("@/lib/lead-phase-server")).phasenWechsel(lead.id, T0);
      await syncFollowUpWithStatus(lead.id, f.status, T0);
      expect(r?.phase, f.status).toBe(f.phase);
      const laufend = await prisma.leadSequence.findMany({ where: { leadId: lead.id, stoppedAt: null }, select: { kind: true } });
      expect(laufend.filter((x) => ["silent", "not_reached"].includes(x.kind)), f.status).toEqual([]);
      const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(l.followUpNote ?? "", f.status).not.toMatch(/^Anrufversuch/);
      const plan = await loadNachrichtenPlan(lead.id, T0);
      expect(plan.filter((e) => e.quelle === "anrufplan" || /Chat ruht|Nicht erreicht/.test(e.titel)), f.status).toEqual([]);
      // Cron-Läufe danach: nichts geht raus, kein Anrufplan startet
      await runSequences(new Date(T0.getTime() + 5 * 60_000));
      await runAntwortAusloeser(new Date(T0.getTime() + 5 * 60_000), { push: async () => undefined as never });
      expect(send.mock.calls.filter((c) => (c[0] as { leadId: string }).leadId === lead.id), f.status).toEqual([]);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpNote ?? "", f.status).not.toMatch(/^Anrufversuch/);
    }
  });

  it("Bereinigung: Trockenlauf zählt je Kunde, echter Lauf passt an, zweiter Lauf findet nichts", async () => {
    const other = (await makeCustomer()).id;
    await prisma.agentConfig.create({ data: { customerId: other, active: true, followUpSequencesEnabled: true } });
    try {
      const a = await prisma.lead.create({ data: { customerId: other, name: "X", phone: "4915300000001", status: "Angebot gesendet", followUpAt: T0, followUpNote: "Anrufversuch 3 von 6" } });
      await prisma.leadSequence.create({ data: { leadId: a.id, customerId: other, kind: "silent", step: 2, startedAt: T0, nextAt: new Date(T0.getTime() + DAY) } });
      // passt: Neuer Lead mit „Chat ruht“
      const ok = await prisma.lead.create({ data: { customerId: other, name: "Y", phone: "4915300000002", status: "Neuer Lead" } });
      await prisma.leadSequence.create({ data: { leadId: ok.id, customerId: other, kind: "silent", step: 0, startedAt: T0, nextAt: new Date(T0.getTime() + DAY) } });

      const probe = await bereinigeNachfassen({ echt: false, kunde: other, now: T0 });
      expect(probe).toMatchObject({ echt: false, betroffen: 1 });
      expect(probe.jeKunde).toEqual([{ kunde: other, leads: 1, abfolgen: 1, schritte: 2, anrufplan: 1, angebotGestartet: 1 }]);
      // Trockenlauf ändert nichts
      expect(await prisma.leadSequence.count({ where: { leadId: a.id, stoppedAt: null, kind: "silent" } })).toBe(1);

      const echt = await bereinigeNachfassen({ echt: true, kunde: other, now: T0 });
      expect(echt.betroffen).toBe(1);
      expect(await prisma.leadSequence.count({ where: { leadId: a.id, stoppedAt: null, kind: "silent" } })).toBe(0);
      expect(await prisma.leadSequence.count({ where: { leadId: a.id, stoppedAt: null, kind: "offer_status" } })).toBe(1);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: a.id } })).followUpNote).toBeNull();
      expect(await prisma.leadSequence.count({ where: { leadId: ok.id, stoppedAt: null } })).toBe(1);

      const nochmal = await bereinigeNachfassen({ echt: true, kunde: other, now: T0 });
      expect(nochmal.betroffen).toBe(0);
      expect(send).not.toHaveBeenCalled();
    } finally {
      await cleanupCustomer(other);
    }
  });
});
