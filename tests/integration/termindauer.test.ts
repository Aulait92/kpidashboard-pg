import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Termindauer je Kalender (15/30/45/60): Speichern, freie Slots und Buchung.
const calls = vi.hoisted(() => ({
  busy: [] as Array<{ start: Date; end: Date }>,
  created: [] as Array<{ start: Date; end: Date }>,
}));
vi.mock("@/lib/calendar/google", () => ({
  googleHasRequiredScopes: () => true,
  googleGetBusy: vi.fn(async () => calls.busy),
  googleCreateEvent: vi.fn(async (_key: string, ev: { start: Date; end: Date }) => {
    calls.created.push({ start: ev.start, end: ev.end });
    return { eventId: `ev-${calls.created.length}`, videoUrl: null };
  }),
  googleDeleteEvent: vi.fn(async () => {}),
  googleGetResponses: vi.fn(async () => []),
}));
vi.mock("@/lib/calendar/lead-email", () => ({ sendLeadEmail: vi.fn(async () => ({ sent: true })) }));
vi.mock("@/lib/lead-progress", () => ({ recordLeadProgress: vi.fn(async () => {}) }));
vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async () => {}),
  sendToAdmins: vi.fn(async () => {}),
}));

import { prisma } from "@/lib/prisma";
import { bookAppointment, bookingDurationMin, suggestSlots } from "@/lib/calendar";
import { updateLeadTimes } from "@/lib/calendar/sources";
import { berlinAt, loadLeadTimes } from "@/lib/calendar/lead-times";
import { addDaysYmd, berlinYmd, weekdayOfYmd } from "@/lib/absence";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const customers: string[] = [];
function workday(n: number): string {
  let d = addDaysYmd(berlinYmd(new Date()), n);
  while (weekdayOfYmd(d) === 0 || weekdayOfYmd(d) === 6) d = addDaysYmd(d, 1);
  return d;
}
async function setup() {
  const c = await makeCustomer();
  customers.push(c.id);
  await prisma.calendarConnection.create({ data: { customerId: c.id, provider: "google", status: "connected" } });
  return c.id;
}
function leadTimesForm(day: string, times: string[], duration: string) {
  const fd = new FormData();
  fd.set(`day_${weekdayOfYmd(day)}`, "on");
  for (const t of times) fd.set(`time_${t}`, "on");
  fd.set("duration", duration);
  return fd;
}

beforeAll(() => {
  requireTestDb();
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
});
beforeEach(() => {
  calls.busy = [];
  calls.created.length = 0;
});
afterAll(async () => {
  for (const id of customers) {
    await prisma.appointment.deleteMany({ where: { customerId: id } });
    await prisma.calendarConnection.deleteMany({ where: { customerId: id } });
    await cleanupCustomer(id);
  }
});

describe("Termindauer", () => {
  it("ohne Einstellung 30 Minuten; ungültige Dauer wird zu 30", async () => {
    const id = await setup();
    expect(await bookingDurationMin(id)).toBe(30);
    const d = workday(3);
    expect((await updateLeadTimes(id, id, leadTimesForm(d, ["10:00"], "50"))).ok).toBe(true);
    expect((await loadLeadTimes(id)).durationMin).toBe(30);
  });

  it("45 Minuten: gespeichert, Slots berücksichtigen die Dauer, Buchung dauert 45 Minuten", async () => {
    const id = await setup();
    const d = workday(3);
    expect((await updateLeadTimes(id, id, leadTimesForm(d, ["10:00", "13:00"], "45"))).ok).toBe(true);
    expect((await loadLeadTimes(id)).durationMin).toBe(45);
    expect(await bookingDurationMin(id)).toBe(45);

    // 10:30–11:00 belegt: 10:00 mit 30 Min. passt, mit 45 Min. nicht mehr
    calls.busy = [{ start: berlinAt(d, "10:30"), end: berlinAt(d, "11:00") }];
    const from = berlinAt(d, "00:00");
    const with30 = (await suggestSlots(id, 30, 5, "lead", 1, null, from)).map((s) => s.start);
    const with45 = (await suggestSlots(id, 45, 5, "lead", 1, null, from)).map((s) => s.start);
    expect(with30).toContain(berlinAt(d, "10:00").toISOString());
    expect(with45).not.toContain(berlinAt(d, "10:00").toISOString());
    expect(with45).toContain(berlinAt(d, "13:00").toISOString());

    calls.busy = [];
    const res = await bookAppointment({ customerId: id, start: berlinAt(d, "13:00").toISOString(), mode: "phone", summary: "Test", notifyLead: false });
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: res.appointmentId } });
    expect((appt.endsAt!.getTime() - appt.startsAt.getTime()) / 60000).toBe(45);
    expect((calls.created[0].end.getTime() - calls.created[0].start.getTime()) / 60000).toBe(45);
  });
});
