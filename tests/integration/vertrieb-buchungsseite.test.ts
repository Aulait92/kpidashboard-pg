import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Eigene Buchungsseite für Vertriebstermine (/termin): Kontakt anlegen bzw. zuordnen (E-Mail, Telefon),
// keine Doppelbuchung (Kalender und gleichzeitige Buchungen), verschieben, absagen, Erinnerungen.
// Kalender (Google), Push, Mail und WhatsApp sind nachgebildet.
const calls = vi.hoisted(() => ({
  busy: [] as Array<{ start: Date; end: Date }>,
  created: [] as Array<{ start: Date; end: Date; attendeeEmails: string[]; video: boolean }>,
  deleted: [] as string[],
  mails: [] as Array<{ to: string; subject: string }>,
  pushes: [] as string[],
  whatsapp: [] as string[],
}));
vi.mock("@/lib/calendar/google", () => ({
  googleHasRequiredScopes: () => true,
  googleGetBusy: vi.fn(async () => calls.busy),
  googleCreateEvent: vi.fn(async (_key: string, ev: { start: Date; end: Date; attendeeEmails: string[]; video: boolean }) => {
    calls.created.push(ev);
    return { eventId: `ev-${calls.created.length}`, videoUrl: `https://meet.google.com/abc-${calls.created.length}` };
  }),
  googleDeleteEvent: vi.fn(async (_key: string, id: string) => {
    calls.deleted.push(id);
  }),
  googleGetResponses: vi.fn(async () => ({ gone: false, responses: new Map() })),
}));
vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async () => {}),
  sendToAdmins: vi.fn(async (p: { title: string }) => {
    calls.pushes.push(p.title);
    return { sent: 1, removed: 0, errors: [] };
  }),
}));
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendCustomerMail: vi.fn(async (o: { to: string; subject: string }) => {
    calls.mails.push({ to: o.to, subject: o.subject });
    return { ok: true };
  }),
}));
vi.mock("@/lib/vertrieb/termin-whatsapp", async (orig) => ({
  ...(await orig<typeof import("@/lib/vertrieb/termin-whatsapp")>()),
  sendTerminConfirmation: vi.fn(async (id: string) => {
    calls.whatsapp.push(id);
    return "sent";
  }),
}));
vi.mock("@/lib/vertrieb/address-enrich", () => ({ scheduleAddressEnrichment: vi.fn(async () => {}) }));

import { prisma } from "@/lib/prisma";
import { berlinAt } from "@/lib/calendar/lead-times";
import { addDaysYmd, berlinYmd } from "@/lib/absence";
import {
  bookSalesMeeting,
  recordPreparation,
  signContactToken,
  verifyContactToken,
  cancelSalesMeeting,
  loadBookingType,
  availableSlots,
  rescheduleSalesMeeting,
  runSalesBookingReminders,
  VERTRIEB_CUSTOMER_ID,
  type BookingInput,
} from "@/lib/vertrieb/buchung";
import { requireTestDb } from "./db";
import type { SalesBookingType } from "@/generated/prisma/client";

const DOMAIN = "buchung-termin.test";
const input = (n: string, extra: Partial<BookingInput> = {}): BookingInput => ({
  name: `Petra ${n}`,
  email: `petra.${n}@${DOMAIN}`,
  phone: "4915112345" + String(Math.floor(Math.random() * 900) + 100),
  company: `Agentur ${n}`,
  role: "vertreter",
  interest: "Private Krankenversicherung",
  message: null,
  ...extra,
});

let type: SalesBookingType;
const day = addDaysYmd(berlinYmd(new Date()), 3);
const at = (hhmm: string, plusDays = 0) => berlinAt(addDaysYmd(day, plusDays), hhmm);

async function cleanup() {
  await prisma.salesContact.deleteMany({ where: { OR: [{ email: { endsWith: `@${DOMAIN}` } }, { description: "buchung-termin-test" }] } });
}

describe("Vertrieb: eigene Buchungsseite", () => {
  beforeAll(async () => {
    requireTestDb();
    await cleanup();
    await prisma.customer.upsert({ where: { id: VERTRIEB_CUSTOMER_ID }, create: { id: VERTRIEB_CUSTOMER_ID, name: "performancegrowth Vertrieb", plan: "internal" }, update: {} });
    await prisma.calendarConnection.upsert({
      where: { customerId: VERTRIEB_CUSTOMER_ID },
      create: { customerId: VERTRIEB_CUSTOMER_ID, provider: "google", status: "connected", accessTokenEnc: "x", scope: "calendar" },
      update: { provider: "google", status: "connected" },
    });
    const days = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, [["08:00", "18:00"]]]));
    await prisma.calendarLeadTimes.upsert({
      where: { calendarKey: VERTRIEB_CUSTOMER_ID },
      create: { calendarKey: VERTRIEB_CUSTOMER_ID, customerId: VERTRIEB_CUSTOMER_ID, weekdays: [0, 1, 2, 3, 4, 5, 6], times: ["08:00"], durationMin: 45, schedule: { step: 60, days } },
      update: { weekdays: [0, 1, 2, 3, 4, 5, 6], durationMin: 45, schedule: { step: 60, days } },
    });
    type = (await loadBookingType(null))!;
    expect(type).toMatchObject({ slug: "meta-leads-call", title: "Meta-Leads-Call mit Ole Kannapinn", durationMin: 45, mode: "video", thanksPage: true });
  });

  beforeEach(() => {
    calls.busy = [];
    calls.created = [];
    calls.deleted = [];
    calls.mails = [];
    calls.pushes = [];
    calls.whatsapp = [];
  });

  afterAll(async () => {
    await cleanup();
    await prisma.calendarLeadTimes.deleteMany({ where: { calendarKey: VERTRIEB_CUSTOMER_ID } });
    await prisma.calendarConnection.deleteMany({ where: { customerId: VERTRIEB_CUSTOMER_ID } });
  });

  it("neue Buchung legt Kontakt an: Stufe Termin, Aufgabe, Kalendereinladung mit Meet-Link, Push, Mail, WhatsApp", async () => {
    const res = await bookSalesMeeting({ type, start: at("10:00"), input: input("neu", { role: "makler", message: "Bitte mit Fokus PKV" }) });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const m = await prisma.salesMeeting.findUniqueOrThrow({ where: { id: res.meetingId }, include: { contact: true } });
    expect(m).toMatchObject({ status: "GEPLANT", title: "Meta-Leads-Call mit Ole Kannapinn", calendarKey: VERTRIEB_CUSTOMER_ID, calendarEventId: "ev-1", joinUrl: "https://meet.google.com/abc-1" });
    expect(m.endAt!.getTime() - m.startAt.getTime()).toBe(45 * 60000);
    expect(m.consentAt).not.toBeNull();
    expect(m.answers).toContain("Vertreter oder Makler: Makler");
    expect(m.answers).toContain("Nachricht: Bitte mit Fokus PKV");
    expect(m.contact).toMatchObject({ stage: "TERMIN", email: `petra.neu@${DOMAIN}`, name: "Agentur neu", firstName: "Petra", lastName: "neu", insurer: "Makler" });
    expect(m.contact.phone).toMatch(/^\+49151/);
    const task = await prisma.salesTask.findUniqueOrThrow({ where: { id: m.taskId! } });
    expect(task).toMatchObject({ type: "TERMIN", title: "Termin: Meta-Leads-Call mit Ole Kannapinn" });
    expect(calls.created[0]).toMatchObject({ attendeeEmails: [`petra.neu@${DOMAIN}`], video: true });
    expect(calls.pushes[0]).toContain("Neue Meta-Leads-Call");
    expect(calls.mails[0]).toMatchObject({ to: `petra.neu@${DOMAIN}` });
    expect(calls.mails[0].subject).toContain("Ihr Termin mit performancegrowth");
    expect(calls.whatsapp).toEqual([res.meetingId]);
  });

  it("ordnet über E-Mail und über Telefon (andere Schreibweise) einem bestehenden Kontakt zu, nie nur über den Vornamen", async () => {
    const byMail = await prisma.salesContact.create({ data: { name: "Agentur Mail", email: `PETRA.MAIL@${DOMAIN}`.toLowerCase(), stage: "NEU" } });
    const byPhone = await prisma.salesContact.create({ data: { name: "Agentur Telefon", email: `kontakt.tel@${DOMAIN}`, phone: "0151 9876 5432", stage: "INTERESSE" } });
    // Gleicher Vorname wie ein bestehender Kontakt, sonst nichts gemeinsam: neuer Kontakt
    await prisma.salesContact.create({ data: { name: "Agentur Vorname", email: `vorname@${DOMAIN}`, firstName: "Petra", stage: "NEU" } });

    const a = await bookSalesMeeting({ type, start: at("11:00"), input: input("mail", { email: `Petra.Mail@${DOMAIN}`.toLowerCase() }) });
    const b = await bookSalesMeeting({ type, start: at("12:00"), input: input("tel", { phone: "4915198765432" }) });
    const c = await bookSalesMeeting({ type, start: at("13:00"), input: input("vorname", { name: "Petra" }) });
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (!a.ok || !b.ok || !c.ok) return;
    const contactOf = async (id: string) => (await prisma.salesMeeting.findUniqueOrThrow({ where: { id } })).contactId;
    expect(await contactOf(a.meetingId)).toBe(byMail.id);
    expect(await contactOf(b.meetingId)).toBe(byPhone.id);
    expect(await contactOf(c.meetingId)).not.toBe(byMail.id);
    // Stufe springt auf Termin, Telefon des bestehenden Kontakts bleibt
    const tel = await prisma.salesContact.findUniqueOrThrow({ where: { id: byPhone.id } });
    expect(tel).toMatchObject({ stage: "TERMIN", phone: "0151 9876 5432" });
    // Zweite Buchung desselben Kontakts: bestehender Termin statt doppelt
    const again = await bookSalesMeeting({ type, start: at("15:00"), input: input("mail", { email: `petra.mail@${DOMAIN}` }) });
    expect(again).toMatchObject({ ok: true, duplicate: true, meetingId: a.meetingId });
  });

  it("keine Doppelbuchung: belegter Kalender, gleiche Zeit, gleichzeitige Anfragen, Zeit außerhalb der Buchungszeiten", async () => {
    calls.busy = [{ start: at("09:30", 1), end: at("10:30", 1) }];
    expect(await bookSalesMeeting({ type, start: at("10:00", 1), input: input("belegt") })).toEqual({ ok: false, error: "taken" });
    // Puffer 15 Minuten: Kalendertermin endet 09:50, 10:00 ist zu knapp
    calls.busy = [{ start: at("09:00", 1), end: new Date(at("09:00", 1).getTime() + 50 * 60000) }];
    expect(await bookSalesMeeting({ type, start: at("10:00", 1), input: input("puffer") })).toEqual({ ok: false, error: "taken" });
    calls.busy = [];

    const [x, y] = await Promise.all([
      bookSalesMeeting({ type, start: at("14:00", 1), input: input("eins") }),
      bookSalesMeeting({ type, start: at("14:00", 1), input: input("zwei") }),
    ]);
    expect([x.ok, y.ok].sort()).toEqual([false, true]);
    expect([x, y].find((r) => !r.ok)).toEqual({ ok: false, error: "taken" });
    expect(await prisma.salesMeeting.count({ where: { startAt: at("14:00", 1), status: "GEPLANT", calendarKey: VERTRIEB_CUSTOMER_ID } })).toBe(1);
    // Nicht im Raster bzw. außerhalb der Zeiten
    expect(await bookSalesMeeting({ type, start: at("14:30", 1), input: input("raster") })).toEqual({ ok: false, error: "slot" });
    expect(await bookSalesMeeting({ type, start: at("19:00", 1), input: input("abends") })).toEqual({ ok: false, error: "slot" });
    // Angebotene Zeiten: gebuchte Zeit fehlt
    const slots = (await availableSlots(type)).map((s) => s.start);
    expect(slots).not.toContain(at("14:00", 1).toISOString());
    expect(slots).toContain(at("16:00", 1).toISOString());
  });

  it("verschieben per Link: neuer Termin, alter verschoben und aus dem Kalender gelöscht", async () => {
    const res = await bookSalesMeeting({ type, start: at("09:00", 2), input: input("schieben") });
    if (!res.ok) throw new Error("Buchung fehlgeschlagen");
    calls.mails = [];
    const moved = await rescheduleSalesMeeting(res.manageToken, at("16:00", 2));
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.token).not.toBe(res.manageToken);
    const old = await prisma.salesMeeting.findUniqueOrThrow({ where: { id: res.meetingId } });
    expect(old.status).toBe("VERSCHOBEN");
    expect(calls.deleted).toContain(old.calendarEventId);
    expect(await prisma.salesTask.findUnique({ where: { id: old.taskId! } })).toBeNull();
    const neu = await prisma.salesMeeting.findUniqueOrThrow({ where: { manageToken: moved.token } });
    expect(neu).toMatchObject({ status: "GEPLANT", contactId: old.contactId, rescheduledFromId: old.id });
    expect(neu.startAt.toISOString()).toBe(at("16:00", 2).toISOString());
    expect(calls.mails[0].subject).toContain("Neuer Termin");
    // Alter Link funktioniert nicht mehr
    expect(await rescheduleSalesMeeting(res.manageToken, at("17:00", 2))).toEqual({ ok: false, error: "closed" });
  });

  it("absagen per Link: abgesagt, Kalender gelöscht, Aufgabe zum Nachfassen, Mail mit Link zur Buchungsseite", async () => {
    const res = await bookSalesMeeting({ type, start: at("08:00", 2), input: input("absage") });
    if (!res.ok) throw new Error("Buchung fehlgeschlagen");
    calls.mails = [];
    expect(await cancelSalesMeeting(res.manageToken, { reason: "Krank" })).toEqual({ ok: true, token: res.manageToken });
    const m = await prisma.salesMeeting.findUniqueOrThrow({ where: { id: res.meetingId } });
    expect(m).toMatchObject({ status: "ABGESAGT", cancelReason: "Krank", canceledBy: "invitee" });
    expect(calls.deleted).toContain("ev-1");
    const follow = await prisma.salesTask.findFirst({ where: { contactId: m.contactId, type: "ANRUF" } });
    expect(follow?.title).toContain("Neuen Termin vereinbaren");
    expect(calls.mails[0].subject).toContain("Abgesagt");
    expect(calls.pushes.at(-1)).toContain("abgesagt");
    expect(await cancelSalesMeeting(res.manageToken)).toEqual({ ok: false, error: "closed" });
    expect(await cancelSalesMeeting("gibt-es-nicht-1234567890")).toEqual({ ok: false, error: "not_found" });
  });

  it("Entscheidungs-Call: eigener Typ (30 Minuten), persönlicher Link hängt direkt am bekannten Kontakt", async () => {
    const decision = (await loadBookingType("entscheidung"))!;
    expect(decision).toMatchObject({ durationMin: 30, thanksPage: false, title: "Entscheidungs-Call mit Ole Kannapinn" });
    const known = await prisma.salesContact.create({ data: { name: "Agentur Bekannt", email: `bekannt@${DOMAIN}`, stage: "INTERESSE" } });
    const token = signContactToken(known.id);
    expect(verifyContactToken(token)).toBe(known.id);
    expect(verifyContactToken(token.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBeNull();
    expect(verifyContactToken(`${known.id}x${token.slice(known.id.length)}`)).toBeNull();
    expect(verifyContactToken(token, new Date(Date.now() + 91 * 86_400_000))).toBeNull();
    // Andere E-Mail im Formular: trotzdem am bekannten Kontakt, keine Dublette
    const res = await bookSalesMeeting({ type: decision, start: at("10:00", 2), input: input("anders"), knownContactId: verifyContactToken(token) });
    if (!res.ok) throw new Error("Buchung fehlgeschlagen");
    const m = await prisma.salesMeeting.findUniqueOrThrow({ where: { id: res.meetingId } });
    expect(m.contactId).toBe(known.id);
    expect(m.endAt!.getTime() - m.startAt.getTime()).toBe(30 * 60000);
    expect(await prisma.salesContact.count({ where: { email: `petra.anders@${DOMAIN}` } })).toBe(0);
    expect(calls.mails[0].subject).toContain("Ihr Termin mit performancegrowth");
  });

  it("Danke-Seite vermerkt Video und Demo je einmal im Verlauf, nur mit gültigem Buchungs-Token", async () => {
    const res = await bookSalesMeeting({ type, start: at("17:00", 2), input: input("danke") });
    if (!res.ok) throw new Error("Buchung fehlgeschlagen");
    expect(await recordPreparation(res.manageToken, "video")).toBe(true);
    expect(await recordPreparation(res.manageToken, "video")).toBe(false);
    expect(await recordPreparation(res.manageToken, "demo")).toBe(true);
    expect(await recordPreparation("falscher-token-1234567890", "demo")).toBe(false);
    const m = await prisma.salesMeeting.findUniqueOrThrow({ where: { id: res.meetingId } });
    const acts = await prisma.salesActivity.findMany({ where: { contactId: m.contactId, type: "NOTIZ" } });
    expect(acts.map((a) => a.outcome).sort()).toEqual(["Demo geöffnet", "Vorbereitungsvideo angesehen"]);
  });

  it("Erinnerung 24 Stunden und 1 Stunde vorher, je einmal; kurzfristig Gebuchtes ohne 24-Stunden-Erinnerung", async () => {
    const contact = await prisma.salesContact.create({ data: { name: "Erinnerung", email: `erinnerung@${DOMAIN}`, stage: "TERMIN" } });
    const now = new Date();
    const mk = (startInMin: number, bookedMinAgo: number, token: string) =>
      prisma.salesMeeting.create({
        data: {
          contactId: contact.id,
          title: "Meta-Leads-Call mit Ole Kannapinn",
          startAt: new Date(now.getTime() + startInMin * 60000),
          endAt: new Date(now.getTime() + (startInMin + 45) * 60000),
          createdAt: new Date(now.getTime() - bookedMinAgo * 60000),
          inviteeEmail: `erinnerung@${DOMAIN}`,
          manageToken: `${token}-${Math.random().toString(36).slice(2, 12)}`,
          bookingTypeId: type.id,
          calendarKey: "test-erinnerung",
        },
      });
    const tomorrow = await mk(23 * 60, 3 * 24 * 60, "morgen");
    const fresh = await mk(20 * 60, 60, "frisch");
    const soon = await mk(45, 2 * 24 * 60, "gleich");
    const r = await runSalesBookingReminders(now);
    expect(r.day).toBeGreaterThanOrEqual(1);
    expect(r.soon).toBeGreaterThanOrEqual(1);
    const to = calls.mails.filter((m) => m.to === `erinnerung@${DOMAIN}`).map((m) => m.subject);
    expect(to.filter((s) => s.startsWith("Erinnerung"))).toHaveLength(1);
    expect(to.filter((s) => s.startsWith("Gleich geht es los"))).toHaveLength(1);
    expect((await prisma.salesMeeting.findUniqueOrThrow({ where: { id: tomorrow.id } })).reminderSentAt).not.toBeNull();
    expect((await prisma.salesMeeting.findUniqueOrThrow({ where: { id: fresh.id } })).reminderSentAt).not.toBeNull();
    expect((await prisma.salesMeeting.findUniqueOrThrow({ where: { id: soon.id } })).soonReminderSentAt).not.toBeNull();
    // Zweiter Lauf: nichts doppelt
    calls.mails = [];
    await runSalesBookingReminders(now);
    expect(calls.mails.filter((m) => m.to === `erinnerung@${DOMAIN}`)).toHaveLength(0);
  });
});
