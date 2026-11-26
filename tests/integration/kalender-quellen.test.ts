import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Verfügbarkeits-Quellen mit echter DB: Allianz-Online-Kalender (bookingtime
// nachgebildet), Lead-Zeiten, „Zeit blockieren", Einladung an die Allianz-Mail.
const calls = vi.hoisted(() => ({
  created: [] as Array<{ key: string; start: Date; attendeeEmails: string[] }>,
  busy: new Map<string, Array<{ start: Date; end: Date }>>(),
}));
vi.mock("@/lib/calendar/google", () => ({
  googleHasRequiredScopes: () => true,
  googleGetBusy: vi.fn(async (key: string) => calls.busy.get(key) ?? []),
  googleCreateEvent: vi.fn(async (key: string, ev: { start: Date; attendeeEmails: string[] }) => {
    calls.created.push({ key, start: ev.start, attendeeEmails: ev.attendeeEmails });
    return { eventId: `ev-${calls.created.length}`, videoUrl: null };
  }),
  googleDeleteEvent: vi.fn(async () => {}),
  googleGetResponses: vi.fn(async () => []),
}));
vi.mock("@/lib/calendar/lead-email", () => ({ sendLeadEmail: vi.fn(async () => ({ sent: true })) }));
// App-Kalender (Ole, 20.11.2026): Einladungen per Mail mitschneiden
const mails = vi.hoisted(() => [] as Array<{ to: string | string[]; subject: string; ics: string }>);
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendCustomerMail: vi.fn(async (o: { to: string | string[]; subject: string; attachments?: { content: string | Buffer }[] }) => {
    mails.push({ to: o.to, subject: o.subject, ics: String(o.attachments?.[0]?.content ?? "") });
    return { ok: true };
  }),
}));
vi.mock("@/lib/lead-progress", () => ({ recordLeadProgress: vi.fn(async () => {}) }));
vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async () => {}),
  sendToAdmins: vi.fn(async () => {}),
}));

import { prisma } from "@/lib/prisma";
import { bookAppointment, SchonGebuchtError, suggestSlots } from "@/lib/calendar";
import { __resetAllianzCache, decodeAllianzCalendar } from "@/lib/calendar/allianz-online";
import { addBlock, changeAllianz, connectAllianz, loadSources, updateLeadTimes } from "@/lib/calendar/sources";
import { addDaysYmd, berlinYmd, weekdayOfYmd } from "@/lib/absence";
import { berlinAt, loadLeadTimes } from "@/lib/calendar/lead-times";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const today = berlinYmd(new Date());
/** Erster Werktag ab (einschließlich) n Tagen. */
function workday(n: number): string {
  let d = addDaysYmd(today, n);
  while (weekdayOfYmd(d) === 0 || weekdayOfYmd(d) === 6) d = addDaysYmd(d, 1);
  return d;
}

// ─── bookingtime nachgebildet ───────────────────────────────────────────
const bt = vi.hoisted(() => ({ slots: [] as string[], fail: false, monthCalls: 0, pageCalls: 0 }));
const ROOT = "r".repeat(32);
const ORG = "o".repeat(32);
const JS = `a={clientId:"${"c".repeat(64)}",domain:"https://auth.bookingtime.com"};b=class{constructor(){this.organizationId="${ROOT}"}}`;
const TEMPLATES = [
  { id: "tpl-agentur", name: "Beratung in Agentur", duration: 60, leadTime: 0, followupTime: 0, bookingDayEarliest: 2, bookingStepList: [{ bookingResourceList: [{ id: "res-1", name: "Test Vertreter" }] }] },
  { id: "tpl-online", name: "Online-Beratung", duration: 60, leadTime: 10, followupTime: 0, bookingDayEarliest: 2, bookingStepList: [{ bookingResourceList: [{ id: "res-1", name: "Test Vertreter" }] }] },
  { id: "tpl-tel", name: "Telefon-Rückruf", duration: 20, leadTime: 0, followupTime: 0, bookingDayEarliest: 2, bookingStepList: [{ bookingResourceList: [{ id: "res-1", name: "Test Vertreter" }] }] },
];
async function fakeFetch(input: string | URL | Request): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://vertretung.allianz.de/")) {
    bt.pageCalls++;
    const r = new Response(`<div data-agencydata="[{&#34;agencyKey&#34;:&#34;101511203&#34;}]"></div>`);
    Object.defineProperty(r, "url", { value: url });
    return r;
  }
  if (url.startsWith("https://booking.allianz-abv.eps.bookingtime.com/assets/")) return new Response(JS);
  if (url.startsWith("https://booking.allianz-abv.eps.bookingtime.com/")) return new Response('<script type="module" crossorigin src="/assets/index-x1.js"></script>');
  if (url.startsWith("https://auth.bookingtime.com/oauth/token")) return Response.json({ refresh_token: "rt", access_token: "at", expires_in: 300 });
  if (url.endsWith(`/organization/${ROOT}/organization/101511203/identify`)) return Response.json({ content: { id: ORG, customId: "101511203", name: "Agentur Test" } });
  if (url.endsWith(`/organization/${ORG}/bookingTemplate/list`)) return Response.json({ content: { recordList: TEMPLATES } });
  if (url.includes(`/organization/${ORG}/bookingTemplate/tpl-`) && url.includes("/bookingSlot/") && url.endsWith("/listMonth")) {
    bt.monthCalls++;
    if (bt.fail) return new Response("Fehler", { status: 503 });
    return Response.json({ content: { timeZone: "Europe/Berlin", list: bt.slots.map((timestamp) => ({ timestamp, bookingResourceIdList: ["res-1"] })) } });
  }
  return new Response("nicht gefunden", { status: 404 });
}

/** Slot-Zeitstempel wie bei bookingtime: Berliner Wanduhrzeit mit Offset. */
function slotTs(ymd: string, hhmm: string): string {
  const offsetH = Math.round((Date.parse(`${ymd}T${hhmm}:00Z`) - berlinAt(ymd, hhmm).getTime()) / 3600000);
  return `${ymd}T${hhmm}:00+0${offsetH}:00`;
}

const customers: string[] = [];
beforeAll(() => {
  requireTestDb();
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
});
afterAll(async () => {
  vi.unstubAllGlobals();
  for (const id of customers) {
    await prisma.appointment.deleteMany({ where: { customerId: id } });
    await prisma.salesTask.deleteMany({ where: { title: { contains: "Allianz-Kalender-Abgleich" } } });
    await prisma.calendarConnection.deleteMany({ where: { customerId: id } });
    await cleanupCustomer(id);
  }
});
beforeEach(() => {
  __resetAllianzCache();
  calls.created.length = 0;
  calls.busy.clear();
  bt.slots = [];
  bt.fail = false;
  bt.monthCalls = 0;
  bt.pageCalls = 0;
});

async function setup() {
  const c = await makeCustomer();
  customers.push(c.id);
  await prisma.calendarConnection.create({ data: { customerId: c.id, provider: "google", status: "connected" } });
  await prisma.agentConfig.create({ data: { customerId: c.id, advisorEmail: "test.vertreter@allianz.de" } });
  return c.id;
}

describe("Allianz-Online-Kalender verbinden", () => {
  it("ohne Zustimmung nicht", async () => {
    const id = await setup();
    const res = await connectAllianz(id, "vertretung.allianz.de/test.vertreter", false);
    expect(res.error).toMatch(/stimmen Sie zu/);
    expect(bt.pageCalls).toBe(0);
  });

  it("über den Link: VTNR → Vertretung → Online-Beratung, verschlüsselt gespeichert", async () => {
    const id = await setup();
    bt.slots = [slotTs(workday(3), "14:10")];
    const res = await connectAllianz(id, "https://vertretung.allianz.de/test.vertreter/", true);
    expect(res.ok).toBe(true);
    expect(res.info).toContain("Online-Beratung");
    const row = await prisma.agentConfig.findUnique({ where: { customerId: id } });
    expect(row!.allianzConsentAt).not.toBeNull();
    expect(row!.allianzCalendarEnc).not.toContain("101511203");
    const cal = decodeAllianzCalendar(row!.allianzCalendarEnc)!;
    expect(cal).toMatchObject({ vtnr: "101511203", orgId: ORG, templateId: "tpl-online", durationMin: 60, leadTimeMin: 10, bookingDayEarliest: 2, resourceId: "res-1" });
    const view = await loadSources(id);
    expect(view.allianz?.templateName).toBe("Online-Beratung");
    // Termindauer der Termin-Art übernommen (Ole, 20.11.2026), Standard-Zeiten bleiben
    expect(res.info).toContain("Termindauer auf 60 Min. gesetzt, wie im Allianz-Kalender.");
    const lt = await loadLeadTimes(id);
    expect(lt.durationMin).toBe(60);
    expect(lt.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(lt.schedule?.days[1]).toEqual([["10:00", "17:00"]]);
  });

  it("Termindauer übernehmen: eigene Tage und Uhrzeiten bleiben, Wechsel der Termin-Art nimmt die nächste Dauer", async () => {
    const id = await setup();
    const fd = new FormData();
    fd.set("day_2", "on");
    fd.set("time_09:00", "on");
    fd.set("extraTime", "11:30");
    expect((await updateLeadTimes(id, id, fd)).ok).toBe(true);
    bt.slots = [slotTs(workday(3), "09:10")];
    expect((await connectAllianz(id, "101511203", true)).ok).toBe(true);
    const lt = await loadLeadTimes(id);
    expect(lt).toMatchObject({ weekdays: [2], times: ["09:00", "11:30"], durationMin: 60 });

    const res = await changeAllianz(id, "tpl-tel", null);
    expect(res.ok).toBe(true);
    expect(res.info).toContain("Termindauer auf 15 Min. gesetzt (Allianz-Kalender: 20 Min.).");
    expect(await loadLeadTimes(id)).toMatchObject({ weekdays: [2], times: ["09:00", "11:30"], durationMin: 15 });
  });
});

describe("Vor dem frühesten Allianz-Buchungstag (Ole, 20.11.2026)", () => {
  /** Lead-Zeiten an allen sieben Tagen 10 bis 17 Uhr, damit morgen sicher Zeiten hat. */
  async function jedenTag(id: string) {
    const fd = new FormData();
    const range = [["10:00", "17:00"]];
    fd.set("schedule", JSON.stringify({ step: 60, days: { 0: range, 1: range, 2: range, 3: range, 4: range, 5: range, 6: range } }));
    fd.set("duration", "60");
    expect((await updateLeadTimes(id, id, fd)).ok).toBe(true);
  }
  const fruehester = () => berlinAt(addDaysYmd(today, 2), "00:00").getTime();

  it("mit Google-Kalender: Lead-Zeiten davor gelten als frei", async () => {
    const id = await setup();
    expect((await connectAllianz(id, "101511203", true)).ok).toBe(true);
    await jedenTag(id);
    const slots = await suggestSlots(id, 30, 20, "lead", 2);
    const morgen = berlinAt(addDaysYmd(today, 1), "10:00").toISOString();
    expect(slots.map((s) => s.start)).toContain(morgen);
  });

  it("nur App-Kalender: keine Termine vor dem frühesten Buchungstag, Hinweis für den Kunden", async () => {
    const c = await makeCustomer();
    customers.push(c.id);
    await prisma.agentConfig.create({ data: { customerId: c.id, advisorEmail: "test.vertreter@allianz.de" } });
    const d1 = workday(4);
    bt.slots = [slotTs(d1, "10:10")];
    expect((await connectAllianz(c.id, "101511203", true)).ok).toBe(true);
    expect((await prisma.calendarConnection.findUnique({ where: { customerId: c.id } }))?.provider).toBe("app");
    await jedenTag(c.id);
    const slots = await suggestSlots(c.id, 30, 20, "lead", 2);
    expect(slots.filter((s) => Date.parse(s.start) < fruehester())).toEqual([]);
    // Ab dem frühesten Buchungstag zählen die Allianz-Slots
    const spaeter = (await suggestSlots(c.id, 30, 20, "lead", 8)).map((s) => s.start);
    expect(spaeter).toContain(berlinAt(d1, "10:00").toISOString());
    const { loadCalendarSetup } = await import("@/lib/calendar/setup-view");
    expect((await loadCalendarSetup(c.id, c.id)).status.allianz?.abFruehestemTag).toBe(true);
    const mitGoogle = await setup();
    expect((await connectAllianz(mitGoogle, "101511203", true)).ok).toBe(true);
    expect((await loadCalendarSetup(mitGoogle, mitGoogle)).status.allianz?.abFruehestemTag).toBe(false);
  });

  it("Allianz liefert freie Zeiten davor (Ole, 26.11.2026): diese zählen als frei, Tage ohne Angaben bleiben belegt", async () => {
    const c = await makeCustomer();
    customers.push(c.id);
    await prisma.agentConfig.create({ data: { customerId: c.id, advisorEmail: "test.vertreter@allianz.de" } });
    const morgen = addDaysYmd(today, 1);
    const d1 = workday(4);
    bt.slots = [slotTs(morgen, "14:10"), slotTs(d1, "10:10")];
    expect((await connectAllianz(c.id, "101511203", true)).ok).toBe(true);
    await jedenTag(c.id);
    const starts = (await suggestSlots(c.id, 30, 20, "lead", 8)).map((s) => s.start);
    expect(starts).toContain(berlinAt(morgen, "14:00").toISOString());
    expect(starts).not.toContain(berlinAt(morgen, "10:00").toISOString());
  });
});

describe("Vorschläge mit Allianz-Online-Kalender, Lead-Zeiten und Blockierungen", () => {
  it("nur Lead-Zeiten, die im Online-Kalender frei sind; Blockierung zählt als belegt", async () => {
    const id = await setup();
    const d1 = workday(4);
    const d2 = workday(addDays(d1) + 1);
    // Freie Slots: d1 ab 14:10 (also 14:00–15:10 frei), d2 ab 10:10 und 16:10.
    bt.slots = [slotTs(d1, "14:10"), slotTs(d2, "10:10"), slotTs(d2, "16:10")];
    expect((await connectAllianz(id, "101511203", true)).ok).toBe(true);

    const fd = new FormData();
    for (const d of [1, 2, 3, 4, 5]) fd.set(`day_${d}`, "on");
    for (const t of ["10:00", "14:00", "16:00"]) fd.set(`time_${t}`, "on");
    expect((await updateLeadTimes(id, id, fd)).ok).toBe(true);

    // Vor dem frühesten Buchungstag (heute/morgen) keine Slots: Suche erst ab d1.
    const slots = await suggestSlots(id, 30, 10, "lead", 14, null, new Date(berlinAt(d1, "00:00")));
    const got = slots.map((s) => s.start);
    expect(got).toContain(berlinAt(d1, "14:00").toISOString());
    expect(got).not.toContain(berlinAt(d1, "10:00").toISOString());
    expect(got).toContain(berlinAt(d2, "10:00").toISOString());
    expect(got).toContain(berlinAt(d2, "16:00").toISOString());
    expect(got).not.toContain(berlinAt(d2, "14:00").toISOString());

    // d2 10:00 blockieren → fällt weg.
    const block = new FormData();
    block.set("date", d2);
    block.set("from", "09:30");
    block.set("to", "11:00");
    expect((await addBlock(id, id, block)).ok).toBe(true);
    const after = (await suggestSlots(id, 30, 10, "lead", 14, null, new Date(berlinAt(d1, "00:00")))).map((s) => s.start);
    expect(after).not.toContain(berlinAt(d2, "10:00").toISOString());
    expect(after).toContain(berlinAt(d2, "16:00").toISOString());
    // Zwischenspeicher: dieselben Monate wurden nicht erneut abgerufen.
    const monthsNeeded = new Set([d1.slice(0, 7), d2.slice(0, 7), addDaysYmd(d1, 14).slice(0, 7)]).size;
    expect(bt.monthCalls).toBeLessThanOrEqual(monthsNeeded + 1);
  });

  it("eigene Lead-Zeiten statt 10/14/16", async () => {
    const id = await setup();
    const d1 = workday(4);
    bt.slots = [slotTs(d1, "09:10"), slotTs(d1, "11:40")];
    expect((await connectAllianz(id, "101511203", true)).ok).toBe(true);
    const fd = new FormData();
    fd.set(`day_${weekdayOfYmd(d1)}`, "on");
    fd.set("time_09:00", "on");
    fd.set("extraTime", "11:30");
    expect((await updateLeadTimes(id, id, fd)).ok).toBe(true);
    const got = (await suggestSlots(id, 30, 5, "lead", 3, null, new Date(berlinAt(d1, "00:00")))).map((s) => s.start);
    expect(got).toEqual([berlinAt(d1, "09:00").toISOString(), berlinAt(d1, "11:30").toISOString()]);
  });

  it("Abruf fehlgeschlagen → Fehler statt „frei“, Admin-Aufgabe nur einmal", async () => {
    const id = await setup();
    bt.slots = [slotTs(workday(4), "10:10")];
    expect((await connectAllianz(id, "101511203", true)).ok).toBe(true);
    __resetAllianzCache();
    bt.fail = true;
    await expect(suggestSlots(id)).rejects.toThrow(/Allianz-Online-Kalender/);
    await expect(suggestSlots(id)).rejects.toThrow();
    const customer = await prisma.customer.findUnique({ where: { id }, select: { name: true } });
    const tasks = await prisma.salesTask.findMany({ where: { title: `Allianz-Kalender-Abgleich fehlgeschlagen: ${customer!.name}` } });
    expect(tasks).toHaveLength(1);
    const row = await prisma.agentConfig.findUnique({ where: { customerId: id } });
    expect(row!.allianzLastError).toMatch(/503/);
  });

  it("gebuchter Termin geht weiter als Einladung an die Allianz-Mail", async () => {
    const id = await setup();
    const d1 = workday(4);
    bt.slots = [slotTs(d1, "14:10")];
    expect((await connectAllianz(id, "101511203", true)).ok).toBe(true);
    const start = berlinAt(d1, "14:00").toISOString();
    await bookAppointment({ customerId: id, start, mode: "phone", summary: "Test", notifyLead: false });
    expect(calls.created).toHaveLength(1);
    expect(calls.created[0].attendeeEmails).toEqual(["test.vertreter@allianz.de"]);
    // Zeit ohne freien Slot → abgelehnt
    await expect(bookAppointment({ customerId: id, start: berlinAt(d1, "10:00").toISOString(), mode: "phone", summary: "Test", notifyLead: false })).rejects.toThrow();
  });
});

/** Tage zwischen heute und einem YYYY-MM-DD. */
function addDays(ymd: string): number {
  return Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

describe("App-Kalender: ohne Google/Outlook buchen (Ole, 20.11.2026)", () => {
  it("Allianz verbinden schaltet den App-Kalender ein; Buchung belegt den Slot und schickt eine Einladung", async () => {
    const c = await makeCustomer();
    customers.push(c.id);
    await prisma.agentConfig.create({ data: { customerId: c.id, advisorEmail: "test.vertreter@allianz.de" } });
    const d1 = workday(4);
    bt.slots = [slotTs(d1, "10:10"), slotTs(d1, "15:40")];
    const res = await connectAllianz(c.id, "10/151/1203", true);
    expect(res.ok).toBe(true);
    expect(res.info).toContain("Einladung per Mail");
    const conn = await prisma.calendarConnection.findUnique({ where: { customerId: c.id } });
    expect(conn).toMatchObject({ provider: "app", status: "connected" });

    const vorher = (await suggestSlots(c.id, 30, 10, "lead", 3, null, new Date(berlinAt(d1, "00:00")))).map((s) => s.start);
    const slot = berlinAt(d1, "10:00").toISOString();
    expect(vorher).toContain(slot);

    mails.length = 0;
    const appt = await bookAppointment({ customerId: c.id, start: slot, mode: "phone", summary: "Beratung Test", leadPhone: "491701234567" });
    expect(appt.appointmentId).toBeTruthy();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toEqual(["test.vertreter@allianz.de"]);
    expect(mails[0].ics).toContain("METHOD:REQUEST");

    const nachher = (await suggestSlots(c.id, 30, 10, "lead", 3, null, new Date(berlinAt(d1, "00:00")))).map((s) => s.start);
    expect(nachher).not.toContain(slot);
    // Zweite Buchung derselben Zeit scheitert (Doppelbuchungs-Schutz)
    await expect(bookAppointment({ customerId: c.id, start: slot, mode: "phone", summary: "Doppelt" })).rejects.toThrow();
  });

  it("Lead mit künftigem Termin: kein zweiter Termin, Verschieben und Berater-Buchung bleiben möglich (Ole, 21.11.2026)", async () => {
    const c = await makeCustomer();
    customers.push(c.id);
    await prisma.agentConfig.create({ data: { customerId: c.id, advisorEmail: "test.vertreter@allianz.de" } });
    const d1 = workday(4);
    bt.slots = [slotTs(d1, "10:10"), slotTs(d1, "15:40")];
    expect((await connectAllianz(c.id, "10/151/1203", true)).ok).toBe(true);
    const lead = await prisma.lead.create({ data: { customerId: c.id, name: "Doppelt Test", phone: "491701234599" } });
    await bookAppointment({ customerId: c.id, leadId: lead.id, start: berlinAt(d1, "10:00").toISOString(), mode: "video", summary: "Erster", bookedVia: "bot" });
    // Zweite Buchung (Assistent oder Buchungsseite) für denselben Lead: abgelehnt
    await expect(bookAppointment({ customerId: c.id, leadId: lead.id, start: berlinAt(d1, "15:30").toISOString(), mode: "video", summary: "Zweiter", bookedVia: "booking_page" })).rejects.toBeInstanceOf(SchonGebuchtError);
    expect(await prisma.appointment.count({ where: { leadId: lead.id, status: "booked" } })).toBe(1);
    // Verschieben bucht neu (danach wird der alte abgesagt) und ist erlaubt
    await expect(bookAppointment({ customerId: c.id, leadId: lead.id, start: berlinAt(d1, "15:30").toISOString(), mode: "video", summary: "Verschoben", notifyLead: "rescheduled" })).resolves.toBeTruthy();
  });

  it("verbundener Google-Kalender bleibt unangetastet", async () => {
    const id = await setup();
    bt.slots = [slotTs(workday(4), "10:10")];
    expect((await connectAllianz(id, "101511203", true)).ok).toBe(true);
    const conn = await prisma.calendarConnection.findUnique({ where: { customerId: id } });
    expect(conn?.provider).toBe("google");
  });
});
