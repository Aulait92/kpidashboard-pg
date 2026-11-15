// Kurz vor dem Termin nachfragen, ob alles passt (Ole, 15.11.2026). WhatsApp-Versand simuliert.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return { ...real, sendWhatsAppNotice: (...a: unknown[]) => send(...a) };
});

import { prisma } from "@/lib/prisma";
import { runSoonReminders } from "@/lib/whatsapp/reminders";
import { NoTemplateError } from "@/lib/whatsapp/templates";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const MIN = 60 * 1000;

describe("Termin: kurz vorher nachfragen", () => {
  let customerId = "";
  let n = 0;
  const appt = async (opts: { startsIn: number; bookedAgo: number; reminderAgo?: number }) => {
    const now = Date.now();
    const phone = `49151222${String(++n).padStart(4, "0")}`;
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: phone, contactName: "Lisa Koch" } });
    return prisma.appointment.create({
      data: {
        customerId,
        conversationId: conv.id,
        mode: "phone",
        status: "booked",
        startsAt: new Date(now + opts.startsIn),
        createdAt: new Date(now - opts.bookedAgo),
        reminderSentAt: opts.reminderAgo ? new Date(now - opts.reminderAgo) : null,
      },
    });
  };

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ mode: "template", conversationId: "c" });
  });

  it("etwa 1 Std. vorher genau einmal, mit Uhrzeit und Frage, ob alles passt", async () => {
    const a = await appt({ startsIn: 45 * MIN, bookedAgo: 24 * 60 * MIN, reminderAgo: 23 * 60 * MIN });
    await runSoonReminders();
    const calls = send.mock.calls.filter((c) => (c[0] as { to: string }).to.endsWith(String(n).padStart(4, "0")));
    expect(calls).toHaveLength(1);
    const arg = calls[0][0] as { purpose: string; params: string[]; text: string };
    expect(arg.purpose).toBe("reminder_soon");
    expect(arg.params[1]).toMatch(/^\d{2}:\d{2} Uhr$/);
    expect(arg.text).toContain("Passt bei Ihnen alles?");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: a.id } })).soonReminderSentAt).not.toBeNull();
    send.mockClear();
    await runSoonReminders();
    expect(send.mock.calls.filter((c) => (c[0] as { to: string }).to.endsWith(String(n).padStart(4, "0")))).toHaveLength(0);
  });

  it("nicht bei kurzfristiger Buchung oder gerade erst verschickter Erinnerung", async () => {
    const fresh = await appt({ startsIn: 50 * MIN, bookedAgo: 60 * MIN });
    const justReminded = await appt({ startsIn: 50 * MIN, bookedAgo: 10 * 60 * MIN, reminderAgo: 20 * MIN });
    await runSoonReminders();
    expect(send).not.toHaveBeenCalled();
    for (const x of [fresh, justReminded]) expect((await prisma.appointment.findUniqueOrThrow({ where: { id: x.id } })).soonReminderSentAt).not.toBeNull();
  });

  it("ohne freigegebene Vorlage „Kurz vor dem Termin“: normale Erinnerungs-Vorlage", async () => {
    await appt({ startsIn: 40 * MIN, bookedAgo: 48 * 60 * MIN, reminderAgo: 24 * 60 * MIN });
    send.mockImplementation(async (o: { purpose: string }) => {
      if (o.purpose === "reminder_soon") throw new NoTemplateError("reminder_soon");
      return { mode: "template", conversationId: "c" };
    });
    await runSoonReminders();
    expect(send.mock.calls.map((c) => (c[0] as { purpose: string }).purpose)).toEqual(["reminder_soon", "reminder"]);
  });
});
