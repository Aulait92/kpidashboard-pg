import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Kalender, Mails, WhatsApp und Push werden nachgebildet – geprüft wird die
// Logik: Verteilung, Slots, Verschieben, Übergeben, Aufgaben, Rechte.
const calls = vi.hoisted(() => ({ created: [] as Array<{ key: string; start: Date }>, deleted: [] as string[], busy: new Map<string, Array<{ start: Date; end: Date }>>() }));
vi.mock("@/lib/calendar/google", () => ({
  googleHasRequiredScopes: () => true,
  googleGetBusy: vi.fn(async (key: string) => calls.busy.get(key) ?? []),
  googleCreateEvent: vi.fn(async (key: string, ev: { start: Date }) => {
    calls.created.push({ key, start: ev.start });
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

import { prisma } from "@/lib/prisma";
import { assignLead } from "@/lib/team";
import { bookAppointment, SlotBusyError, suggestSlots } from "@/lib/calendar";
import { sendLeadEmail } from "@/lib/calendar/lead-email";
import { sendWhatsAppNotice } from "@/lib/whatsapp/templates";
import { addDaysYmd, berlinMidnight, berlinYmd, returnDayYmd, weekdayOfYmd } from "@/lib/absence";
import {
  AbsenceError,
  endAbsence,
  handoverToSubstitute,
  rescheduleAfterAbsence,
  saveAbsence,
  undoTaskMoves,
  type AbsenceActor,
} from "@/lib/absence-flow";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const HOUR = 60 * 60 * 1000;
const today = berlinYmd(new Date());
/** Nächster Werktag ab (einschließlich) n Tagen. */
function workday(n: number): string {
  let d = addDaysYmd(today, n);
  while (weekdayOfYmd(d) === 0 || weekdayOfYmd(d) === 6) d = addDaysYmd(d, 1);
  return d;
}
const at = (ymd: string, hour: number) => new Date(berlinMidnight(ymd).getTime() + hour * HOUR);

const customers: string[] = [];
afterAll(async () => {
  for (const id of customers) {
    await prisma.userAbsence.deleteMany({ where: { customerId: id } });
    await prisma.appointment.deleteMany({ where: { customerId: id } });
    await prisma.conversation.deleteMany({ where: { customerId: id } });
    await prisma.lead.deleteMany({ where: { customerId: id } });
    await prisma.calendarConnection.deleteMany({ where: { customerId: id } });
    await prisma.user.deleteMany({ where: { customerId: id } });
    await cleanupCustomer(id);
  }
});
beforeAll(() => requireTestDb());
beforeEach(() => {
  calls.created.length = 0;
  calls.deleted.length = 0;
  calls.busy.clear();
  vi.mocked(sendLeadEmail).mockClear();
  vi.mocked(sendWhatsAppNotice).mockClear();
});

async function setup(advisors: number) {
  const c = await makeCustomer();
  customers.push(c.id);
  await prisma.calendarConnection.create({ data: { customerId: c.id, provider: "google", status: "connected" } });
  const owner = await makeBuyer(c.id, "owner");
  const team = [];
  for (let i = 0; i < advisors; i++) team.push(await makeBuyer(c.id, "advisor"));
  const actorOf = (u: { id: string; teamRole: string }, extra: Partial<AbsenceActor> = {}): AbsenceActor => ({
    customerId: c.id,
    userId: u.id,
    teamRole: u.teamRole === "advisor" ? "advisor" : "owner",
    preview: false,
    ...extra,
  });
  return { customerId: c.id, owner, team, actorOf };
}

describe("Abwesenheit: Lead-Verteilung", () => {
  it("überspringt Abwesende, ohne „bekommt Leads“ zu ändern", async () => {
    const { customerId, owner, team, actorOf } = await setup(2);
    const [a] = team;
    const saved = await saveAbsence(actorOf(a), { userId: a.id, from: today, to: addDaysYmd(today, 3), kind: "krank" });
    for (let i = 0; i < 6; i++) {
      const lead = await prisma.lead.create({ data: { customerId, name: `L${i}` } });
      expect(await assignLead(lead.id)).not.toBe(a.id);
    }
    expect((await prisma.user.findUnique({ where: { id: a.id } }))!.receivesLeads).toBe(true);
    // Beenden → bekommt wieder Leads
    await endAbsence(actorOf(owner), saved.absence.id);
    const got = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const lead = await prisma.lead.create({ data: { customerId, name: `M${i}` } });
      got.add((await assignLead(lead.id))!);
    }
    expect(got.has(a.id)).toBe(true);
  });
});

describe("Abwesenheit: Einzel-Vertreter, Termine", () => {
  it("Slots erst ab Rückkehrtag; Buchung im Zeitraum wird abgelehnt", async () => {
    const { owner, customerId, actorOf } = await setup(0);
    const saved = await saveAbsence(actorOf(owner), { userId: owner.id, from: today, to: addDaysYmd(today, 4), kind: "urlaub" });
    const back = saved.absence.returnDay;
    const slots = await suggestSlots(customerId);
    expect(slots.length).toBe(3);
    for (const s of slots) expect(berlinYmd(new Date(s.start)) >= back).toBe(true);
    await expect(
      bookAppointment({ customerId, start: at(addDaysYmd(today, 2), 10).toISOString(), mode: "phone", summary: "x", notifyLead: false }),
    ).rejects.toBeInstanceOf(SlotBusyError);
  });

  it("2 Termine im Zeitraum: „Alle verschieben“ informiert die Leads; Aufgaben rücken auf den Rückkehrtag", async () => {
    const { owner, customerId, actorOf } = await setup(0);
    const from = workday(1);
    const to = addDaysYmd(from, 6);
    const appts = [];
    for (const [i, day] of [addDaysYmd(from, 1), addDaysYmd(from, 2)].entries()) {
      const lead = await prisma.lead.create({ data: { customerId, name: `Kontakt ${i}` } });
      const conv = await prisma.conversation.create({ data: { customerId, contactPhone: `49151000000${i}`, contactName: `Kontakt ${i}`, leadId: lead.id } });
      appts.push(
        await prisma.appointment.create({
          data: { customerId, leadId: lead.id, conversationId: conv.id, mode: "phone", startsAt: at(day, 10), endsAt: at(day, 10.5), status: "booked", calendarEventId: `old-${i}` },
        }),
      );
    }
    const task = await prisma.lead.create({ data: { customerId, name: "Wiedervorlage", followUpAt: at(addDaysYmd(from, 3), 9) } });
    const later = await prisma.lead.create({ data: { customerId, name: "Später", followUpAt: at(addDaysYmd(to, 10), 9) } });

    const saved = await saveAbsence(actorOf(owner), { userId: owner.id, from, to, kind: "urlaub" });
    expect(saved.appointments.map((x) => x.id).sort()).toEqual(appts.map((x) => x.id).sort());
    expect(saved.tasks).toEqual({ moved: 1, transferred: 0 });
    expect(saved.pauseHint).toEqual({ from, until: returnDayYmd({ endsAt: berlinMidnight(addDaysYmd(to, 1)) }) });
    const back = saved.absence.returnDay;
    expect((await prisma.lead.findUnique({ where: { id: task.id } }))!.followUpAt!.toISOString()).toBe(at(back, 8).toISOString());
    expect((await prisma.lead.findUnique({ where: { id: later.id } }))!.followUpAt!.toISOString()).toBe(at(addDaysYmd(to, 10), 9).toISOString());

    const res = await rescheduleAfterAbsence(actorOf(owner), saved.absence.id, null);
    expect(res.failed).toEqual([]);
    expect(res.moved).toHaveLength(2);
    const starts = res.moved.map((m) => m.newStart);
    expect(new Set(starts).size).toBe(2);
    for (const s of starts) expect(berlinYmd(new Date(s)) >= back).toBe(true);
    // gleiche Uhrzeit (10 Uhr) am Rückkehrtag bevorzugt
    expect(starts).toContain(at(back, 10).toISOString());
    // alte Termine abgesagt, Leads informiert (Mail „verschoben“ + WhatsApp mit Link)
    const old = await prisma.appointment.findMany({ where: { id: { in: appts.map((x) => x.id) } } });
    expect(old.every((o) => o.status === "cancelled")).toBe(true);
    expect(vi.mocked(sendLeadEmail).mock.calls.filter((c) => c[1] === "rescheduled")).toHaveLength(2);
    expect(vi.mocked(sendLeadEmail).mock.calls.filter((c) => c[1] === "cancelled")).toHaveLength(0);
    expect(sendWhatsAppNotice).toHaveBeenCalledTimes(2);
    const text = vi.mocked(sendWhatsAppNotice).mock.calls[0][0].text;
    expect(text).toMatch(/verschieben/);
    expect(text).toMatch(/\/book\/manage\//);
    expect(text).not.toMatch(/Urlaub|krank/i);

    // Aufgaben-Verschiebung rückgängig
    expect(await undoTaskMoves(actorOf(owner), saved.absence.id)).toBe(1);
    expect((await prisma.lead.findUnique({ where: { id: task.id } }))!.followUpAt!.toISOString()).toBe(at(addDaysYmd(from, 3), 9).toISOString());
  });
});

describe("Abwesenheit: Team mit Vertretung", () => {
  it("übergibt Termine und Aufgaben an die Vertretung", async () => {
    const { owner, team, customerId, actorOf } = await setup(2);
    const [a, b] = team;
    const from = workday(1);
    const lead = await prisma.lead.create({ data: { customerId, name: "Kunde A", assignedUserId: a.id, followUpAt: at(addDaysYmd(from, 1), 9) } });
    const appt = await prisma.appointment.create({
      data: { customerId, leadId: lead.id, mode: "video", startsAt: at(addDaysYmd(from, 2), 14), endsAt: at(addDaysYmd(from, 2), 14.5), status: "booked" },
    });
    const other = await prisma.lead.create({ data: { customerId, name: "Kunde B", assignedUserId: a.id, followUpAt: at(addDaysYmd(from, 1), 9) } });
    const foreign = await prisma.lead.create({ data: { customerId, name: "Kunde C", assignedUserId: owner.id, followUpAt: at(addDaysYmd(from, 1), 9) } });

    const saved = await saveAbsence(actorOf(owner), { userId: a.id, from, to: addDaysYmd(from, 4), kind: "sonstiges", substituteUserId: b.id });
    // Lead mit Termin: entscheidet die Termin-Liste (Aufgabe rückt zeitlich), anderer geht an B
    expect(saved.tasks).toEqual({ moved: 1, transferred: 1 });
    expect(saved.pauseHint).toBeNull(); // Team: kein Pause-Hinweis
    expect(saved.appointments).toHaveLength(1);
    expect(saved.appointments[0].canHandover).toBe(true);
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))!.assignedUserId).toBe(a.id);
    expect((await prisma.lead.findUnique({ where: { id: other.id } }))!.assignedUserId).toBe(b.id);
    expect((await prisma.lead.findUnique({ where: { id: foreign.id } }))!.assignedUserId).toBe(owner.id);

    // Termin übergeben: gleicher Termin (Agentur-Kalender), Lead wechselt zur Vertretung
    const res = await handoverToSubstitute(actorOf(owner), saved.absence.id, null);
    expect(res).toEqual({ handedOver: [appt.id], failed: [] });
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))!.assignedUserId).toBe(b.id);
    expect((await prisma.appointment.findUnique({ where: { id: appt.id } }))!.status).toBe("booked");
    expect(sendLeadEmail).not.toHaveBeenCalled();

    // Rückgängig: übertragene Aufgabe wieder bei A, die Termin-Übergabe bleibt
    await undoTaskMoves(actorOf(owner), saved.absence.id);
    expect((await prisma.lead.findUnique({ where: { id: other.id } }))!.assignedUserId).toBe(a.id);
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))!.assignedUserId).toBe(b.id);
  });

  it("Vertretung selbst abwesend → Übergabe wird nicht angeboten", async () => {
    const { owner, team, customerId, actorOf } = await setup(2);
    const [a, b] = team;
    const from = workday(1);
    const lead = await prisma.lead.create({ data: { customerId, name: "Kunde", assignedUserId: a.id } });
    await prisma.appointment.create({
      data: { customerId, leadId: lead.id, mode: "phone", startsAt: at(addDaysYmd(from, 1), 10), endsAt: at(addDaysYmd(from, 1), 10.5), status: "booked" },
    });
    await saveAbsence(actorOf(b), { userId: b.id, from, to: addDaysYmd(from, 3), kind: "urlaub" });
    const saved = await saveAbsence(actorOf(owner), { userId: a.id, from, to: addDaysYmd(from, 3), kind: "krank", substituteUserId: b.id });
    expect(saved.appointments[0].canHandover).toBe(false);
  });
});

describe("Abwesenheit: Rechte", () => {
  it("jeder für sich, Inhaber fürs Team, Vorschau nur lesend", async () => {
    const { owner, team, customerId, actorOf } = await setup(2);
    const [a, b] = team;
    const input = { userId: a.id, from: workday(2), to: addDaysYmd(workday(2), 1), kind: "urlaub" };
    await expect(saveAbsence(actorOf(b), input)).rejects.toBeInstanceOf(AbsenceError);
    await expect(saveAbsence({ customerId, userId: null, teamRole: "owner", preview: true }, input)).rejects.toBeInstanceOf(AbsenceError);
    const mine = await saveAbsence(actorOf(a), input);
    await expect(endAbsence(actorOf(b), mine.absence.id)).rejects.toBeInstanceOf(AbsenceError);
    // fremder Kunde sieht nichts
    const other = await setup(0);
    await expect(endAbsence(other.actorOf(other.owner), mine.absence.id)).rejects.toBeInstanceOf(AbsenceError);
    // Inhaber darf ändern; überlappend wird abgelehnt
    await expect(saveAbsence(actorOf(owner), input)).rejects.toThrow(/schon eine Abwesenheit/);
    const changed = await saveAbsence(actorOf(owner), { ...input, absenceId: mine.absence.id, kind: "sonstiges" });
    expect(changed.absence.kind).toBe("sonstiges");
    // noch nicht begonnen → beenden löscht
    await endAbsence(actorOf(owner), mine.absence.id);
    expect(await prisma.userAbsence.count({ where: { id: mine.absence.id } })).toBe(0);
    const log = await prisma.auditLog.findMany({ where: { customerId, action: { startsWith: "absence." } } });
    expect(log.map((l) => l.action).sort()).toEqual(["absence.change", "absence.create", "absence.end"]);
  });

  it("Start in der Vergangenheit und Ende vor Start werden abgelehnt", async () => {
    const { owner, actorOf } = await setup(0);
    await expect(saveAbsence(actorOf(owner), { userId: owner.id, from: addDaysYmd(today, -1), to: today, kind: "urlaub" })).rejects.toThrow(/frühestens heute/);
    await expect(saveAbsence(actorOf(owner), { userId: owner.id, from: today, to: addDaysYmd(today, -1), kind: "urlaub" })).rejects.toThrow();
    await expect(saveAbsence(actorOf(owner), { userId: owner.id, from: today, to: today, kind: "Grippe" })).rejects.toThrow(/Grund/);
  });
});
