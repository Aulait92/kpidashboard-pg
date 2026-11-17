// Show-up-Paket (Ole, 17.11.2026): Vortag, 1 Stunde, 15 Minuten. WhatsApp-Versand simuliert, Rest gegen die Test-DB.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return { ...real, sendWhatsAppNotice: (...a: unknown[]) => send(...a) };
});

import { prisma } from "@/lib/prisma";
import { runReminders, runSoonReminders, runStartReminders } from "@/lib/whatsapp/reminders";
import { handleButtonReply } from "@/lib/whatsapp/knopf";
import { NoTemplateError } from "@/lib/whatsapp/templates";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const MIN = 60 * 1000;
const H = 60 * MIN;

describe("Show-up: drei Erinnerungen", () => {
  let customerId = "";
  let n = 0;
  const termin = async (opts: { startsIn: number; bookedAgo: number; mode?: string; komplettcheck?: boolean; meetUrl?: string | null }) => {
    const now = Date.now();
    const phone = `49151333${String(++n).padStart(4, "0")}`;
    const lead = await prisma.lead.create({
      data: {
        customerId,
        name: "Anna Becker",
        phone,
        source: "Privatschutz",
        formData: [
          { label: "Anrede", value: "Frau" },
          { label: "Versicherungsinteresse", value: "Haftpflicht und Hausrat" },
          { label: "Lebenssituation", value: "Familie mit Kindern" },
        ],
      },
    });
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: phone, contactName: "Anna Becker", leadId: lead.id } });
    const appt = await prisma.appointment.create({
      data: {
        customerId,
        leadId: lead.id,
        conversationId: conv.id,
        mode: opts.mode ?? "video",
        meetUrl: opts.meetUrl === undefined ? "https://meet.google.com/abc-defg-hij" : opts.meetUrl,
        status: "booked",
        komplettcheck: opts.komplettcheck ?? null,
        startsAt: new Date(now + opts.startsIn),
        createdAt: new Date(now - opts.bookedAgo),
      },
    });
    return { appt, conv, lead, phone };
  };
  const callsFor = (phone: string) => send.mock.calls.map((c) => c[0] as { to: string; purpose: string; text: string; params: string[]; paramsFor?: (t: unknown) => string[] }).filter((c) => c.to === phone);

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ name: "Agentur Ole Kannapinn" })).id;
    await prisma.erstinformation.create({ data: { customerId, name: "Ole Kannapinn", anrede: "Herr", token: `t${customerId}` } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ mode: "text", conversationId: "c" });
  });

  it("Vortag: Nutzensatz, Komplettcheck-Satz, Link, „Passt es weiterhin?“, Herr Kannapinn", async () => {
    const { appt, phone } = await termin({ startsIn: 23 * H, bookedAgo: 30 * H, komplettcheck: true });
    await runReminders();
    const [c] = callsFor(phone);
    expect(c.purpose).toBe("reminder");
    expect(c.text).toContain("Guten Tag Frau Becker, kurze Erinnerung an Ihren Termin");
    expect(c.text).toContain("zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Ihre Familie kosten");
    expect(c.text).toContain("Legen Sie gern Ihre bestehenden Verträge bereit.");
    expect(c.text).toContain("So geht es los: https://meet.google.com/abc-defg-hij");
    expect(c.text).toMatch(/Passt es weiterhin\?$/);
    // Vorlage: v5 (aktuell) mit Wann, Nutzen, Zugang
    const v5 = c.paramsFor!({ version: 5, current: true, ansprache: "sie", purpose: "reminder" });
    expect(v5).toHaveLength(4);
    expect(v5[1]).toMatch(/^morgen um /);
    expect(v5[2]).toContain("Legen Sie gern Ihre bestehenden Verträge bereit.");
    expect(v5[3]).toBe("https://meet.google.com/abc-defg-hij");
    // Rückfall, solange Meta v5 für den Kunden nicht freigegeben hat: v4 (nicht mehr aktuell) mit bisheriger Belegung
    const v4 = c.paramsFor!({ version: 4, current: false, ansprache: "sie", purpose: "reminder" });
    expect(v4).toHaveLength(4);
    expect(v4[2]).toBe("Videocall");
    expect(v4[3]).toBe("https://meet.google.com/abc-defg-hij");
    // noch ältere bzw. von Hand angelegte: Satz zum Verschieben im letzten Parameter
    for (const version of [3, 0]) expect(c.paramsFor!({ version, current: false, ansprache: "sie", purpose: "reminder" })[3]).toMatch(/^https:\/\/meet\.google\.com\/abc-defg-hij Falls etwas dazwischenkommt/);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).reminderSentAt).not.toBeNull();
  });

  it("weniger als 26 h vorher gebucht: keine Vortags-Erinnerung", async () => {
    const { phone } = await termin({ startsIn: 20 * H, bookedAgo: 5 * H });
    await runReminders();
    expect(callsFor(phone)).toHaveLength(0);
  });

  it("1 Stunde vorher: Text ohne Link; weniger als 2 h vorher gebucht: keine", async () => {
    const a = await termin({ startsIn: 55 * MIN, bookedAgo: 3 * H });
    const b = await termin({ startsIn: 55 * MIN, bookedAgo: 60 * MIN });
    await runSoonReminders();
    const [c] = callsFor(a.phone);
    expect(c.purpose).toBe("reminder_soon");
    expect(c.text).toBe(
      "Guten Tag Frau Becker, in einer Stunde ist Ihr Videotermin mit Herrn Kannapinn. Passt bei Ihnen alles? Falls etwas dazwischengekommen ist, finden wir gern eine neue Zeit.",
    );
    expect(c.paramsFor!({ version: 5, current: true, ansprache: "sie", purpose: "reminder_soon" })).toEqual(["Anna", "Videotermin", "Herrn Kannapinn"]);
    // Rückfall v4 (noch nicht freigegeben): Uhrzeit, Art, Link
    const v4 = c.paramsFor!({ version: 4, current: false, ansprache: "sie", purpose: "reminder_soon" });
    expect(v4.slice(2)).toEqual(["Videocall", "https://meet.google.com/abc-defg-hij"]);
    expect(v4[1]).toMatch(/^\d{2}:\d{2} Uhr$/);
    expect(callsFor(b.phone)).toHaveLength(0);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: b.appt.id } })).soonReminderSentAt).not.toBeNull();
  });

  it("15 Minuten vorher: Link und „Bitte verschieben“, genau einmal; ohne freigegebene Vorlage still", async () => {
    const { appt, phone } = await termin({ startsIn: 14 * MIN, bookedAgo: 3 * H });
    await Promise.all([runStartReminders(), runStartReminders()]);
    const calls = callsFor(phone);
    expect(calls).toHaveLength(1);
    expect(calls[0].purpose).toBe("reminder_start");
    expect(calls[0].text).toContain("gleich geht es los: Herr Kannapinn ist um");
    expect(calls[0].text).toContain("ohne App: https://meet.google.com/abc-defg-hij. Bis gleich!");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).startReminderSentAt).not.toBeNull();
    send.mockRejectedValue(new NoTemplateError("reminder_start"));
    const r = await termin({ startsIn: 12 * MIN, bookedAgo: 3 * H });
    const res = await runStartReminders();
    expect(res.errors).toEqual([]);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: r.appt.id } })).startReminderSentAt).not.toBeNull();
    // Telefontermin: keine 15-Min.-Erinnerung
    send.mockReset();
    const tel = await termin({ startsIn: 13 * MIN, bookedAgo: 3 * H, mode: "phone", meetUrl: null });
    await runStartReminders();
    expect(callsFor(tel.phone)).toHaveLength(0);
  });

  it("nach „Bitte verschieben“ entfallen weitere Erinnerungen; „Ja, passt“ hebt das wieder auf", async () => {
    const { appt, conv, phone } = await termin({ startsIn: 50 * MIN, bookedAgo: 30 * H });
    const r = await handleButtonReply(conv.id, { kind: "button", text: "Bitte verschieben" });
    expect(r.handled).toBe(false);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).rescheduleRequestedAt).not.toBeNull();
    await runSoonReminders();
    expect(callsFor(phone)).toHaveLength(0);
    await prisma.appointment.update({ where: { id: appt.id }, data: { soonReminderSentAt: null } });
    await handleButtonReply(conv.id, { kind: "button", text: "Ja, passt" });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).rescheduleRequestedAt).toBeNull();
  });
});
