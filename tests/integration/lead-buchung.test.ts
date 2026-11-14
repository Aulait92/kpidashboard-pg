// Termin für einen Lead im Fenster der App buchen (Ole, 14.11.2026): gleiche Slots und Buchung wie /book.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ created: 0 }));
vi.mock("@/lib/calendar/google", () => ({
  googleHasRequiredScopes: () => true,
  googleGetBusy: vi.fn(async () => []),
  googleCreateEvent: vi.fn(async () => {
    calls.created++;
    return { eventId: `ev-${calls.created}`, videoUrl: null };
  }),
  googleDeleteEvent: vi.fn(async () => {}),
  googleGetResponses: vi.fn(async () => []),
}));
vi.mock("@/lib/calendar/lead-email", () => ({ sendLeadEmail: vi.fn(async () => ({ sent: true })) }));
const confirmations: string[] = [];
vi.mock("@/lib/whatsapp/reminders", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/reminders")>()),
  sendBookingConfirmation: vi.fn(async (o: { to: string }) => {
    confirmations.push(o.to);
  }),
}));
vi.mock("@/lib/push", () => ({ sendToUser: vi.fn(async () => {}), sendToBuyersOfCustomer: vi.fn(async () => {}), sendToAdmins: vi.fn(async () => {}) }));

import { prisma } from "@/lib/prisma";
import { bookForLead, leadSlots } from "@/lib/lead-buchung";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

let customerId = "";

describe("Termin buchen im Fenster", () => {
  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    customerId = (await makeCustomer()).id;
  });
  afterAll(() => cleanupCustomer(customerId));

  it("ohne Kalender: Hinweis statt Zeiten", async () => {
    const lead = await prisma.lead.create({ data: { customerId, name: "Ohne Kalender" } });
    expect(await leadSlots(customerId, lead.id)).toMatchObject({ ok: false, reason: "no_calendar" });
  });

  it("zeigt freie Zeiten, bucht, setzt „Termin vereinbart“, bestätigt per WhatsApp, kein zweiter Termin", async () => {
    await prisma.calendarConnection.create({ data: { customerId, provider: "google", status: "connected" } });
    const lead = await prisma.lead.create({ data: { customerId, name: "Lena Buchung", phone: "4917600000301", email: "lena@example.test", status: "Neuer Lead" } });
    const s = await leadSlots(customerId, lead.id);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(s.slots.length).toBeGreaterThan(0);
    const r = await bookForLead({ customerId, leadId: lead.id, start: s.slots[0].start, mode: "phone", userId: null });
    expect(r).toMatchObject({ ok: true });
    const appt = await prisma.appointment.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(appt).toMatchObject({ status: "booked", mode: "phone" });
    expect(appt.conversationId).not.toBeNull();
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("In Beratung");
    expect(confirmations).toContain("4917600000301");
    expect(calls.created).toBeGreaterThan(0);
    expect((await prisma.leadHistory.findFirstOrThrow({ where: { leadId: lead.id } })).text).toMatch(/^Termin gebucht: .*Telefonat$/);
    expect(await bookForLead({ customerId, leadId: lead.id, start: s.slots[1]?.start ?? s.slots[0].start, mode: "video", userId: null })).toMatchObject({ ok: false });
  });
});
