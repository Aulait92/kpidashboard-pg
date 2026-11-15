import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Termin verschieben/absagen im Kundenbereich (Dialog statt /book/manage im
// neuen Tab): Berechtigung über die Termin-ID, Dauer bleibt, Lead wird wie beim
// Verschieben über den Lead-Link benachrichtigt. Kalender, Mail, WhatsApp und
// Push sind nachgebildet.
const calls = vi.hoisted(() => ({
  busy: [] as Array<{ start: Date; end: Date }>,
  created: [] as Array<{ start: Date; end: Date }>,
  deleted: [] as string[],
}));
vi.mock("@/lib/calendar/google", () => ({
  googleHasRequiredScopes: () => true,
  googleGetBusy: vi.fn(async () => calls.busy),
  googleCreateEvent: vi.fn(async (_key: string, ev: { start: Date; end: Date }) => {
    calls.created.push({ start: ev.start, end: ev.end });
    return { eventId: `ev-${calls.created.length}`, videoUrl: null };
  }),
  googleDeleteEvent: vi.fn(async (_key: string, id: string) => {
    calls.deleted.push(id);
  }),
  googleGetResponses: vi.fn(async () => []),
}));
vi.mock("@/lib/calendar/lead-email", () => ({ sendLeadEmail: vi.fn(async () => ({ sent: true })) }));
vi.mock("@/lib/lead-progress", () => ({ recordLeadProgress: vi.fn(async () => {}) }));
vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async () => {}),
  sendToAdmins: vi.fn(async () => {}),
}));
vi.mock("@/lib/whatsapp/templates", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/templates")>()),
  sendWhatsAppNotice: vi.fn(async () => ({ mode: "text", conversationId: "x" })),
}));
vi.mock("@/lib/usage", () => ({ recordUsage: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rate-limit", () => ({ checkLimit: () => ({ ok: true }), requestIp: async () => "127.0.0.1" }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
const ctxState = vi.hoisted(() => ({
  ctx: null as null | { customerId: string; email: string; preview: boolean; userId: string | null; teamRole: "owner" | "advisor" },
}));
vi.mock("@/lib/buyer-context", () => ({ getBuyerContext: async () => ctxState.ctx }));

import { prisma } from "@/lib/prisma";
import { sendLeadEmail } from "@/lib/calendar/lead-email";
import { sendWhatsAppNotice } from "@/lib/whatsapp/templates";
import { berlinAt } from "@/lib/calendar/lead-times";
import { addDaysYmd, berlinYmd, weekdayOfYmd } from "@/lib/absence";
import {
  cancelAppointmentBuyerAction,
  loadRescheduleDialog,
  rescheduleAppointmentBuyerAction,
} from "@/app/buyer/appointment-actions";
import { rescheduleManageAction } from "@/app/book/manage/[token]/actions";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const customers: string[] = [];
function workday(n: number): string {
  let d = addDaysYmd(berlinYmd(new Date()), n);
  while (weekdayOfYmd(d) === 0 || weekdayOfYmd(d) === 6) d = addDaysYmd(d, 1);
  return d;
}
const asUser = (customerId: string, u: { id: string; teamRole: string }) => {
  ctxState.ctx = { customerId, email: "x@test.local", preview: false, userId: u.id, teamRole: u.teamRole === "advisor" ? "advisor" : "owner" };
};

/** Kunde mit Kalender, Team (Inhaber + 2 Berater) und einem 45-Minuten-Termin eines Leads von Berater A. */
async function setup() {
  const c = await makeCustomer();
  customers.push(c.id);
  await prisma.calendarConnection.create({ data: { customerId: c.id, provider: "google", status: "connected" } });
  const owner = await makeBuyer(c.id, "owner");
  const a = await makeBuyer(c.id, "advisor");
  const b = await makeBuyer(c.id, "advisor");
  const lead = await prisma.lead.create({ data: { customerId: c.id, name: "Julia Muster", assignedUserId: a.id } });
  const conv = await prisma.conversation.create({
    data: { customerId: c.id, contactPhone: "4915199900042", contactName: "Julia Muster", contactEmail: "julia@test.local", leadId: lead.id },
  });
  const day = workday(2);
  const appt = await prisma.appointment.create({
    data: {
      customerId: c.id,
      leadId: lead.id,
      conversationId: conv.id,
      mode: "phone",
      startsAt: berlinAt(day, "16:00"),
      endsAt: new Date(berlinAt(day, "16:00").getTime() + 45 * 60000),
      status: "booked",
      calendarEventId: "old-1",
      manageToken: `tok_${Math.random().toString(36).slice(2)}`,
    },
  });
  return { customerId: c.id, owner, a, b, lead, conv, appt };
}

beforeAll(() => {
  requireTestDb();
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
});
beforeEach(() => {
  calls.busy = [];
  calls.created.length = 0;
  calls.deleted.length = 0;
  ctxState.ctx = null;
  vi.mocked(sendLeadEmail).mockClear();
  vi.mocked(sendWhatsAppNotice).mockClear();
});
afterAll(async () => {
  for (const id of customers) {
    await prisma.message.deleteMany({ where: { conversation: { customerId: id } } });
    await prisma.appointment.deleteMany({ where: { customerId: id } });
    await prisma.conversation.deleteMany({ where: { customerId: id } });
    await prisma.lead.deleteMany({ where: { customerId: id } });
    await prisma.calendarConnection.deleteMany({ where: { customerId: id } });
    await prisma.user.deleteMany({ where: { customerId: id } });
    await cleanupCustomer(id);
  }
});

describe("Termin verschieben im Kundenbereich: Berechtigung", () => {
  it("fremder Kunde und Berater ohne Zugriff werden abgelehnt, nichts ändert sich", async () => {
    const { appt, b } = await setup();
    const other = await setup();
    const day = workday(4);
    const start = berlinAt(day, "10:00").toISOString();

    // Inhaber eines anderen Kunden
    asUser(other.customerId, other.owner);
    expect(await loadRescheduleDialog(appt.id)).toEqual({ ok: false, error: "Termin nicht gefunden." });
    expect(await rescheduleAppointmentBuyerAction(appt.id, start)).toMatchObject({ ok: false, code: "notfound" });
    expect(await cancelAppointmentBuyerAction(appt.id)).toMatchObject({ ok: false, code: "notfound" });

    // Berater B im selben Team, Lead gehört Berater A
    asUser(appt.customerId, b);
    expect(await loadRescheduleDialog(appt.id)).toMatchObject({ ok: false });
    expect(await rescheduleAppointmentBuyerAction(appt.id, start)).toMatchObject({ ok: false, code: "notfound" });
    expect(await cancelAppointmentBuyerAction(appt.id)).toMatchObject({ ok: false, code: "notfound" });

    // Nicht eingeloggt
    ctxState.ctx = null;
    expect(await rescheduleAppointmentBuyerAction(appt.id, start)).toMatchObject({ ok: false });

    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe("booked");
    expect(calls.created).toHaveLength(0);
    expect(calls.deleted).toHaveLength(0);
    expect(sendLeadEmail).not.toHaveBeenCalled();
    expect(sendWhatsAppNotice).not.toHaveBeenCalled();
  });

  it("Admin-Vorschau: ansehen ja, ändern nein", async () => {
    const { appt, customerId } = await setup();
    ctxState.ctx = { customerId, email: "admin@test.local", preview: true, userId: null, teamRole: "owner" };
    const loaded = await loadRescheduleDialog(appt.id);
    expect(loaded.ok && loaded.data.canEdit).toBe(false);
    const start = berlinAt(workday(4), "10:00").toISOString();
    expect(await rescheduleAppointmentBuyerAction(appt.id, start)).toMatchObject({ ok: false, code: "preview" });
    expect(await cancelAppointmentBuyerAction(appt.id)).toMatchObject({ ok: false, code: "preview" });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe("booked");
  });
});

describe("Termin verschieben im Kundenbereich: Ablauf", () => {
  it("freie Zeiten in der Dauer des Termins (45 Minuten), Kopf mit aktuellem Termin", async () => {
    const { appt, a } = await setup();
    asUser(appt.customerId, a);
    const day = workday(4);
    // 10:30 bis 11:00 belegt: 10:00 ginge mit 30 Minuten, mit 45 nicht
    calls.busy = [{ start: berlinAt(day, "10:30"), end: berlinAt(day, "11:00") }];
    const res = await loadRescheduleDialog(appt.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ id: appt.id, mode: "phone", durationMin: 45, name: "Julia Muster", canEdit: true, notify: { whatsapp: true, email: true } });
    expect(res.data.startsAt).toBe(appt.startsAt.toISOString());
    const starts = res.data.slots.map((s) => s.start);
    expect(starts).not.toContain(berlinAt(day, "10:00").toISOString());
    expect(starts).toContain(berlinAt(day, "14:00").toISOString());
    for (const s of res.data.slots) expect((new Date(s.end).getTime() - new Date(s.start).getTime()) / 60000).toBe(45);
    // Mehr als ein paar Tage zum Blättern (nicht nur die ersten 24 Zeiten)
    expect(new Set(res.data.slots.map((s) => berlinYmd(new Date(s.start)))).size).toBeGreaterThan(8);
  });

  it("zuständiger Berater verschiebt: neue Zeit, Dauer bleibt, Lead per Mail und WhatsApp benachrichtigt", async () => {
    const { appt, a, conv } = await setup();
    asUser(appt.customerId, a);
    const start = berlinAt(workday(4), "14:00").toISOString();
    const res = await rescheduleAppointmentBuyerAction(appt.id, start);
    expect(res).toEqual({ ok: true, start });

    const old = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(old.status).toBe("cancelled");
    expect(old.cancelledBy).toBe("team");
    const fresh = await prisma.appointment.findFirstOrThrow({ where: { leadId: appt.leadId, status: "booked" } });
    expect(fresh.startsAt.toISOString()).toBe(start);
    expect((fresh.endsAt!.getTime() - fresh.startsAt.getTime()) / 60000).toBe(45);
    expect(fresh.conversationId).toBe(conv.id);
    expect(fresh.manageToken).not.toBe(appt.manageToken);
    // Kalender: neuer Eintrag (45 Min.), alter gelöscht
    expect(calls.created).toHaveLength(1);
    expect((calls.created[0].end.getTime() - calls.created[0].start.getTime()) / 60000).toBe(45);
    expect(calls.deleted).toEqual(["old-1"]);
    // Lead: Mail „verschoben“ (keine Absage-Mail), WhatsApp mit neuer Zeit und Link
    expect(vi.mocked(sendLeadEmail).mock.calls.map((c) => c[1])).toEqual(["rescheduled"]);
    expect(sendWhatsAppNotice).toHaveBeenCalledTimes(1);
    const wa = vi.mocked(sendWhatsAppNotice).mock.calls[0][0];
    expect(wa.to).toBe(conv.contactPhone);
    // WhatsApp: Verschieben per Chat statt Link (Ole, 15.11.2026); der Link bleibt in der E-Mail
    expect(wa.text).not.toMatch(/\/book\/manage\//);
    expect(wa.text).toMatch(/antworten Sie einfach hier/);
    // Im Chat vermerkt
    const note = await prisma.message.findFirstOrThrow({ where: { conversationId: conv.id, kind: "appointment_rescheduled" } });
    expect(note.sentBy).toBe("team");
    expect(note.sentByUserId).toBe(a.id);
    expect(JSON.parse(note.body ?? "{}")).toMatchObject({ von: appt.startsAt.toISOString(), auf: start, via: "kundenbereich" });

    // Der alte Termin lässt sich danach nicht noch einmal verschieben
    expect(await rescheduleAppointmentBuyerAction(appt.id, start)).toMatchObject({ ok: false, code: "closed" });
  });

  it("belegte Zeit: „taken“, Termin bleibt wie er war", async () => {
    const { appt, owner } = await setup();
    asUser(appt.customerId, owner);
    const day = workday(4);
    calls.busy = [{ start: berlinAt(day, "14:00"), end: berlinAt(day, "15:00") }];
    const res = await rescheduleAppointmentBuyerAction(appt.id, berlinAt(day, "14:00").toISOString());
    expect(res).toMatchObject({ ok: false, code: "taken" });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe("booked");
    expect(sendWhatsAppNotice).not.toHaveBeenCalled();
  });

  it("Inhaber sagt ab: Kalendereintrag gelöscht, Lead bekommt die Absage", async () => {
    const { appt, owner, conv } = await setup();
    asUser(appt.customerId, owner);
    expect(await cancelAppointmentBuyerAction(appt.id)).toEqual({ ok: true });
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(row.status).toBe("cancelled");
    expect(row.cancelledBy).toBe("team");
    expect(calls.deleted).toEqual(["old-1"]);
    expect(vi.mocked(sendLeadEmail).mock.calls.map((c) => c[1])).toEqual(["cancelled"]);
    expect(await prisma.message.count({ where: { conversationId: conv.id, kind: "appointment_cancelled" } })).toBe(1);
  });
});

describe("Lead-Link /book/manage bleibt funktionsfähig", () => {
  it("Lead verschiebt über den Link: gleicher Ablauf, Weiterleitung auf den neuen Link", async () => {
    const { appt } = await setup();
    const start = berlinAt(workday(4), "10:00").toISOString();
    const fd = new FormData();
    fd.set("start", start);
    const err = await rescheduleManageAction(appt.manageToken!, fd).catch((e: { url?: string }) => e);
    const fresh = await prisma.appointment.findFirstOrThrow({ where: { leadId: appt.leadId, status: "booked" } });
    expect((err as { url?: string }).url).toBe(`/book/manage/${fresh.manageToken}?done=rescheduled`);
    expect((fresh.endsAt!.getTime() - fresh.startsAt.getTime()) / 60000).toBe(45);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).cancelledBy).toBe("lead");
    expect(vi.mocked(sendLeadEmail).mock.calls.map((c) => c[1])).toEqual(["rescheduled"]);
    expect(sendWhatsAppNotice).toHaveBeenCalledTimes(1);
  });
});
