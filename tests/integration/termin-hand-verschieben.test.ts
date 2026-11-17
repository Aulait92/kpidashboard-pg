// Von Hand eingetragenen Termin verschieben (Nacht-QA 17.11.2026): ohne Kalender gab es im Dialog keinen Weg.
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";
import { createManualAppointment, rescheduleManualAppointment } from "@/lib/lead-manual";

requireTestDb();
const ids: string[] = [];
afterAll(async () => {
  for (const id of ids) await cleanupCustomer(id);
});

describe("Termin von Hand verschieben", () => {
  it("verschiebt Start und Ende, Dauer bleibt, Verlauf am Lead; Kalendertermine und Vergangenheit nicht", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    const lead = await prisma.lead.create({ data: { customerId: c.id, name: "Katrin Vogel", status: "Neuer Lead" } });
    const now = new Date("2026-11-17T09:00:00Z");
    const a = await createManualAppointment({ leadId: lead.id, customerId: c.id, userId: null, date: "2026-11-18", time: "11:00", mode: "video", durationMin: 45, now });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const r = await rescheduleManualAppointment({ appointmentId: a.appointmentId, customerId: c.id, userId: null, date: "2026-11-19", time: "14:30", now });
    expect(r).toMatchObject({ ok: true });
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: a.appointmentId } });
    expect(appt.startsAt.toISOString()).toBe("2026-11-19T13:30:00.000Z");
    expect(appt.endsAt!.getTime() - appt.startsAt.getTime()).toBe(45 * 60_000);
    expect(appt.status).toBe("booked");
    const h = await prisma.leadHistory.findFirst({ where: { leadId: lead.id, text: { startsWith: "Termin verschoben" } } });
    expect(h?.text).toMatch(/auf Do\., 19\.11\., 14:30 Uhr/);

    expect(await rescheduleManualAppointment({ appointmentId: a.appointmentId, customerId: c.id, userId: null, date: "2026-11-16", time: "10:00", now })).toMatchObject({ ok: false });
    // anderer Kunde
    expect(await rescheduleManualAppointment({ appointmentId: a.appointmentId, customerId: "fremd", userId: null, date: "2026-11-20", time: "10:00", now })).toMatchObject({ ok: false });
    // Termin aus dem Kalender: nur über freie Zeiten
    await prisma.appointment.update({ where: { id: a.appointmentId }, data: { calendarKey: "agency" } });
    expect(await rescheduleManualAppointment({ appointmentId: a.appointmentId, customerId: c.id, userId: null, date: "2026-11-20", time: "10:00", now })).toMatchObject({ ok: false });
  });
});
