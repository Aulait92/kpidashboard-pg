import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Berater-App-Kalender mit Allianz-Person (Ole, 21.11.2026): Team-Mitglieder einer Allianz-Agentur bekommen Termine
// als Einladung an ihre Allianz-Adresse, gebucht nur in den freien Zeiten IHRER Person im Allianz-Online-Kalender
// (bookingtime nachgebildet), ohne Doppelbuchungen. Der Agentur-Kalender zählt ihre Termine nicht mit.
vi.mock("@/lib/calendar/lead-email", () => ({ sendLeadEmail: vi.fn(async () => ({ sent: true })) }));
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
import { bookAppointment, bookingKeys, cancelAppointment, findFreeCalendar, suggestSlots } from "@/lib/calendar";
import { __resetAllianzCache } from "@/lib/calendar/allianz-online";
import { appBusy } from "@/lib/calendar/app-kalender";
import { beraterAllianzSetzen, loadBeraterPersonen } from "@/lib/calendar/berater-allianz";
import { connectAllianz, disconnectAllianz, updateLeadTimes } from "@/lib/calendar/sources";
import { loadTeamCalendars } from "@/lib/calendar/team";
import { userCalendarKey } from "@/lib/calendar/tokens";
import { addDaysYmd, berlinYmd, weekdayOfYmd } from "@/lib/absence";
import { berlinAt } from "@/lib/calendar/lead-times";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const today = berlinYmd(new Date());
function workday(n: number): string {
  let d = addDaysYmd(today, n);
  while (weekdayOfYmd(d) === 0 || weekdayOfYmd(d) === 6) d = addDaysYmd(d, 1);
  return d;
}

// ─── bookingtime nachgebildet: zwei Personen mit unterschiedlichen freien Zeiten ───
const bt = vi.hoisted(() => ({ slots: [] as Array<{ timestamp: string; bookingResourceIdList: string[] }>, monthCalls: 0 }));
const ROOT = "r".repeat(32);
const ORG = "o".repeat(32);
const JS = `a={clientId:"${"c".repeat(64)}",domain:"https://auth.bookingtime.com"};b=class{constructor(){this.organizationId="${ROOT}"}}`;
const RESOURCES = [
  { id: "res-a", name: "Anna Allianz" },
  { id: "res-b", name: "Bernd Allianz" },
];
const TEMPLATES = [{ id: "tpl-online", name: "Online-Beratung", duration: 60, leadTime: 10, followupTime: 0, bookingDayEarliest: 2, bookingStepList: [{ bookingResourceList: RESOURCES }] }];
async function fakeFetch(input: string | URL | Request): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://booking.allianz-abv.eps.bookingtime.com/assets/")) return new Response(JS);
  if (url.startsWith("https://booking.allianz-abv.eps.bookingtime.com/")) return new Response('<script type="module" crossorigin src="/assets/index-x1.js"></script>');
  if (url.startsWith("https://auth.bookingtime.com/oauth/token")) return Response.json({ refresh_token: "rt", access_token: "at", expires_in: 300 });
  if (url.endsWith(`/organization/${ROOT}/organization/101511203/identify`)) return Response.json({ content: { id: ORG, name: "Agentur Test" } });
  if (url.endsWith(`/organization/${ORG}/bookingTemplate/list`)) return Response.json({ content: { recordList: TEMPLATES } });
  if (url.includes(`/organization/${ORG}/bookingTemplate/tpl-online/bookingSlot/`) && url.endsWith("/listMonth")) {
    bt.monthCalls++;
    return Response.json({ content: { timeZone: "Europe/Berlin", list: bt.slots } });
  }
  return new Response("nicht gefunden", { status: 404 });
}
function slotTs(ymd: string, hhmm: string): string {
  const offsetH = Math.round((Date.parse(`${ymd}T${hhmm}:00Z`) - berlinAt(ymd, hhmm).getTime()) / 3600000);
  return `${ymd}T${hhmm}:00+0${offsetH}:00`;
}

const d1 = workday(4);
const at = (t: string) => berlinAt(d1, t).toISOString();
const fromD1 = () => new Date(berlinAt(d1, "00:00"));

let customerId = "";
let ownerId = "";
let aId = "";
let bId = "";
let bEmail = "";

async function leadFuer(userId: string) {
  return (await prisma.lead.create({ data: { customerId, name: "Test Lead", phone: "4917000000000", assignedUserId: userId } })).id;
}
async function zeiten(key: string) {
  const fd = new FormData();
  fd.set(`day_${weekdayOfYmd(d1)}`, "on");
  for (const t of ["10:00", "14:00", "16:00"]) fd.set(`time_${t}`, "on");
  fd.set("duration", "60");
  expect((await updateLeadTimes(customerId, key, fd)).ok).toBe(true);
}

beforeAll(async () => {
  requireTestDb();
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  customerId = (await makeCustomer()).id;
  ownerId = (await makeBuyer(customerId, "owner")).id;
  aId = (await makeBuyer(customerId, "advisor")).id;
  const b = await makeBuyer(customerId, "advisor");
  bId = b.id;
  bEmail = b.email;
  await prisma.agentConfig.create({ data: { customerId, advisorEmail: "inhaber@allianz.de" } });
  // A: 10:10 frei, B: 14:10 frei, beide: 16:10 frei
  bt.slots = [
    { timestamp: slotTs(d1, "10:10"), bookingResourceIdList: ["res-a"] },
    { timestamp: slotTs(d1, "14:10"), bookingResourceIdList: ["res-b"] },
    { timestamp: slotTs(d1, "16:10"), bookingResourceIdList: ["res-a", "res-b"] },
  ];
  expect((await connectAllianz(customerId, "101511203", true)).ok).toBe(true);
  for (const k of [customerId, userCalendarKey(aId), userCalendarKey(bId)]) await zeiten(k);
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await prisma.appointment.deleteMany({ where: { customerId } });
  await prisma.calendarConnection.deleteMany({ where: { customerId } });
  await prisma.auditLog.deleteMany({ where: { customerId } });
  await cleanupCustomer(customerId);
});
beforeEach(() => {
  mails.length = 0;
});

describe("Berater-App-Kalender mit Allianz-Person", () => {
  it("Person wählen: Kalender verbunden, Einladungsadresse wie angegeben bzw. Login-Adresse", async () => {
    expect((await loadBeraterPersonen(customerId))?.resources.map((r) => r.id)).toEqual(["res-a", "res-b"]);
    // ohne Person kein Kalender
    expect((await beraterAllianzSetzen({ customerId, userId: aId, resourceId: "res-x" })).error).toMatch(/gibt es/);
    const a = await beraterAllianzSetzen({ customerId, userId: aId, resourceId: "res-a", email: "Anna.Allianz@allianz.de" });
    expect(a).toMatchObject({ ok: true, info: "Termine bekommen Sie als Einladung an anna.allianz@allianz.de." });
    // Dieselbe Person geht nicht an zwei Mitglieder
    expect((await beraterAllianzSetzen({ customerId, userId: bId, resourceId: "res-a" })).error).toMatch(/schon/);
    expect((await beraterAllianzSetzen({ customerId, userId: bId, resourceId: "res-b" })).ok).toBe(true);
    const rowB = await prisma.advisorCalendar.findUniqueOrThrow({ where: { userId: bId } });
    expect(rowB).toMatchObject({ provider: "app", status: "connected", allianzResourceId: "res-b", accountEmail: bEmail.toLowerCase() });
    // Zählt als verbundener Kalender (Team-Übersicht, Lead-Verteilung)
    const team = await loadTeamCalendars(customerId);
    expect(team.rows.find((r) => r.userId === aId)).toMatchObject({ connected: true, provider: "app" });
    // fremdes Mitglied: nicht gefunden
    expect((await beraterAllianzSetzen({ customerId: "fremd", userId: aId, resourceId: "res-a" })).error).toBeTruthy();
  });

  it("Lead von A: nur freie Zeiten von A, Einladung an A, zweite Buchung derselben Zeit abgelehnt, B unberührt", async () => {
    __resetAllianzCache();
    const leadA = await leadFuer(aId);
    expect(await bookingKeys(customerId, leadA)).toEqual([userCalendarKey(aId)]);
    const fuerA = (await suggestSlots(customerId, 60, 10, "lead", 3, leadA, fromD1())).map((s) => s.start);
    expect(fuerA).toContain(at("10:00"));
    expect(fuerA).toContain(at("16:00"));
    expect(fuerA).not.toContain(at("14:00"));

    const abrufeNachA = bt.monthCalls;
    const leadB = await leadFuer(bId);
    const fuerB = (await suggestSlots(customerId, 60, 10, "lead", 3, leadB, fromD1())).map((s) => s.start);
    expect(fuerB).toEqual([at("14:00"), at("16:00")]);
    // Freie Monats-Slots teilen sich die Personen (Zwischenspeicher je Organisation und Termin-Art): kein neuer Abruf für B
    expect(bt.monthCalls).toBe(abrufeNachA);

    const booked = await bookAppointment({ customerId, leadId: leadA, start: at("16:00"), mode: "phone", summary: "Beratung A", leadPhone: "4917000000000", notifyLead: false });
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: booked.appointmentId } });
    expect(appt.calendarKey).toBe(userCalendarKey(aId));
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toEqual(["anna.allianz@allianz.de"]);
    expect(mails[0].ics).toContain("METHOD:REQUEST");

    // Allianz zeigt 16:10 noch frei (Zwischenspeicher), die eigene Buchung schützt trotzdem
    const leadA2 = await leadFuer(aId);
    await expect(bookAppointment({ customerId, leadId: leadA2, start: at("16:00"), mode: "phone", summary: "Doppelt", notifyLead: false })).rejects.toThrow();
    expect((await suggestSlots(customerId, 60, 10, "lead", 3, leadA2, fromD1())).map((s) => s.start)).not.toContain(at("16:00"));

    // B ist um 16 Uhr weiter frei
    expect((await suggestSlots(customerId, 60, 10, "lead", 3, leadB, fromD1())).map((s) => s.start)).toContain(at("16:00"));
    mails.length = 0;
    await bookAppointment({ customerId, leadId: leadB, start: at("16:00"), mode: "phone", summary: "Beratung B", notifyLead: false });
    expect(mails[0].to).toEqual([bEmail.toLowerCase()]);

    // Agentur-Kalender: Termine der Berater belegen ihn nicht
    const min = berlinAt(d1, "00:00");
    const max = berlinAt(addDaysYmd(d1, 1), "00:00");
    expect(await appBusy(customerId, min, max)).toEqual([]);
    expect((await findFreeCalendar(customerId, [customerId], new Date(at("16:00")), new Date(berlinAt(d1, "17:00")))).key).toBe(customerId);

    // Absage geht als Absage an A
    mails.length = 0;
    await cancelAppointment(booked.appointmentId, customerId, "team", false);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toEqual(["anna.allianz@allianz.de"]);
    expect(mails[0].ics).toContain("METHOD:CANCEL");
  });

  it("vor dem frühesten Allianz-Buchungstag keine Termine für Berater", async () => {
    const leadA = await leadFuer(aId);
    const fd = new FormData();
    const range = [["10:00", "17:00"]];
    fd.set("schedule", JSON.stringify({ step: 60, days: { 0: range, 1: range, 2: range, 3: range, 4: range, 5: range, 6: range } }));
    fd.set("duration", "60");
    expect((await updateLeadTimes(customerId, userCalendarKey(aId), fd)).ok).toBe(true);
    const slots = await suggestSlots(customerId, 60, 20, "lead", 2, leadA);
    const fruehester = berlinAt(addDaysYmd(today, 2), "00:00").getTime();
    expect(slots.filter((s) => Date.parse(s.start) < fruehester)).toEqual([]);
  });

  it("Allianz-Kalender der Agentur getrennt: Berater-Kalender ruht, Leads buchen wieder im Agentur-Kalender", async () => {
    await disconnectAllianz(customerId);
    expect((await prisma.advisorCalendar.findUniqueOrThrow({ where: { userId: aId } })).status).toBe("pending");
    const leadA = await leadFuer(aId);
    expect(await bookingKeys(customerId, leadA)).toEqual([customerId]);
    // Wieder verbunden: Person kommt vor, Kalender wieder verbunden
    expect((await connectAllianz(customerId, "101511203", true)).ok).toBe(true);
    expect((await prisma.advisorCalendar.findUniqueOrThrow({ where: { userId: aId } })).status).toBe("connected");
    // Inhaber nimmt die Person wieder weg
    expect((await beraterAllianzSetzen({ customerId, userId: aId, resourceId: null })).ok).toBe(true);
    expect(await prisma.advisorCalendar.findUnique({ where: { userId: aId } })).toBeNull();
    void ownerId;
  });
});
