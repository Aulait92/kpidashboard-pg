// Show-up-Paket (Ole, 17.11.2026): Anrufplan startet 30 Min. nach dem Erstanschreiben ohne Antwort (Geschäftszeiten),
// endet, wenn der Lead im Chat antwortet. Nachrichtenplan je Lead aus der Datenbank. Push simuliert.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { anrufplanBeiAntwortStoppen, runAntwortAusloeser } from "@/lib/anruf-ausloeser-server";
import { loadNachrichtenPlan } from "@/lib/nachrichtenplan-server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const MIN = 60 * 1000;
// Di 17.11.2026, 11:00 Berlin (Standard-Verfügbarkeit Mo bis Fr 10 bis 16:30)
const T = new Date("2026-11-17T10:00:00.000Z");

describe("Show-up: Anrufplan nach dem Erstanschreiben und Nachrichtenplan", () => {
  let customerId = "";
  let n = 0;
  const push = vi.fn(async () => null);
  const lead = async (extra: Record<string, unknown> = {}) =>
    prisma.lead.create({
      data: {
        customerId,
        name: "Anna Becker",
        phone: `49151555${String(++n).padStart(4, "0")}`,
        status: "Neuer Lead",
        formData: [{ label: "Anrede", value: "Frau" }],
        outreachAt: new Date(T.getTime() - 40 * MIN),
        outreachStatus: "sent",
        ...extra,
      },
    });

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ name: "Agentur Ole Kannapinn" })).id;
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => push.mockClear());

  it("ohne Antwort nach 30 Min.: „Anrufversuch 1 von 6“ auf Heute und Push mit Anruf-Link, genau einmal", async () => {
    const l = await lead();
    const zuFrueh = await lead({ outreachAt: new Date(T.getTime() - 10 * MIN) });
    await Promise.all([runAntwortAusloeser(T, { push }), runAntwortAusloeser(T, { push })]);
    const row = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(row.followUpNote).toBe("Anrufversuch 1 von 6");
    expect(row.followUpAt?.toISOString()).toBe(T.toISOString());
    expect(row.autoCallAt).not.toBeNull();
    const calls = (push.mock.calls as unknown as [unknown, string, { title: string; url: string }][]).filter((c) => c[2].url.includes(l.id));
    expect(calls).toHaveLength(1);
    expect(calls[0][2].title).toBe("Frau Becker hat noch nicht geantwortet. Jetzt anrufen?");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: zuFrueh.id } })).autoCallAt).toBeNull();
  });

  it("abends nicht, sondern am nächsten Morgen zu Arbeitsbeginn; nicht bei Antwort oder gebuchtem Termin", async () => {
    // Di 19:00 Berlin
    const abends = new Date("2026-11-17T18:00:00.000Z");
    const l = await lead({ outreachAt: new Date(abends.getTime() - 40 * MIN) });
    await runAntwortAusloeser(abends, { push });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).autoCallAt).toBeNull();
    // Mi 10:00 Berlin
    await runAntwortAusloeser(new Date("2026-11-18T09:00:00.000Z"), { push });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).followUpNote).toBe("Anrufversuch 1 von 6");

    const antwort = await lead();
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: antwort.phone!, leadId: antwort.id } });
    await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", body: "Hallo" } });
    const termin = await lead();
    await prisma.appointment.create({ data: { customerId, leadId: termin.id, mode: "video", startsAt: new Date(T.getTime() + 24 * 60 * MIN) } });
    await runAntwortAusloeser(T, { push });
    for (const x of [antwort, termin]) expect((await prisma.lead.findUniqueOrThrow({ where: { id: x.id } })).autoCallAt).toBeNull();
  });

  it("antwortet der Lead im Chat, endet der Anrufplan; eine eigene Wiedervorlage bleibt", async () => {
    const l = await lead({ followUpAt: T, followUpNote: "Anrufversuch 3 von 6" });
    expect(await anrufplanBeiAntwortStoppen(l.id)).toBe(true);
    const row = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(row.followUpAt).toBeNull();
    expect(row.followUpNote).toBeNull();
    const eigene = await lead({ followUpAt: T, followUpNote: "Angebot besprechen" });
    expect(await anrufplanBeiAntwortStoppen(eigene.id)).toBe(false);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: eigene.id } })).followUpNote).toBe("Angebot besprechen");
  });

  it("Nachrichtenplan aus der Datenbank: Termin mit Erinnerungen und Push, Vorschau mit Anrede", async () => {
    const l = await lead({ outreachStatus: "sent_booked" });
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: l.phone!, leadId: l.id, contactEmail: "anna@example.org" } });
    const start = new Date(Date.now() + 3 * 24 * 60 * MIN);
    await prisma.appointment.create({ data: { customerId, leadId: l.id, conversationId: conv.id, mode: "video", meetUrl: "https://meet.google.com/x", startsAt: start, createdAt: new Date() } });
    const plan = await loadNachrichtenPlan(l.id);
    expect(plan.map((e) => e.kanal)).toEqual(["whatsapp", "email", "whatsapp", "whatsapp", "push"]);
    expect(plan[0].vorschau.startsWith("Guten Tag Frau Becker, kurze Erinnerung an Ihren Termin morgen um")).toBe(true);
    expect(plan[1].vorschau).toMatch(/^Betreff: Morgen um \d+(:\d\d)? Uhr: Ihr Videotermin mit /);
    expect(await loadNachrichtenPlan("gibt-es-nicht")).toEqual([]);
  });
});
