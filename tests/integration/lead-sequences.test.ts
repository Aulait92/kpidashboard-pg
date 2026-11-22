import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// WhatsApp-Versand wird simuliert; Rest (Abfolge, Zeitplan, Stopps) läuft gegen die Test-DB.
const send = vi.fn();
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return { ...real, sendWhatsAppNotice: (...a: unknown[]) => send(...a) };
});
// Terminvorschläge aus dem Kalender: Standard ohne Kalender (null), einzeln mit zwei freien Zeiten
const zeiten = vi.fn(async (): Promise<unknown> => null);
vi.mock("@/lib/whatsapp/termin-vorschlaege", () => ({ zweiTerminvorschlaege: () => zeiten() }));

import { prisma } from "@/lib/prisma";
import { inSendWindow, restartSilentSequence, runSequences, scheduleBotRecall, startSequence, stopSequences } from "@/lib/lead-sequences";
import { nextStepStateOf } from "@/lib/lead-next-step-server";
import { syncFollowUpWithStatus } from "@/lib/lead-followup";
import { NoTemplateError } from "@/lib/whatsapp/templates";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const DAY = 24 * 60 * 60 * 1000;
// Di 17.11.2026, 10:00 Uhr Berlin (im Versandfenster)
const T0 = new Date("2026-11-17T09:00:00.000Z");
// So 15.11.2026, 12:00 Uhr Berlin (außerhalb)
const SUNDAY = new Date("2026-11-15T11:00:00.000Z");

describe("Nachfass-Abfolgen", () => {
  let customerId = "";
  let n = 0;
  const newLead = async (extra: Record<string, unknown> = {}) =>
    prisma.lead.create({ data: { customerId, name: "Lisa Koch", phone: `49151000${String(++n).padStart(4, "0")}`, status: "Neuer Lead", ...extra } });

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
    zeiten.mockReset();
    zeiten.mockResolvedValue(null);
  });

  it("Versandfenster: Mo–Sa 9–19 Uhr Berlin", () => {
    expect(inSendWindow(T0)).toBe(true);
    expect(inSendWindow(SUNDAY)).toBe(false);
    // „Chat ruht“ auch sonntags 10 bis 18 Uhr (Ole, 22.11.2026)
    expect(inSendWindow(new Date("2026-11-22T10:00:00.000Z"), undefined, { von: 10, bis: 18 })).toBe(true); // So 11:00 Berlin
    expect(inSendWindow(new Date("2026-11-22T08:00:00.000Z"), undefined, { von: 10, bis: 18 })).toBe(false); // So 9:00 Berlin
    expect(inSendWindow(new Date("2026-11-22T17:30:00.000Z"), undefined, { von: 10, bis: 18 })).toBe(false); // So 18:30 Berlin
    expect(inSendWindow(new Date("2026-11-17T18:30:00.000Z"))).toBe(false); // 19:30 Berlin
  });

  it("startet nur, wenn beim Kunden eingeschaltet", async () => {
    const other = (await makeCustomer()).id;
    await prisma.agentConfig.create({ data: { customerId: other, active: true, followUpSequencesEnabled: false } });
    const lead = await prisma.lead.create({ data: { customerId: other, name: "X", phone: "4915199999999" } });
    expect(await startSequence(lead.id, "not_reached", T0)).toBeNull();
    await cleanupCustomer(other);
  });

  it("„Nicht erreicht“: WhatsApp sofort, Anruf-Aufgabe Tag 2, letzte WhatsApp Tag 6 – jeder Schritt genau einmal", async () => {
    const lead = await newLead();
    const seq = await startSequence(lead.id, "not_reached", T0);
    expect(seq?.nextAt?.toISOString()).toBe(T0.toISOString());
    // wiederholtes „Nicht erreicht“ startet nicht neu
    expect((await startSequence(lead.id, "not_reached", T0))?.id).toBe(seq?.id);

    await runSequences(T0);
    expect(send).toHaveBeenCalledTimes(1);
    // Ohne Kalender keine Terminvorschläge: kurze Nachfrage ohne Knöpfe im Freitext
    expect(send.mock.calls[0][0]).toMatchObject({ purpose: "followup_nudge", leadId: lead.id, params: ["Lisa"], textButtons: [] });
    await runSequences(T0); // nicht fällig → nichts
    expect(send).toHaveBeenCalledTimes(1);

    await runSequences(new Date(T0.getTime() + 2 * DAY));
    const l2 = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(l2.followUpNote).toBe("Nachfassen: nochmal anrufen");
    expect(l2.followUpAt?.getTime()).toBe(T0.getTime() + 2 * DAY);

    await runSequences(new Date(T0.getTime() + 6 * DAY));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toMatchObject({ purpose: "followup_last" });
    const done = await prisma.leadSequence.findUniqueOrThrow({ where: { id: seq!.id } });
    expect(done.stoppedAt).not.toBeNull();
    expect(done.stopReason).toBe("Abgeschlossen");
    expect((done.log as unknown[]).length).toBe(3);
  });

  it("WhatsApp wartet außerhalb Mo–Sa 9–19 Uhr", async () => {
    const lead = await newLead();
    const seq = await startSequence(lead.id, "not_reached", SUNDAY);
    const r = await runSequences(SUNDAY);
    expect(r.waiting).toBeGreaterThanOrEqual(1);
    expect(send).not.toHaveBeenCalled();
    expect((await prisma.leadSequence.findUniqueOrThrow({ where: { id: seq!.id } })).step).toBe(0);
  });

  it("parallele Läufe senden nie doppelt", async () => {
    const lead = await newLead();
    await startSequence(lead.id, "no_show", T0);
    await Promise.all([runSequences(T0), runSequences(T0), runSequences(T0)]);
    expect(send.mock.calls.filter((c) => (c[0] as { leadId: string }).leadId === lead.id)).toHaveLength(1);
  });

  it("stoppt, wenn der Lead antwortet – „Stopp“ wird als Abmeldung vermerkt", async () => {
    for (const [body, reason] of [["Ja gern, morgen?", "Lead hat geantwortet"], ["STOPP", "Abgemeldet („Stopp“)"]] as const) {
      const lead = await newLead();
      const seq = await startSequence(lead.id, "not_reached", T0);
      const conv = await prisma.conversation.create({ data: { customerId, contactPhone: lead.phone!, leadId: lead.id } });
      await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", body, createdAt: new Date(T0.getTime() + 60_000) } });
      await runSequences(new Date(T0.getTime() + 5 * 60_000));
      const s = await prisma.leadSequence.findUniqueOrThrow({ where: { id: seq!.id } });
      expect(s.stopReason).toBe(reason);
      expect(send.mock.calls.some((c) => (c[0] as { leadId: string }).leadId === lead.id)).toBe(false);
    }
  });

  it("stoppt bei gebuchtem Termin, Reklamation, Löschung und Abschluss", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ stornoState: "review" }, "Lead reklamiert"],
      [{ erasedAt: new Date() }, "Lead gelöscht"],
    ];
    for (const [extra, reason] of cases) {
      const lead = await newLead();
      const seq = await startSequence(lead.id, "not_reached", T0);
      await prisma.lead.update({ where: { id: lead.id }, data: extra });
      await runSequences(T0);
      expect((await prisma.leadSequence.findUniqueOrThrow({ where: { id: seq!.id } })).stopReason).toBe(reason);
    }
    const booked = await newLead();
    const s1 = await startSequence(booked.id, "not_reached", T0);
    await prisma.appointment.create({ data: { customerId, leadId: booked.id, mode: "phone", startsAt: new Date(T0.getTime() + DAY) } });
    await runSequences(T0);
    expect((await prisma.leadSequence.findUniqueOrThrow({ where: { id: s1!.id } })).stopReason).toBe("Termin gebucht");

    const won = await newLead();
    const s2 = await startSequence(won.id, "not_reached", T0);
    await syncFollowUpWithStatus(won.id, "Abschluss");
    expect((await prisma.leadSequence.findUniqueOrThrow({ where: { id: s2!.id } })).stopReason).toBe("Phase: Abschluss");
    expect(send).not.toHaveBeenCalled();
  });

  it("PKV-Tarifoptimierung: Abfolge stoppt ohne Nachricht (Ole, 20.11.2026, keine automatischen Nachrichten)", async () => {
    const lead = await newLead({ source: "PKV-Tarifoptimierung" });
    const seq = await startSequence(lead.id, "not_reached", T0);
    await runSequences(T0);
    if (seq) expect((await prisma.leadSequence.findUniqueOrThrow({ where: { id: seq.id } })).stopReason).toBe("Produkt ohne automatische Nachrichten");
    expect(send).not.toHaveBeenCalled();
  });

  it("„Angebot gesendet“ allein startet kein Nachfassen mehr (P3), sondern die 3-Tage-Wiedervorlage; ohne Schalter bleibt alles wie bisher", async () => {
    const lead = await newLead();
    await syncFollowUpWithStatus(lead.id, "Angebot gesendet");
    expect(await prisma.leadSequence.count({ where: { leadId: lead.id } })).toBe(0);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpNote).toBe("Angebot nachfassen");
    // Gestartet wird es erst mit dem Versand (lib/angebot-senden-server.ts)
    const seq = (await startSequence(lead.id, "offer", T0))!;
    expect(seq.kind).toBe("offer");

    await prisma.agentConfig.update({ where: { customerId }, data: { followUpSequencesEnabled: false } });
    const lead2 = await newLead();
    await syncFollowUpWithStatus(lead2.id, "Angebot gesendet");
    expect(await prisma.leadSequence.count({ where: { leadId: lead2.id } })).toBe(0);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead2.id } })).followUpNote).toBe("Angebot nachfassen");
    // ausgeschaltet → laufende Abfolge endet beim nächsten Schritt
    await prisma.leadSequence.update({ where: { id: seq.id }, data: { nextAt: T0 } });
    await runSequences(T0);
    expect((await prisma.leadSequence.findUniqueOrThrow({ where: { id: seq.id } })).stopReason).toBe("Automatisches Nachfassen ausgeschaltet");
    await prisma.agentConfig.update({ where: { customerId }, data: { followUpSequencesEnabled: true } });
  });

  it("ohne freigegebene Vorlage bzw. ohne Handynummer: Anruf-Aufgabe statt WhatsApp", async () => {
    send.mockRejectedValue(new NoTemplateError("followup_noshow"));
    const lead = await newLead();
    await startSequence(lead.id, "no_show", T0);
    await runSequences(T0);
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(l.followUpNote).toBe("Nicht erschienen: neuen Termin vereinbaren");
    const s = await prisma.leadSequence.findFirstOrThrow({ where: { leadId: lead.id } });
    expect((s.log as { result: string }[])[0].result).toBe("call_task");

    send.mockReset();
    const noPhone = await prisma.lead.create({ data: { customerId, name: "Ohne Nummer", status: "Neuer Lead" } });
    await startSequence(noPhone.id, "not_reached", T0);
    await runSequences(T0);
    expect(send).not.toHaveBeenCalled();
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: noPhone.id } })).followUpNote).toBe("Nicht erreicht: nochmal anrufen");
  });

  it("eine eigene, spätere Wiedervorlage wird nicht überschrieben; manuell stoppen geht", async () => {
    const later = new Date(T0.getTime() + 10 * DAY);
    const lead = await newLead({ followUpAt: later, followUpNote: "Eigene Notiz" });
    const seq = await startSequence(lead.id, "offer", T0);
    await prisma.leadSequence.update({ where: { id: seq!.id }, data: { step: 1, nextAt: T0 } }); // direkt zum Anruf-Schritt
    await runSequences(T0);
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(l.followUpNote).toBe("Eigene Notiz");
    expect(l.followUpAt?.getTime()).toBe(later.getTime());

    const lead2 = await newLead();
    await startSequence(lead2.id, "not_reached", T0);
    expect(await stopSequences(lead2.id, "Vom Berater gestoppt")).toBe(1);
    await runSequences(T0);
    expect(send.mock.calls.some((c) => (c[0] as { leadId: string }).leadId === lead2.id)).toBe(false);
  });

  it("„Chat ruht“: 2 Std., 8 Std., ca. 20 Std. nur im offenen Fenster, Tag 3 letzte; Neustart; Mindestabstand", async () => {
    const HOUR = 60 * 60 * 1000;
    const lead = await newLead();
    const seq = await restartSilentSequence(lead.id, T0);
    expect(seq?.nextAt?.getTime()).toBe(T0.getTime() + 2 * HOUR);
    // neue Nachricht des Assistenten: dieselbe Abfolge beginnt von vorn (Di 11:00 Berlin)
    const later = new Date(T0.getTime() + HOUR);
    const again = await restartSilentSequence(lead.id, later);
    expect(again?.id).toBe(seq?.id);
    expect(again?.nextAt?.getTime()).toBe(later.getTime() + 2 * HOUR);

    // Nur die Aufrufe für diesen Lead (andere Abfolgen aus früheren Tests, z. B. No-Show-Rettung Tag 1, laufen mit)
    const mine = () => send.mock.calls.filter((c) => (c[0] as { leadId?: string }).leadId === lead.id);
    await runSequences(new Date(later.getTime() + 2 * HOUR)); // 13:00
    expect(mine()).toHaveLength(1);
    expect(mine()[0][0]).toMatchObject({ purpose: "followup_nudge", leadId: lead.id });
    await runSequences(new Date(later.getTime() + 8 * HOUR)); // 19:00: außerhalb, wartet
    expect(mine()).toHaveLength(1);
    await runSequences(new Date(later.getTime() + 22 * HOUR)); // Mi 09:00
    expect(mine()).toHaveLength(2);
    expect(mine()[1][0]).toMatchObject({ purpose: "followup_nudge" });
    // nächster Schritt (20 Std. = 07:00, schon fällig) erst nach dem Mindestabstand von 2 Std.
    const mid = await prisma.leadSequence.findUniqueOrThrow({ where: { id: seq!.id } });
    expect(mid.nextAt?.getTime()).toBe(later.getTime() + 24 * HOUR);
    // ohne offenes 24h-Fenster (keine Konversation) → übersprungen, keine Vorlage doppelt
    await runSequences(new Date(later.getTime() + 24 * HOUR));
    expect(mine()).toHaveLength(2);
    await runSequences(new Date(later.getTime() + 3 * DAY));
    expect(mine()).toHaveLength(3);
    expect(mine()[2][0]).toMatchObject({ purpose: "followup_last" });
    const done = await prisma.leadSequence.findUniqueOrThrow({ where: { id: seq!.id } });
    expect(done.stopReason).toBe("Abgeschlossen");
  });

  it("Nachfassen mit zwei konkreten Zeiten aus dem Kalender und Knöpfen (Payload = Startzeit)", async () => {
    zeiten.mockResolvedValue({
      labels: ["Di., 17.11. um 14:00 Uhr", "Mi., 18.11. um 10:00 Uhr"],
      starts: ["2026-11-17T13:00:00.000Z", "2026-11-18T09:00:00.000Z"],
      payloads: ["slot:2026-11-17T13:00:00.000Z", "slot:2026-11-18T09:00:00.000Z", "andere_zeit"],
    });
    const lead = await newLead();
    await startSequence(lead.id, "not_reached", T0);
    await runSequences(T0);
    const call = send.mock.calls.find((c) => (c[0] as { leadId?: string }).leadId === lead.id)![0] as Record<string, unknown>;
    expect(call).toMatchObject({
      purpose: "followup",
      params: ["Lisa", "Di., 17.11. um 14:00 Uhr", "Mi., 18.11. um 10:00 Uhr"],
      buttonPayloads: ["slot:2026-11-17T13:00:00.000Z", "slot:2026-11-18T09:00:00.000Z", "andere_zeit"],
      // ältere freigegebene „followup“-Fassung hat nur den Namen
      legacyParams: ["Lisa"],
    });
    expect(call.text).toBe("Guten Tag Frau Koch, ich habe gerade versucht, Sie anzurufen. Passt Ihnen für ein kurzes Gespräch Di., 17.11. um 14:00 Uhr oder Mi., 18.11. um 10:00 Uhr?");
  });

  it("„Chat ruht“ startet nicht, wenn eine andere Abfolge läuft oder ein Termin ansteht", async () => {
    const a = await newLead();
    await startSequence(a.id, "not_reached", T0);
    expect(await restartSilentSequence(a.id, T0)).toBeNull();
    const b = await newLead();
    await prisma.appointment.create({ data: { customerId, leadId: b.id, startsAt: new Date(T0.getTime() + DAY), endsAt: new Date(T0.getTime() + DAY + 1800000), status: "booked", mode: "phone" } });
    expect(await restartSilentSequence(b.id, T0)).toBeNull();
  });

  it("Wiedervorlage vom Assistenten: meldet sich zur Zeit, auch ohne Schalter; kurzes „Danke“ hebt sie nicht auf; zählt als nächster Schritt", async () => {
    const other = (await makeCustomer()).id;
    await prisma.agentConfig.create({ data: { customerId: other, active: true, followUpSequencesEnabled: false } });
    await prisma.whatsAppAccount.create({ data: { customerId: other, status: "connected", apiKeyEnc: "x" } });
    const lead = await prisma.lead.create({ data: { customerId: other, name: "Lisa Koch", phone: "4915177770001", status: "Im Gespräch", formData: [{ label: "Versicherungsinteresse", value: "Hausrat" }] } });
    const conv = await prisma.conversation.create({ data: { customerId: other, leadId: lead.id, contactPhone: "4915177770001", lastMessageAt: new Date(T0.getTime() - 3 * DAY) } });
    const at = new Date(T0.getTime() + DAY); // Mi 10:00
    const seq = await scheduleBotRecall(lead.id, at, "Morgen nochmal melden, gerade unterwegs", T0);
    expect(seq?.nextAt?.toISOString()).toBe(at.toISOString());
    expect(await nextStepStateOf(lead.id, new Date(T0.getTime() + 2 * 60 * 60 * 1000))).toBe("ok");
    // „Danke, bis morgen“ 5 Minuten später: bleibt bestehen
    await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", body: "Danke, bis morgen", createdAt: new Date(T0.getTime() + 5 * 60 * 1000) } });
    // andere Tests dieser Datei haben eigene Abfolgen: nur die Aufrufe für diesen Lead zählen
    const mine = () => send.mock.calls.filter((c) => (c[0] as { leadId?: string }).leadId === lead.id);
    await runSequences(new Date(T0.getTime() + 12 * 60 * 60 * 1000));
    expect(mine()).toHaveLength(0);
    await runSequences(at);
    expect(mine()).toHaveLength(1);
    expect(mine()[0][0]).toMatchObject({ purpose: "followup_nudge", leadId: lead.id });
    expect((mine()[0][0] as { text: string }).text).toContain("wie besprochen melde ich mich wieder zu Hausrat");
    const done = await prisma.leadSequence.findUniqueOrThrow({ where: { id: seq!.id } });
    expect(done.stopReason).toBe("Abgeschlossen");
    await cleanupCustomer(other);
  });

  it("Wiedervorlage beendet „Chat ruht“; „Chat ruht“ startet nicht neben ihr", async () => {
    const lead = await newLead();
    await restartSilentSequence(lead.id, T0);
    await scheduleBotRecall(lead.id, new Date(T0.getTime() + 2 * DAY), null, T0);
    const running = await prisma.leadSequence.findMany({ where: { leadId: lead.id, stoppedAt: null } });
    expect(running.map((r) => r.kind)).toEqual(["recall"]);
    expect(await restartSilentSequence(lead.id, T0)).toBeNull();
  });

  it("kein Buchungslink in Nachfass-Nachrichten: Termine nur per Chat", async () => {
    const { SEQUENCES } = await import("@/lib/lead-sequences");
    const ctx = { firstName: "Lisa", hi: "Guten Tag Frau Koch,", kontakt: { fullName: "Lisa Koch" }, topic: "Hausrat", an: "sie" as const };
    for (const def of Object.values(SEQUENCES)) {
      for (const step of def.steps) {
        if (step.action !== "whatsapp") continue;
        const text = step.text(ctx);
        expect(text).not.toMatch(/https?:\/\/|\/book\//);
      }
    }
  });
});
