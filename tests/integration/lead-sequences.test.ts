import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// WhatsApp-Versand wird simuliert; Rest (Abfolge, Zeitplan, Stopps) läuft gegen die Test-DB.
const send = vi.fn();
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return { ...real, sendWhatsAppNotice: (...a: unknown[]) => send(...a) };
});

import { prisma } from "@/lib/prisma";
import { inSendWindow, runSequences, startSequence, stopSequences } from "@/lib/lead-sequences";
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
  });

  it("Versandfenster: Mo–Sa 9–19 Uhr Berlin", () => {
    expect(inSendWindow(T0)).toBe(true);
    expect(inSendWindow(SUNDAY)).toBe(false);
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
    expect(send.mock.calls[0][0]).toMatchObject({ purpose: "followup", leadId: lead.id, params: ["Lisa"] });
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

  it("„Angebot gesendet“ startet die Abfolge statt der 3-Tage-Wiedervorlage; ohne Schalter bleibt alles wie bisher", async () => {
    const lead = await newLead();
    await syncFollowUpWithStatus(lead.id, "Angebot gesendet");
    const seq = await prisma.leadSequence.findFirstOrThrow({ where: { leadId: lead.id, stoppedAt: null } });
    expect(seq.kind).toBe("offer");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpAt).toBeNull();

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
});
