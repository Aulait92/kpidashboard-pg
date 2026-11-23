import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Paket P6 „Nächste Nachrichten“ (Ole, 17.11.2026): Überspringen, Verschieben, Jetzt senden und „Alle pausieren“ wirken
// auf die echten Abläufe (Abfolgen, Erinnerungen, Vorab-Check) und auf die Zeile auf „Heute“. WhatsApp, Mail und Push
// simuliert, Rest gegen die Test-DB.
const send = vi.fn();
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return { ...real, sendWhatsAppNotice: (...a: unknown[]) => send(...a) };
});
const zeiten = vi.fn(async (): Promise<unknown> => null);
vi.mock("@/lib/whatsapp/termin-vorschlaege", () => ({ zweiTerminvorschlaege: () => zeiten() }));
const mail = vi.fn(async (appointmentId: string) => ({ sent: !!appointmentId }));
vi.mock("@/lib/calendar/lead-email", async (orig) => {
  const real = await orig<typeof import("@/lib/calendar/lead-email")>();
  return { ...real, sendLeadEmail: (appointmentId: string) => mail(appointmentId) };
});

import { prisma } from "@/lib/prisma";
import { runSequences, startSequence } from "@/lib/lead-sequences";
import { runReminders, runSoonReminders } from "@/lib/whatsapp/reminders";
import { fortsetzen, jetztSenden, pausieren, ueberspringen, verschieben } from "@/lib/nachrichtenplan-aktionen";
import { ladeAutomatischeNachrichten, loadNachrichtenPlan } from "@/lib/nachrichtenplan-server";
import { runAngebotVorabCheck } from "@/lib/angebot-senden-server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const MIN = 60 * 1000;
const H = 60 * MIN;
const DAY = 24 * H;
// Di 17.11.2026, 10:00 Uhr Berlin (im Versandfenster)
const T0 = new Date("2026-11-17T09:00:00.000Z");
// So 22.11.2026, 12:00 Uhr Berlin (außerhalb)
const SONNTAG = new Date("2026-11-22T11:00:00.000Z");

describe("Nächste Nachrichten: Aktionen ändern die echten Abläufe", () => {
  let customerId = "";
  let n = 0;
  const neuerLead = async (extra: Record<string, unknown> = {}) =>
    prisma.lead.create({ data: { customerId, name: "Anna Becker", phone: `49151777${String(++n).padStart(4, "0")}`, status: "Neuer Lead", ...extra } });
  const anrufe = (phone: string) => send.mock.calls.map((c) => c[0] as { to: string; purpose: string }).filter((c) => c.to === phone);
  const seq = (id: string) => prisma.leadSequence.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ name: "Agentur Ole Kannapinn" })).id;
    await prisma.agentConfig.create({ data: { customerId, active: true, followUpSequencesEnabled: true } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", apiKeyEnc: "x" } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ mode: "template", conversationId: "c" });
    zeiten.mockReset();
    zeiten.mockResolvedValue(null);
    mail.mockClear();
  });

  it("Überspringen: der Schritt geht nicht raus, die Abfolge läuft weiter; Rückgängig plant ihn wieder ein", async () => {
    const lead = await neuerLead();
    const s = (await startSequence(lead.id, "not_reached", T0))!;
    expect(await ueberspringen(lead.id, `abfolge:${s.id}:0`, true)).toMatchObject({ ok: true });
    // Rückgängig und wieder überspringen (Liste ändert sich mit)
    await ueberspringen(lead.id, `abfolge:${s.id}:0`, false);
    expect((await seq(s.id)).uebersprungen).toEqual([]);
    await ueberspringen(lead.id, `abfolge:${s.id}:0`, true);
    await runSequences(T0);
    expect(anrufe(lead.phone!)).toHaveLength(0);
    const nach = await seq(s.id);
    expect(nach.step).toBe(1);
    expect((nach.log as { action: string; result: string }[]).at(-1)).toMatchObject({ action: "whatsapp", result: "skipped" });
    // Ein späterer Schritt (letzte WhatsApp, Tag 6) übersprungen: Abfolge endet ohne Versand
    await ueberspringen(lead.id, `abfolge:${s.id}:2`, true);
    await runSequences(new Date(T0.getTime() + 2 * DAY)); // Tag 2: Anruf-Aufgabe läuft normal
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpNote).toBe("Nachfassen: nochmal anrufen");
    await runSequences(new Date(T0.getTime() + 6 * DAY));
    expect(anrufe(lead.phone!)).toHaveLength(0);
    expect((await seq(s.id)).stopReason).toBe("Abgeschlossen");
    // Vorbei ist vorbei
    expect(await ueberspringen(lead.id, `abfolge:${s.id}:1`, true)).toMatchObject({ ok: false });
  });

  it("Verschieben: der nächste Schritt kommt zur neuen Zeit, die folgenden rücken mit", async () => {
    const lead = await neuerLead();
    const s = (await startSequence(lead.id, "not_reached", T0))!;
    const neu = new Date(T0.getTime() + DAY);
    expect(await verschieben(lead.id, `abfolge:${s.id}:0`, neu, T0)).toMatchObject({ ok: true });
    await runSequences(T0);
    expect(anrufe(lead.phone!)).toHaveLength(0);
    await runSequences(neu);
    expect(anrufe(lead.phone!)).toHaveLength(1);
    // Anruf-Aufgabe (Tag 2) jetzt einen Tag später: Tag 3
    expect((await seq(s.id)).nextAt!.toISOString()).toBe(new Date(T0.getTime() + 3 * DAY).toISOString());
    // nur der nächste Schritt, nicht in die Vergangenheit
    expect(await verschieben(lead.id, `abfolge:${s.id}:2`, new Date(T0.getTime() + 9 * DAY), neu)).toMatchObject({ ok: false });
    expect(await verschieben(lead.id, `abfolge:${s.id}:1`, new Date(neu.getTime() - H), neu)).toMatchObject({ ok: false });
  });

  it("Jetzt senden: sofort, auch außerhalb des Versandfensters, danach normal weiter", async () => {
    const lead = await neuerLead();
    // Sonntagabend nach 18 Uhr: „Chat ruht“ wartet (sonntags nur 10 bis 18 Uhr, Ole 22.11.2026)
    const abend = new Date("2026-11-22T18:00:00.000Z");
    const s = (await startSequence(lead.id, "silent", abend))!;
    await runSequences(new Date(abend.getTime() + 3 * H));
    expect(anrufe(lead.phone!)).toHaveLength(0); // außerhalb des Fensters: wartet
    const r = await jetztSenden(lead.id, `abfolge:${s.id}:0`, new Date(abend.getTime() + 3 * H));
    expect(r).toEqual({ ok: true, text: "Nachfassen: WhatsApp gesendet" });
    expect(anrufe(lead.phone!)).toHaveLength(1);
    expect((await seq(s.id)).step).toBe(1);
    // Anruf-Aufgaben lassen sich nicht „jetzt senden“
    const b = await neuerLead();
    const t = (await startSequence(b.id, "not_reached", T0))!;
    await prisma.leadSequence.update({ where: { id: t.id }, data: { step: 1 } });
    expect(await jetztSenden(b.id, `abfolge:${t.id}:1`, T0)).toMatchObject({ ok: false });
  });

  it("Alle pausieren: Abfolge wartet; Fortsetzen rückt sie um die Pause nach", async () => {
    const lead = await neuerLead();
    const s = (await startSequence(lead.id, "not_reached", T0))!;
    await pausieren(lead.id, T0);
    await runSequences(T0);
    await runSequences(new Date(T0.getTime() + 3 * DAY));
    expect(anrufe(lead.phone!)).toHaveLength(0);
    expect((await seq(s.id)).step).toBe(0);
    // zwei Tage später fortgesetzt: erster Schritt jetzt, Anruf-Aufgabe zwei Tage später als geplant
    const weiter = new Date(T0.getTime() + 2 * DAY);
    await fortsetzen(lead.id, weiter);
    const a = await seq(s.id);
    expect(a.nextAt!.toISOString()).toBe(weiter.toISOString());
    expect(a.neustartAt!.toISOString()).toBe(weiter.toISOString());
    await runSequences(weiter);
    expect(anrufe(lead.phone!)).toHaveLength(1);
    expect((await seq(s.id)).nextAt!.toISOString()).toBe(new Date(T0.getTime() + 4 * DAY).toISOString());
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).nachrichtenPausiertAt).toBeNull();
  });

  it("Erinnerungen: pausiert gehen keine raus, übersprungene einzeln nicht (Vortag WhatsApp bzw. Mail, 1 Stunde)", async () => {
    const now = new Date();
    const termin = async (startsIn: number, bookedAgo: number) => {
      const lead = await neuerLead({ name: "Anna Becker", source: "Privatschutz" });
      const conv = await prisma.conversation.create({ data: { customerId, contactPhone: lead.phone!, contactName: "Anna Becker", leadId: lead.id, contactEmail: "anna@example.com" } });
      const appt = await prisma.appointment.create({
        data: { customerId, leadId: lead.id, conversationId: conv.id, mode: "video", meetUrl: "https://meet.google.com/abc", status: "booked", startsAt: new Date(now.getTime() + startsIn), createdAt: new Date(now.getTime() - bookedAgo) },
      });
      return { lead, appt };
    };
    // Vortag: pausiert → nichts; Fortsetzen → geht raus
    const p = await termin(23 * H, 30 * H);
    await pausieren(p.lead.id, now);
    await runReminders(now);
    expect(anrufe(p.lead.phone!)).toHaveLength(0);
    expect(mail.mock.calls.filter((c) => c[0] === p.appt.id)).toHaveLength(0);
    await fortsetzen(p.lead.id, now);
    await runReminders(now);
    expect(anrufe(p.lead.phone!)).toHaveLength(1);
    // Vortag: WhatsApp übersprungen → nur die Mail, Erinnerung gilt als erledigt
    const w = await termin(23 * H, 30 * H);
    await ueberspringen(w.lead.id, `erinnerung:${w.appt.id}:vortag`, true);
    await runReminders(now);
    expect(anrufe(w.lead.phone!)).toHaveLength(0);
    expect(mail.mock.calls.filter((c) => c[0] === w.appt.id)).toHaveLength(1);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: w.appt.id } })).reminderSentAt).not.toBeNull();
    // Vortag: Mail übersprungen → nur WhatsApp
    const m = await termin(23 * H, 30 * H);
    await ueberspringen(m.lead.id, `erinnerung:${m.appt.id}:vortag_mail`, true);
    await runReminders(now);
    expect(anrufe(m.lead.phone!)).toHaveLength(1);
    expect(mail.mock.calls.filter((c) => c[0] === m.appt.id)).toHaveLength(0);
    // 1 Stunde vorher übersprungen → keine, Rückgängig → geht raus
    const s = await termin(55 * MIN, 3 * H);
    await ueberspringen(s.lead.id, `erinnerung:${s.appt.id}:stunde`, true);
    await runSoonReminders(now);
    expect(anrufe(s.lead.phone!)).toHaveLength(0);
    await ueberspringen(s.lead.id, `erinnerung:${s.appt.id}:stunde`, false);
    await runSoonReminders(now);
    expect(anrufe(s.lead.phone!)).toHaveLength(1);
    // Im Plan: übersprungen markiert, pausiert markiert
    await ueberspringen(s.lead.id, `erinnerung:${s.appt.id}:gleich`, true);
    const plan = await loadNachrichtenPlan(s.lead.id, now);
    expect(plan.find((e) => e.key === `erinnerung:${s.appt.id}:gleich`)).toMatchObject({ uebersprungen: true, aktionen: ["rueckgaengig"] });
  });

  it("Vorab-Check zum Angebot: nicht für übersprungene Schritte und nicht während der Pause", async () => {
    const push = vi.fn(async () => undefined);
    const lead = await neuerLead();
    const s = (await startSequence(lead.id, "offer", T0))!;
    // Mi 18.11., 18:30 Uhr: Vorab-Check für Tag 2 (Do 10 Uhr) wäre fällig
    const abend = new Date("2026-11-18T17:30:00Z");
    await ueberspringen(lead.id, `abfolge:${s.id}:0`, true);
    await runAngebotVorabCheck(abend, push);
    expect(push).not.toHaveBeenCalled();
    await ueberspringen(lead.id, `abfolge:${s.id}:0`, false);
    await pausieren(lead.id, T0);
    await runAngebotVorabCheck(abend, push);
    expect(push).not.toHaveBeenCalled();
    await prisma.lead.update({ where: { id: lead.id }, data: { nachrichtenPausiertAt: null } });
    await runAngebotVorabCheck(abend, push);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("Heute-Zeile: zählt morgen automatische Nachrichten je Kontakt, ohne pausierte und übersprungene", async () => {
    const eigener = (await makeCustomer()).id;
    try {
      await prisma.agentConfig.create({ data: { customerId: eigener, active: true, followUpSequencesEnabled: true } });
      const mk = (name: string) => prisma.lead.create({ data: { customerId: eigener, name, phone: `49151888${String(++n).padStart(4, "0")}`, status: "Neuer Lead" } });
      // Lead A: Abfolge „Nicht erreicht“ mit dem ersten Schritt morgen 10 Uhr (WhatsApp)
      const a = await mk("Anna Becker");
      const sa = (await startSequence(a.id, "not_reached", T0))!;
      await prisma.leadSequence.update({ where: { id: sa.id }, data: { nextAt: new Date(T0.getTime() + DAY) } });
      // Lead B: Termin übermorgen 11 Uhr → Vortag morgen 11 Uhr (WhatsApp + Mail)
      const b = await mk("Bernd Kraus");
      const conv = await prisma.conversation.create({ data: { customerId: eigener, contactPhone: b.phone!, leadId: b.id, contactEmail: "b@example.com" } });
      const tb = await prisma.appointment.create({
        data: { customerId: eigener, leadId: b.id, conversationId: conv.id, mode: "phone", status: "booked", startsAt: new Date(T0.getTime() + 2 * DAY + H), createdAt: T0 },
      });
      // Lead C: pausiert
      const c = await mk("Clara Dorn");
      await startSequence(c.id, "not_reached", T0).then((x) => prisma.leadSequence.update({ where: { id: x!.id }, data: { nextAt: new Date(T0.getTime() + DAY) } }));
      await pausieren(c.id, T0);

      const von = new Date("2026-11-17T23:00:00.000Z");
      const bis = new Date("2026-11-18T23:00:00.000Z");
      const r = await ladeAutomatischeNachrichten({ customerId: eigener }, von, bis, T0);
      expect(r.anzahl).toBe(3);
      expect(r.leads.map((l) => [l.name, l.anzahl])).toEqual([
        ["Anna Becker", 1],
        ["Bernd Kraus", 2],
      ]);
      await ueberspringen(b.id, `erinnerung:${tb.id}:vortag_mail`, true);
      expect((await ladeAutomatischeNachrichten({ customerId: eigener }, von, bis, T0)).anzahl).toBe(2);
    } finally {
      await cleanupCustomer(eigener);
    }
  });
});
