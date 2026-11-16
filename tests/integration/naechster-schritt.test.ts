// Nächster Schritt und Verloren-Schutz (Ole, 14.11.2026) gegen die Test-Datenbank: gleiche Regel in Prisma
// wie in JS, Anrufversuche mit 30-Minuten-Sperre, Anrufplan ohne doppelte Aufgaben, Warnung unter 6 Versuchen,
// Aufgabe beim Schließen ohne Wahl, Erinnerung einmal pro Tag.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ userId: "", customerId: "" }));
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getCurrentSession: async () => ({ userId: st.userId, email: "x@example.test", role: "BUYER", customerId: st.customerId }),
}));
vi.mock("@/lib/buyer-context", () => ({
  getBuyerContext: async () => ({ customerId: st.customerId, email: "x@example.test", preview: false, userId: st.userId, teamRole: "owner" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const push = vi.fn();
const mail = vi.fn();
vi.mock("@/lib/push", async (orig) => ({ ...(await orig<typeof import("@/lib/push")>()), sendToUser: (...a: unknown[]) => push(...a) }));
vi.mock("@/lib/email", async (orig) => ({ ...(await orig<typeof import("@/lib/email")>()), sendCustomerMail: (...a: unknown[]) => mail(...a) }));
const send = vi.fn();
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return { ...real, sendWhatsAppNotice: (...a: unknown[]) => send(...a) };
});

import { prisma } from "@/lib/prisma";
import { countWithoutNextStep, listWithoutNextStep, lostEarlyStats, nextStepRate, nextStepStateOf } from "@/lib/lead-next-step-server";
import { registerCallAttempt } from "@/lib/call-attempts";
import { runSequences } from "@/lib/lead-sequences";
import { runNextStepReminders } from "@/lib/next-step-reminder";
import { keepTryingResult, markLeadLostResult, nextStepTaskResult } from "@/app/buyer/next-step-actions";
import { callbackOutcomeResult, followUpNotReachedResult, undoInboxAction } from "@/app/buyer/inbox-actions";
import { loadLeadHistory } from "@/lib/lead-history";
import { NEXT_STEP_TASK_NOTE } from "@/lib/lead-next-step";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("Nächster Schritt", () => {
  let customerId = "";
  let n = 0;
  const lead = (extra: Record<string, unknown> = {}) =>
    prisma.lead.create({ data: { customerId, name: "Lisa Koch", phone: `49151200${String(++n).padStart(4, "0")}`, status: "Im Gespräch", ...extra } });

  beforeAll(async () => {
    requireTestDb();
    const c = await makeCustomer();
    customerId = c.id;
    const u = await makeBuyer(c.id, "owner");
    st.userId = u.id;
    st.customerId = c.id;
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    push.mockReset();
    mail.mockReset();
    send.mockReset();
    send.mockResolvedValue({ mode: "template", conversationId: "c" });
    mail.mockResolvedValue({ ok: true });
    push.mockResolvedValue({ sent: 1, removed: 0, errors: [] });
  });

  it("gleiche Regel in der Datenbank wie im Code: Termin, Wiedervorlage, Bot-Gespräch, Ergebnis fehlt", async () => {
    const now = new Date();
    const withAppt = await lead({ status: "In Beratung" });
    await prisma.appointment.create({ data: { customerId, leadId: withAppt.id, mode: "phone", startsAt: new Date(now.getTime() + DAY) } });
    const withFollowUp = await lead({ followUpAt: new Date(now.getTime() - DAY) });
    const withBot = await lead();
    await prisma.conversation.create({ data: { customerId, leadId: withBot.id, contactPhone: withBot.phone!, botActive: true, lastMessageAt: new Date(now.getTime() - HOUR) } });
    const oldBot = await lead();
    await prisma.conversation.create({ data: { customerId, leadId: oldBot.id, contactPhone: oldBot.phone!, botActive: true, lastMessageAt: new Date(now.getTime() - 2 * DAY) } });
    const pastAppt = await lead({ status: "In Beratung" });
    await prisma.appointment.create({ data: { customerId, leadId: pastAppt.id, mode: "phone", startsAt: new Date(now.getTime() - 2 * HOUR) } });
    const plain = await lead();
    await lead({ status: "Neuer Lead" });
    await lead({ status: "Abschluss", closedAt: now });
    await lead({ status: "Kein Interesse" });

    expect(await nextStepStateOf(withAppt.id)).toBe("ok");
    expect(await nextStepStateOf(withFollowUp.id)).toBe("ok");
    expect(await nextStepStateOf(withBot.id)).toBe("ok");
    expect(await nextStepStateOf(oldBot.id)).toBe("missing");
    expect(await nextStepStateOf(pastAppt.id)).toBe("result_missing");
    expect(await nextStepStateOf(plain.id)).toBe("missing");

    expect(await countWithoutNextStep({ customerId })).toBe(3);
    const list = await listWithoutNextStep({ customerId });
    expect(list.leads.map((l) => l.leadId).sort()).toEqual([oldBot.id, pastAppt.id, plain.id].sort());
    expect(list.leads.find((l) => l.leadId === pastAppt.id)?.resultMissing).toBe(true);
    const rate = await nextStepRate(customerId);
    expect(rate).toMatchObject({ open: 6, withNextStep: 3, withoutNextStep: 3, resultMissing: 1, rate: 0.5 });
    await prisma.lead.deleteMany({ where: { customerId } });
  });

  it("Anrufversuche zählen je 30 Minuten nur einmal und stehen im Verlauf", async () => {
    const l = await lead({ status: "Neuer Lead" });
    const t0 = new Date("2026-11-17T09:00:00.000Z");
    const a = await registerCallAttempt(l.id, { customerId, now: t0 });
    expect(a).toMatchObject({ counted: true, attempts: 1 });
    const b = await registerCallAttempt(l.id, { customerId, now: new Date(t0.getTime() + 10 * 60 * 1000) });
    expect(b).toMatchObject({ counted: false, attempts: 1 });
    const c = await registerCallAttempt(l.id, { customerId, now: new Date(t0.getTime() + 31 * 60 * 1000) });
    expect(c).toMatchObject({ counted: true, attempts: 2 });
    const row = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(row).toMatchObject({ callAttempts: 2, contactAttempts: 2, status: "Nicht erreicht", reached: false });
    const h = await loadLeadHistory(l.id, null);
    expect(h.filter((e) => e.kind === "anruf").map((e) => e.text.split(" · ")[0])).toEqual(["Anruf: nicht erreicht (Versuch 2 von 6)", "Anruf: nicht erreicht (Versuch 1 von 6)"]);
  });

  it("Anrufplan: nächster Versuch als Wiedervorlage, eigene Wiedervorlage bleibt, keine doppelte Aufgabe mit der Abfolge", async () => {
    await prisma.agentConfig.create({ data: { customerId, active: true, followUpSequencesEnabled: true } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", apiKeyEnc: "x" } });
    const t0 = new Date("2026-11-17T09:00:00.000Z"); // Di 10:00 Berlin
    const l = await lead({ status: "Neuer Lead" });
    const r = await registerCallAttempt(l.id, { customerId, now: t0 });
    expect(r?.auto).toBe(true);
    let row = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(row.followUpNote).toBe("Anrufversuch 2 von 6");
    expect(row.followUpAt?.toISOString()).toBe("2026-11-17T11:00:00.000Z"); // + 2 Stunden

    // Abfolge: WhatsApp sofort, ihr Anruf-Schritt an Tag 2 legt keine zweite Aufgabe an
    await runSequences(t0);
    expect(send).toHaveBeenCalledTimes(1);
    await runSequences(new Date(t0.getTime() + 2 * DAY));
    row = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(row.followUpNote).toBe("Anrufversuch 2 von 6");
    const seq = await prisma.leadSequence.findFirstOrThrow({ where: { leadId: l.id } });
    expect((seq.log as { result: string }[]).map((e) => e.result)).toEqual(["template", "kept_followup"]);

    // Eigene, spätere Wiedervorlage bleibt
    const own = await lead({ status: "Nicht erreicht" });
    const later = new Date(t0.getTime() + 5 * DAY);
    await prisma.lead.update({ where: { id: own.id }, data: { followUpAt: later, followUpNote: "Ruf mich Montag an" } });
    const r2 = await registerCallAttempt(own.id, { customerId, now: t0 });
    expect(r2).toMatchObject({ counted: true, keptFollowUp: true, nextAt: null });
    const ownRow = await prisma.lead.findUniqueOrThrow({ where: { id: own.id } });
    expect(ownRow.followUpNote).toBe("Ruf mich Montag an");
    await prisma.agentConfig.delete({ where: { customerId } });
    await prisma.whatsAppAccount.delete({ where: { customerId } });
  });

  it("nach 6 Versuchen kein weiterer Versuch, dann ist „Nach 6 Versuchen nicht erreichbar“ wählbar", async () => {
    const l = await lead({ status: "Nicht erreicht" });
    let t = new Date("2026-11-17T09:00:00.000Z");
    for (let i = 0; i < 6; i++) {
      await registerCallAttempt(l.id, { customerId, now: t });
      t = new Date(t.getTime() + HOUR);
    }
    const row = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(row.callAttempts).toBe(6);
    expect(row.followUpAt).toBeNull();
    expect(await nextStepStateOf(l.id)).toBe("missing");
    const res = await markLeadLostResult(l.id, { reason: "nicht_erreichbar" });
    expect(res.ok).toBe(true);
    const lost = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(lost).toMatchObject({ status: "Disqualifiziert", reached: false, lostReason: "nicht_erreichbar", lostEarly: false });
  });

  it("Warnung beim Verlieren unter 6 Versuchen, Ausnahmen ohne Warnung, Trotzdem verloren nur mit Begründung", async () => {
    const l = await lead({ status: "Nicht erreicht", callAttempts: 1 });
    const warn = await markLeadLostResult(l.id, { reason: "schon_versichert" });
    expect(warn).toMatchObject({ ok: false, warn: { attempts: 1, target: 6 } });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("Nicht erreicht");
    // „Nach 6 Versuchen nicht erreichbar“ ist gesperrt
    expect(await markLeadLostResult(l.id, { reason: "nicht_erreichbar" })).toMatchObject({ ok: false, error: "Erst 1 von 6 Versuchen." });
    // Trotzdem verloren ohne Begründung: abgelehnt
    expect(await markLeadLostResult(l.id, { reason: "schon_versichert", override: true })).toMatchObject({ ok: false });
    const ok = await markLeadLostResult(l.id, { reason: "schon_versichert", override: true, note: "Kunde schreibt per Mail, er ist versichert" });
    expect(ok.ok).toBe(true);
    const row = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(row).toMatchObject({ status: "Kein Interesse", lostReason: "schon_versichert", lostEarly: true, reached: false });
    const stats = await lostEarlyStats(customerId, new Date(Date.now() - DAY));
    expect(stats.total.early).toBeGreaterThanOrEqual(1);

    // Rückgängig stellt Status und Grund wieder her
    if (ok.ok && ok.undo) await undoInboxAction(ok.undo);
    const back = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(back).toMatchObject({ status: "Nicht erreicht", lostReason: null, lostEarly: false });

    for (const reason of ["falsche_daten", "nicht_angefragt", "kein_interesse"]) {
      const x = await lead({ status: "Nicht erreicht", callAttempts: 1 });
      expect((await markLeadLostResult(x.id, { reason })).ok).toBe(true);
    }
    // Sonstiges braucht eine Begründung
    const y = await lead({ status: "Im Gespräch", reached: true });
    expect(await markLeadLostResult(y.id, { reason: "sonstiges" })).toMatchObject({ ok: false, error: "Bitte kurz begründen." });
    expect((await markLeadLostResult(y.id, { reason: "sonstiges", note: "Zieht ins Ausland" })).ok).toBe(true);
  });

  it("„Weiter versuchen“ plant den nächsten Versuch ohne neuen Versuch zu zählen", async () => {
    const l = await lead({ status: "Nicht erreicht", callAttempts: 2, lastCallAttemptAt: new Date(Date.now() - 3 * HOUR), callPlanStartedAt: new Date(Date.now() - 3 * HOUR) });
    const res = await keepTryingResult(l.id);
    expect(res.ok).toBe(true);
    const row = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(row.callAttempts).toBe(2);
    expect(row.followUpNote).toBe("Anrufversuch 3 von 6");
    expect(row.followUpAt!.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("Ergebnis „nicht erreicht“ in der Anrufliste nutzt dieselbe Zählung", async () => {
    const l = await lead({ status: "Neuer Lead" });
    const r1 = await callbackOutcomeResult(l.id, "not_reached");
    expect(r1.ok && r1.attempt).toMatchObject({ counted: true, attempts: 1 });
    const r2 = await callbackOutcomeResult(l.id, "not_reached");
    expect(r2.ok && r2.attempt).toMatchObject({ counted: false, attempts: 1 });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).callAttempts).toBe(1);
  });

  it("Dialog ohne Wahl geschlossen: Aufgabe für morgen, keine Doppelung", async () => {
    const l = await lead();
    expect(await nextStepTaskResult(l.id)).toEqual({ ok: true, created: true });
    const row = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(row.followUpNote).toBe(NEXT_STEP_TASK_NOTE);
    expect(await nextStepTaskResult(l.id)).toEqual({ ok: true, created: false });
    // Lead mit Schritt bekommt keine Aufgabe
    const withStep = await lead({ followUpAt: new Date(Date.now() + DAY), followUpNote: "Angebot nachfassen" });
    expect(await nextStepTaskResult(withStep.id)).toEqual({ ok: true, created: false });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: withStep.id } })).followUpNote).toBe("Angebot nachfassen");
  });

  it("Erinnerung um 8 Uhr: einmal pro Tag und Login, abschaltbar", async () => {
    await prisma.lead.deleteMany({ where: { customerId } });
    await lead();
    await lead({ status: "Nicht erreicht" });
    const early = new Date("2026-11-18T06:30:00.000Z"); // 7:30 Berlin
    const at8 = new Date("2026-11-18T07:05:00.000Z"); // 8:05 Berlin
    expect((await runNextStepReminders(early)).due).toBe(false);
    const first = await runNextStepReminders(at8);
    expect(first.sent).toBeGreaterThanOrEqual(1);
    const mine = push.mock.calls.filter((c) => c[0] === st.userId);
    expect(mine).toHaveLength(1);
    expect(mine[0][1]).toMatchObject({ title: "2 Leads brauchen einen nächsten Schritt" });
    expect(mail.mock.calls.some((c) => (c[0] as { subject: string }).subject === "2 Leads brauchen einen nächsten Schritt")).toBe(true);
    // gleicher Tag: nichts mehr
    await runNextStepReminders(new Date(at8.getTime() + 5 * 60 * 1000));
    expect(push.mock.calls.filter((c) => c[0] === st.userId)).toHaveLength(1);
    // nächster Tag: wieder
    await runNextStepReminders(new Date(at8.getTime() + DAY));
    expect(push.mock.calls.filter((c) => c[0] === st.userId)).toHaveLength(2);
    // abgeschaltet: nichts
    await prisma.user.update({ where: { id: st.userId }, data: { nextStepReminder: false } });
    await runNextStepReminders(new Date(at8.getTime() + 2 * DAY));
    expect(push.mock.calls.filter((c) => c[0] === st.userId)).toHaveLength(2);
    await prisma.user.update({ where: { id: st.userId }, data: { nextStepReminder: true } });
  });

  it("Berater bekommt die Erinnerung nur für eigene Leads", async () => {
    await prisma.lead.deleteMany({ where: { customerId } });
    const advisor = await makeBuyer(customerId, "advisor");
    await lead({ assignedUserId: advisor.id });
    await lead();
    const at8 = new Date("2026-11-25T07:05:00.000Z");
    await runNextStepReminders(at8);
    const adv = push.mock.calls.filter((c) => c[0] === advisor.id);
    expect(adv).toHaveLength(1);
    expect(adv[0][1]).toMatchObject({ title: "1 Lead braucht einen nächsten Schritt" });
    const owner = push.mock.calls.filter((c) => c[0] === st.userId);
    expect(owner[0][1]).toMatchObject({ title: "1 Lead braucht einen nächsten Schritt" });
  });

  it("Wiedervorlage nicht erreicht: Versuch gezählt, Wiedervorlage rückt vor, Notiz bleibt (Ole, 16.11.2026)", async () => {
    const now = new Date();
    const l = await lead({ followUpAt: new Date(now.getTime() - DAY), followUpNote: "Angebot nachfassen" });
    expect(await followUpNotReachedResult(l.id)).toMatchObject({ ok: true });
    const neu = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(neu.callAttempts).toBe(1);
    expect(neu.followUpAt!.getTime()).toBeGreaterThan(now.getTime());
    expect(neu.followUpNote).toBeTruthy();
    expect((await loadLeadHistory(l.id, null)).some((h) => /nicht erreicht/i.test(h.text ?? ""))).toBe(true);
  });
});
