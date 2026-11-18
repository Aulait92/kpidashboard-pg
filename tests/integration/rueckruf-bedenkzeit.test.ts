import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Rückruf und Bedenkzeit (Paket P5): WhatsApp, Mail und Push simuliert, Rest gegen die Test-DB.
const wa = vi.fn();
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return { ...real, sendWhatsAppNotice: (...a: unknown[]) => wa(...a) };
});
const chat = vi.fn();
vi.mock("@/lib/whatsapp/gateway", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/gateway")>();
  return { ...real, sendWhatsAppMessage: (...a: unknown[]) => chat(...a) };
});
vi.mock("@/lib/mail/lead-versand", async (orig) => {
  const real = await orig<typeof import("@/lib/mail/lead-versand")>();
  return { ...real, sendeLeadMail: async () => ({ sent: true, via: "resend" }) };
});
vi.mock("@/lib/push", () => ({ sendToUser: async () => undefined, sendToBuyersOfCustomer: async () => undefined }));

import { prisma } from "@/lib/prisma";
import { angebotSelbst, angebotSenden, rueckrufWunsch, rueckrufToken } from "@/lib/angebot-senden-server";
import { runSequences, scheduleBotRecall, startBedenkzeit } from "@/lib/lead-sequences";
import { bedenkzeitImChat, bedenkzeitKnopf } from "@/lib/bedenkzeit-server";
import { BEDENKZEIT_AUFGABE, BEDENKZEIT_KNOEPFE } from "@/lib/bedenkzeit";
import { DEFAULT_LEAD_TIMES } from "@/lib/calendar/lead-times";
import { rueckrufTage } from "@/lib/rueckruf";
import { loadNachrichtenPlan } from "@/lib/nachrichtenplan-server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const DAY = 24 * 60 * 60 * 1000;
// Di 17.11.2026, 10:00 Uhr Berlin
const T0 = new Date("2026-11-17T09:00:00.000Z");

describe("Rückruf und Bedenkzeit (P5)", () => {
  let customerId = "";
  let n = 0;
  const ctx = () => ({ customerId, userId: null, teamRole: "owner" as const });

  async function terminMitLead(o: { status?: string } = {}) {
    const phone = `49151300${String(++n).padStart(4, "0")}`;
    const lead = await prisma.lead.create({
      data: { customerId, name: "Anna Becker", formData: [{ label: "Anrede", value: "Frau" }], phone, email: "anna@example.org", status: o.status ?? "Termin vereinbart" },
    });
    const t = await prisma.appointment.create({
      data: { customerId, leadId: lead.id, startsAt: new Date(T0.getTime() - 2 * 60 * 60 * 1000), endsAt: new Date(T0.getTime() - 60 * 60 * 1000), status: "completed", mode: "video" },
    });
    const pdf = await prisma.leadFile.create({
      data: { leadId: lead.id, customerId, kind: "angebot", fileName: "Angebot.pdf", contentType: "application/pdf", size: 8, data: Buffer.from("%PDF-1.4") },
    });
    return { lead, t, pdf, phone };
  }
  const chatFuer = (phone: string) => chat.mock.calls.map((c) => c[0] as { to: string; body: string; buttons?: { id: string; title: string }[] | null }).filter((c) => c.to === phone);
  const waFuer = (leadId: string) => wa.mock.calls.map((c) => c[0] as { leadId: string; purpose: string; text: string }).filter((c) => c.leadId === leadId);

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ leadAddress: "sie" })).id;
    await prisma.agentConfig.create({ data: { customerId, active: true, followUpSequencesEnabled: true } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", apiKeyEnc: "x" } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    wa.mockReset();
    wa.mockResolvedValue({ mode: "text", conversationId: "c" });
    chat.mockReset();
    chat.mockResolvedValue({ ok: true });
  });

  it("Rückruf mit Zeitfenster: Aufgabe zum Fensterbeginn, Push mit Fenster und Notiz, Nachfassen pausiert, Bestätigung im offenen Fenster", async () => {
    const { lead, t, pdf, phone } = await terminMitLead();
    await angebotSenden(t.id, ctx(), { dateiId: pdf.id, kundenlink: false }, { now: T0 });
    await prisma.conversation.create({ data: { customerId, leadId: lead.id, contactPhone: phone, windowExpiresAt: new Date(T0.getTime() + 3 * DAY) } });
    const token = await rueckrufToken(lead.id);
    // Do 19.11., 9 Uhr Berlin: Fenster heute Nachmittag
    const now = new Date("2026-11-19T08:00:00Z");
    const f = rueckrufTage(now, DEFAULT_LEAD_TIMES)[0].fenster[1];
    expect(f.zeit).toBe("12 bis 16:30 Uhr");
    const push = vi.fn(async () => undefined);
    const r = await rueckrufWunsch(token, { fenster: f.key, notiz: "Frage zum Beitrag" }, { now, push });
    expect(r).toMatchObject({ ok: true, schon: false, whatsapp: true });

    const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(l.followUpNote).toBe("Rückrufwunsch: 12 bis 16:30 Uhr · „Frage zum Beitrag“");
    expect(l.followUpAt?.toISOString()).toBe(f.von.toISOString());
    expect(push).toHaveBeenCalledTimes(1);
    expect((push.mock.calls[0] as unknown[])[2]).toMatchObject({ title: "Frau Becker wünscht einen Rückruf", body: expect.stringContaining("Heute 12 bis 16:30 Uhr, zum Angebot.") });
    expect(chatFuer(phone)[0].body).toContain("ruft Sie heute zwischen 12 und 16:30 Uhr an.");

    // Abfolge läuft weiter, aber erst zwei Tage nach dem Fenster (Tag 3 Anruf war am 20.11. fällig)
    const seq = await prisma.leadSequence.findFirstOrThrow({ where: { leadId: lead.id, stoppedAt: null } });
    expect(seq.kind).toBe("offer");
    expect(seq.nextAt!.getTime()).toBeGreaterThanOrEqual(f.bis.getTime() + 2 * DAY);
    expect(seq.vorabCheckStep).toBeNull();
    expect(JSON.stringify(seq.log)).toContain("Pausiert bis");
    expect((await prisma.leadHistory.findFirst({ where: { leadId: lead.id, kind: "wiedervorlage" }, orderBy: { createdAt: "desc" } }))?.text).toBe(
      "Rückruf gewünscht: Heute 12 bis 16:30 Uhr („Frage zum Beitrag“), Nachfassen zum Angebot pausiert",
    );

    // Gleicher Wunsch nochmal: kein zweiter Push; ein anderes Fenster ersetzt ihn
    expect(await rueckrufWunsch(token, { fenster: f.key, notiz: "Frage zum Beitrag" }, { now: new Date(now.getTime() + 5 * 60 * 1000), push })).toMatchObject({ ok: true, schon: true });
    expect(push).toHaveBeenCalledTimes(1);
    const morgen = rueckrufTage(now, DEFAULT_LEAD_TIMES)[1].fenster[0];
    expect(await rueckrufWunsch(token, { fenster: morgen.key }, { now: new Date(now.getTime() + 10 * 60 * 1000), push })).toMatchObject({ ok: true, schon: false });
    const neu = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(neu.followUpNote).toBe("Rückrufwunsch: 10 bis 12 Uhr");
    expect(neu.followUpAt?.toISOString()).toBe(morgen.von.toISOString());
    // Vorbei bzw. ungültig: Fehler, nichts geändert
    expect(await rueckrufWunsch(token, { fenster: "2026-11-18_vormittag" }, { now, push })).toEqual({ ok: false, fehler: "fenster" });
    expect(await rueckrufWunsch("x".repeat(30), {}, { now, push })).toBeNull();

    // Nachrichtenplan: Rückruf-Aufgabe vorn, die Abfolge danach
    const plan = await loadNachrichtenPlan(lead.id, new Date(now.getTime() + 15 * 60 * 1000));
    expect(plan[0]).toMatchObject({ kanal: "anruf", titel: "Rückrufwunsch: 10 bis 12 Uhr" });
  });

  it("Rückruf ohne offenes Fenster: keine WhatsApp, nur die Seite", async () => {
    const { lead } = await terminMitLead();
    const token = await rueckrufToken(lead.id);
    const now = new Date("2026-11-19T08:00:00Z");
    const f = rueckrufTage(now, DEFAULT_LEAD_TIMES)[0].fenster[0];
    expect(await rueckrufWunsch(token, { fenster: f.key }, { now, push: vi.fn(async () => undefined) })).toMatchObject({ ok: true, whatsapp: false });
    expect(chat).not.toHaveBeenCalled();
  });

  it("Bedenkzeit vom Vermittler: Angebots-Abfolge pausiert und startet am Tag mit der WhatsApp zum Angebot neu", async () => {
    const { lead, t, pdf } = await terminMitLead();
    await angebotSenden(t.id, ctx(), { dateiId: pdf.id, kundenlink: false }, { now: T0 });
    wa.mockClear();
    const bis = new Date("2026-12-01T09:00:00Z");
    const seq = await startBedenkzeit(lead.id, bis, { quelle: "vermittler", now: new Date(T0.getTime() + DAY) });
    expect(seq).toMatchObject({ kind: "offer_bedenkzeit", step: 0 });
    expect(seq!.nextAt?.toISOString()).toBe(bis.toISOString());
    const alt = await prisma.leadSequence.findFirstOrThrow({ where: { leadId: lead.id, kind: "offer" } });
    expect(alt.stopReason).toBe("Pausiert: Bedenkzeit bis Di., 1.12.");

    // Vor dem Tag passiert nichts (auch nicht das Tag-2-Nachfassen der alten Abfolge)
    await runSequences(new Date(T0.getTime() + 2 * DAY));
    expect(waFuer(lead.id)).toHaveLength(0);
    // Am Tag: WhatsApp nach der Bedenkzeit, nächster Schritt 3 Tage danach
    await runSequences(bis);
    expect(waFuer(lead.id)).toHaveLength(1);
    expect(waFuer(lead.id)[0]).toMatchObject({ purpose: "offer_bedenkzeit" });
    expect(waFuer(lead.id)[0].text).toContain("wie besprochen melde ich mich wieder zu Ihrem Angebot");
    const nach = await prisma.leadSequence.findUniqueOrThrow({ where: { id: seq!.id } });
    expect(nach.step).toBe(1);
    expect(nach.nextAt?.toISOString()).toBe(new Date(bis.getTime() + 3 * DAY).toISOString());
  });

  it("Antwort vor dem Tag: kein Nachfassen, aber die Aufgabe „Bedenkzeit vorbei“ am Tag", async () => {
    const { lead, phone } = await terminMitLead();
    const sel = await prisma.appointment.findFirstOrThrow({ where: { leadId: lead.id } });
    await angebotSelbst(sel.id, ctx(), {}, { now: T0 });
    const start = new Date(T0.getTime() + DAY);
    const bis = new Date("2026-12-01T09:00:00Z");
    const seq = await startBedenkzeit(lead.id, bis, { quelle: "lead", now: start });
    expect(seq?.kind).toBe("offer_selbst_bedenkzeit");
    const conv = await prisma.conversation.create({ data: { customerId, leadId: lead.id, contactPhone: phone } });
    // „Danke!“ direkt danach zählt nicht, eine spätere Antwort schon
    await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", body: "Danke!", createdAt: new Date(start.getTime() + 10 * 60 * 1000) } });
    await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", body: "Ich habe noch eine Frage", createdAt: new Date(start.getTime() + 3 * DAY) } });
    await runSequences(bis);
    expect(waFuer(lead.id)).toHaveLength(0);
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(l.followUpNote).toBe(BEDENKZEIT_AUFGABE);
    expect((await prisma.leadSequence.findUniqueOrThrow({ where: { id: seq!.id } })).stopReason).toBe("Lead hat geantwortet");
  });

  it("Assistent: Wiedervorlage im Angebotsstand wird Bedenkzeit (nicht „recall“ mit Terminvorschlägen)", async () => {
    const { lead } = await terminMitLead({ status: "Angebot gesendet" });
    const seq = await scheduleBotRecall(lead.id, new Date(T0.getTime() + 10 * DAY), "Urlaub", T0);
    expect(seq?.kind).toBe("offer_bedenkzeit");
    // Ohne Angebot bleibt es die normale Wiedervorlage
    const { lead: neu } = await terminMitLead();
    expect((await scheduleBotRecall(neu.id, new Date(T0.getTime() + 2 * DAY), null, T0))?.kind).toBe("recall");
  });

  it("Chat: „ich überlege noch“ → Frage mit Knöpfen, Knopf → Bedenkzeit und Bestätigung; mit Zeit gleich eintragen", async () => {
    const { lead, phone } = await terminMitLead({ status: "Angebot gesendet" });
    const conv = await prisma.conversation.create({ data: { customerId, leadId: lead.id, contactPhone: phone, windowExpiresAt: new Date(T0.getTime() + DAY) } });
    expect(await bedenkzeitImChat(conv.id, "Ich überlege noch", T0)).toEqual({ handled: true });
    expect(chatFuer(phone)[0]).toMatchObject({ body: "Gern, nehmen Sie sich ruhig Zeit. Wann darf ich mich wieder bei Ihnen melden?", buttons: BEDENKZEIT_KNOEPFE });
    expect(await bedenkzeitKnopf(conv.id, "1w", T0)).toBe(true);
    const seq = await prisma.leadSequence.findFirstOrThrow({ where: { leadId: lead.id, stoppedAt: null } });
    expect(seq.kind).toBe("offer_bedenkzeit");
    expect(seq.nextAt?.toISOString()).toBe("2026-11-24T09:00:00.000Z");
    expect(chatFuer(phone)[1].body).toBe("Alles klar, dann melde ich mich am Dienstag, 24. November wieder. Wenn vorher Fragen aufkommen, schreiben Sie einfach hier.");

    expect(await bedenkzeitImChat(conv.id, "Ich melde mich in zwei Wochen", T0)).toEqual({ handled: true });
    expect((await prisma.leadSequence.findFirstOrThrow({ where: { leadId: lead.id, stoppedAt: null } })).nextAt?.toISOString()).toBe("2026-12-01T09:00:00.000Z");
    // Eigene Zeitangabe: der Assistent legt sie an
    const r = await bedenkzeitImChat(conv.id, "Ich überlege bis Freitag", T0);
    expect(r.handled).toBe(false);
    expect(r.hint).toContain("schedule_followup");

    // Ohne Angebot: normale Antwort des Assistenten
    const { lead: ohne, phone: p2 } = await terminMitLead();
    const c2 = await prisma.conversation.create({ data: { customerId, leadId: ohne.id, contactPhone: p2 } });
    expect(await bedenkzeitImChat(c2.id, "Ich überlege noch", T0)).toEqual({ handled: false });
  });
});
