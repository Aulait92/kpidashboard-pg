import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// „Ich habe keinen Online-Kalender“ (25.11.2026, z. B. Signal-Iduna-Vertreter): App-Kalender mit festen Beratungszeiten,
// Einladung per Mail, eigene Termine per Weiterleitung. Echte DB; Mails und Push mitgeschnitten.
const pushes = vi.hoisted(() => [] as Array<{ title: string; body: string; url: string; tag: string }>);
vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async (_id: string, p: { title: string; body: string; url: string; tag: string }) => {
    pushes.push(p);
  }),
  sendToAdmins: vi.fn(async () => {}),
}));
const mails = vi.hoisted(() => [] as Array<{ to: string | string[]; subject: string }>);
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendCustomerMail: vi.fn(async (o: { to: string | string[]; subject: string }) => {
    mails.push({ to: o.to, subject: o.subject });
    return { ok: true };
  }),
}));
vi.mock("@/lib/calendar/lead-email", () => ({ sendLeadEmail: vi.fn(async () => ({ sent: true })) }));
vi.mock("@/lib/lead-progress", () => ({ recordLeadProgress: vi.fn(async () => {}) }));

import { prisma } from "@/lib/prisma";
import { suggestSlots } from "@/lib/calendar";
import { appKalenderPruefen } from "@/lib/calendar/app-kalender";
import { loadSources, ohneOnlineKalenderEinschalten, removeIcsLink } from "@/lib/calendar/sources";
import { loadCalendarSetup } from "@/lib/calendar/setup-view";
import { terminAdresseFuer, verarbeiteTerminMail } from "@/lib/calendar/termin-weiterleitung-server";
import { parseTerminAdresse } from "@/lib/calendar/termin-weiterleitung";
import { addDaysYmd, berlinYmd, weekdayOfYmd } from "@/lib/absence";
import { berlinAt } from "@/lib/calendar/lead-times";
import type { EingangApi } from "@/lib/mail/eingang-api";
import { POST } from "@/app/api/ops/aktion/route";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const today = berlinYmd(new Date());
function workday(n: number): string {
  let d = addDaysYmd(today, n);
  while (weekdayOfYmd(d) === 0 || weekdayOfYmd(d) === 6) d = addDaysYmd(d, 1);
  return d;
}
const icsZeit = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const einladung = (uid: string, start: Date, end: Date) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "SEQUENCE:0",
    `DTSTART:${icsZeit(start)}`,
    `DTEND:${icsZeit(end)}`,
    "SUMMARY:Arzt",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

/** Resend-Eingang nachgebildet: Kalenderdaten im Text der Mail. */
const fakeApi = (text: string) =>
  ({
    mail: async (id: string) => ({ id, from: "vertreter@extern-test.de", to: [], subject: "WG: Arzt", text, html: null, headers: {}, authentication: null, rawUrl: null }),
    anhaenge: async () => [],
    anhang: async () => null,
    datei: async () => Buffer.from(""),
  }) as unknown as EingangApi;

const ids: string[] = [];
async function neuerKunde() {
  const c = await makeCustomer();
  ids.push(c.id);
  await makeBuyer(c.id, "owner");
  return c;
}

const TOKEN = "o".repeat(40);

describe("Ohne Online-Kalender", () => {
  beforeAll(() => {
    requireTestDb();
    process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_test";
    process.env.OPS_ACTION_TOKEN = TOKEN;
  });
  beforeEach(() => {
    pushes.length = 0;
    mails.length = 0;
  });
  afterAll(async () => {
    for (const id of ids) {
      await prisma.mailEingang.deleteMany({ where: { customerId: id } });
      await prisma.kalenderWeiterleitung.deleteMany({ where: { customerId: id } });
      await prisma.calendarBlock.deleteMany({ where: { customerId: id } });
      await prisma.appointment.deleteMany({ where: { customerId: id } });
      await prisma.calendarConnection.deleteMany({ where: { customerId: id } });
      await cleanupCustomer(id);
    }
  });

  it("Auswahl schaltet den App-Kalender ein, und er bleibt an (auch ohne Allianz und ohne Kalender-Link)", async () => {
    const c = await neuerKunde();
    const r = await ohneOnlineKalenderEinschalten(c.id);
    expect(r.ok).toBe(true);
    const conn = await prisma.calendarConnection.findUnique({ where: { customerId: c.id } });
    expect(conn).toMatchObject({ provider: "app", status: "connected" });
    expect((await loadSources(c.id)).ohneOnlineKalender).toBe(true);

    await appKalenderPruefen(c.id);
    await removeIcsLink(c.id); // ruft appKalenderPruefen
    expect((await prisma.calendarConnection.findUnique({ where: { customerId: c.id } }))?.status).toBe("connected");

    const setup = await loadCalendarSetup(c.id, c.id);
    expect(setup.status.ohneOnlineKalender).toBe(true);
    expect(setup.status.native.app).toBe(true);
    expect(setup.source).toBe("ohne");
    expect(setup.beratungszeiten).toBe("Mo bis Fr, 10 bis 17 Uhr");
    expect(setup.einladungAn).toMatch(/@test\.local$/);
  });

  it("ohne die Wahl schaltet appKalenderPruefen weiterhin ab (Allianz-Weg unverändert)", async () => {
    const c = await neuerKunde();
    await prisma.calendarConnection.create({ data: { customerId: c.id, provider: "app", status: "connected" } });
    await appKalenderPruefen(c.id);
    expect((await prisma.calendarConnection.findUnique({ where: { customerId: c.id } }))?.status).toBe("pending");
  });

  it("verbundener Google-Kalender bleibt unangetastet", async () => {
    const c = await neuerKunde();
    await prisma.calendarConnection.create({ data: { customerId: c.id, provider: "google", status: "connected" } });
    const r = await ohneOnlineKalenderEinschalten(c.id);
    expect(r.error).toMatch(/schon verbunden/);
    expect((await prisma.calendarConnection.findUnique({ where: { customerId: c.id } }))?.provider).toBe("google");
    expect((await loadSources(c.id)).ohneOnlineKalender).toBe(false);
  });

  it("freie Zeiten aus den Beratungszeiten; weitergeleiteter Termin blockiert; Überschneidung meldet Push", async () => {
    const c = await neuerKunde();
    await ohneOnlineKalenderEinschalten(c.id);
    const tag = workday(3);
    const von = berlinAt(tag, "00:00");

    // Beratungszeiten (Standard Mo bis Fr, 10 bis 17 Uhr, stündlich, 30 Min.)
    const frei = await suggestSlots(c.id, 30, 20, "lead", 1, null, von);
    expect(frei.map((s) => s.start)).toEqual(["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"].map((t) => berlinAt(tag, t).toISOString()));

    // Gebuchter Lead-Termin um 11 Uhr (App-Kalender: belegt)
    const lead = await prisma.lead.create({ data: { customerId: c.id, name: "Erika Muster", phone: "+491701234567" } });
    await prisma.appointment.create({
      data: { customerId: c.id, leadId: lead.id, startsAt: berlinAt(tag, "11:00"), endsAt: berlinAt(tag, "11:30"), status: "booked", mode: "video", calendarEventId: "app:x@terminbuchung" },
    });

    // Eigener Termin 10:15 bis 12:00 per Weiterleitung an die Termin-Adresse
    const adresse = await terminAdresseFuer(c.id, c.id);
    const token = parseTerminAdresse(adresse)!;
    const eingang = await prisma.mailEingang.create({ data: { resendEmailId: `test-${token}`, customerId: c.id, zuordnung: "termin" } });
    const r = await verarbeiteTerminMail({
      eingangId: eingang.id,
      emailId: "mail-1",
      token,
      now: new Date(),
      api: fakeApi(einladung("arzt-123@extern-test.de", berlinAt(tag, "10:15"), berlinAt(tag, "12:00"))),
      zeile: { weitergeleitetAt: null, pushAt: null },
    });
    expect(r.ergebnis).toBe("termin");
    const block = await prisma.calendarBlock.findFirst({ where: { customerId: c.id, quelle: "weitergeleitet" } });
    expect(block?.startsAt.toISOString()).toBe(berlinAt(tag, "10:15").toISOString());

    // Überschneidung mit dem gebuchten Termin: Push an den Vermittler, ganz ohne Allianz
    const push = pushes.find((p) => p.tag.startsWith("termin-ueberschneidung:"));
    expect(push).toBeTruthy();
    expect(push!.url).toBe(`/buyer/leads/${lead.id}`);

    // 10 und 11 Uhr belegt (eigener Termin bzw. gebuchter Lead-Termin), Rest frei
    const danach = await suggestSlots(c.id, 30, 20, "lead", 1, null, von);
    expect(danach.map((s) => s.start)).toEqual(["12:00", "13:00", "14:00", "15:00", "16:00"].map((t) => berlinAt(tag, t).toISOString()));
  });

  it("Ops-Aktion app_kalender_einschalten stellt einen Kunden um, mit Audit-Eintrag", async () => {
    const c = await neuerKunde();
    const req = (body: unknown) =>
      new Request("http://x/api/ops/aktion", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) });
    expect((await POST(req({ aktion: "app_kalender_einschalten", customerId: "gibt-es-nicht" }))).status).toBe(400);
    const res = await POST(req({ aktion: "app_kalender_einschalten", customerId: c.id }));
    expect(res.status).toBe(200);
    expect((await res.json()).info).toMatch(/termine-[a-z2-7]{20}@/);
    expect(await prisma.calendarConnection.findUnique({ where: { customerId: c.id } })).toMatchObject({ provider: "app", status: "connected" });
    await appKalenderPruefen(c.id);
    expect((await prisma.calendarConnection.findUnique({ where: { customerId: c.id } }))?.status).toBe("connected");
    const log = await prisma.auditLog.findFirst({ where: { customerId: c.id, action: "calendar.ohne_online_kalender" } });
    expect(log?.actorEmail).toBe("ops-aktion (Claude)");
  });
});
