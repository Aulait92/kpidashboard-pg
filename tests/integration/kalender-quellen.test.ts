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
vi.mock("@/lib/lead-progress", () => ({ recordLeadProgress: vi.fn(async () => {}) }));
vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async () => {}),
  sendToAdmins: vi.fn(async () => {}),
}));

import { prisma } from "@/lib/prisma";
import { bookAppointment, suggestSlots } from "@/lib/calendar";
import { __resetAllianzCache, decodeAllianzCalendar } from "@/lib/calendar/allianz-online";
import { addBlock, connectAllianz, loadSources, updateLeadTimes } from "@/lib/calendar/sources";
import { addDaysYmd, berlinYmd, weekdayOfYmd } from "@/lib/absence";
import { berlinAt } from "@/lib/calendar/lead-times";
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
  if (url.includes(`/organization/${ORG}/bookingTemplate/tpl-online/bookingSlot/`) && url.endsWith("/listMonth")) {
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
