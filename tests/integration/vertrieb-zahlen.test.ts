import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadVertriebZahlen } from "@/lib/vertrieb-zahlen";
import { requireTestDb } from "./db";

// Tab „Vertrieb“: Trichter für einen Zeitraum + Listen („Woraus besteht das?“).
// Weit in der Zukunft, damit andere Testdaten nicht mitzählen.
const NOW = new Date("2031-03-10T12:00:00Z");
const d = (s: string) => new Date(`${s}T12:00:00Z`);
const uid = () => Math.random().toString(36).slice(2, 8);

describe("Vertrieb-Zahlen mit Zeitraum", () => {
  const contactIds: string[] = [];
  const offerIds: string[] = [];

  beforeAll(async () => {
    requireTestDb();
    const a = await prisma.salesContact.create({ data: { name: "Agentur Alpha", email: `vz-a-${uid()}@example.test` } });
    const b = await prisma.salesContact.create({ data: { name: "Agentur Beta", email: `vz-b-${uid()}@example.test` } });
    contactIds.push(a.id, b.id);
    // Februar 2031 = „Letzter Monat“
    await prisma.salesActivity.create({ data: { contactId: a.id, type: "ANRUF", occurredAt: d("2031-02-03") } });
    await prisma.salesEmail.create({ data: { contactId: b.id, direction: "OUT", campaign: "Kampagne", sentAt: d("2031-02-04") } });
    await prisma.salesEmail.create({ data: { contactId: a.id, direction: "IN", sentAt: d("2031-02-05"), subject: "Gern", sentiment: "POSITIV" } });
    await prisma.salesEmail.create({ data: { contactId: b.id, direction: "IN", sentAt: d("2031-02-05"), isAutoReply: true } });
    await prisma.salesMeeting.create({ data: { contactId: a.id, title: "Erstgespräch", startAt: d("2031-02-10") } });
    await prisma.salesMeeting.create({ data: { contactId: b.id, title: "Erstgespräch", startAt: d("2031-02-11"), status: "ABGESAGT" } });
    // außerhalb des Zeitraums
    await prisma.salesMeeting.create({ data: { contactId: b.id, title: "Erstgespräch", startAt: d("2031-03-02") } });
    const base = { contactName: "X", term: "12m", products: [], setupFee: 1990, monthlyFee: 1000, softwareFee: 349, validUntil: d("2031-12-31") };
    const n1 = uid();
    const n2 = uid();
    const o1 = await prisma.offer.create({ data: { ...base, number: `VZ-${n1}`, token: `vz-${n1}`, company: "Agentur Alpha", salesContactId: a.id, status: "accepted", sentAt: d("2031-02-12"), acceptedAt: d("2031-02-14") } });
    const o2 = await prisma.offer.create({ data: { ...base, number: `VZ-${n2}`, token: `vz-${n2}`, salesContactId: b.id, status: "sent", sentAt: d("2031-02-20") } });
    offerIds.push(o1.id, o2.id);
  });

  afterAll(async () => {
    await prisma.offer.deleteMany({ where: { id: { in: offerIds } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contactIds } } });
  });

  it("zählt je Stufe im Zeitraum und listet die Einträge", async () => {
    const v = await loadVertriebZahlen("vormonat", NOW);
    expect(v.range).toBe("vormonat");
    const by = Object.fromEntries(v.steps.map((s) => [s.key, s]));
    expect(by.contacted.v).toBe(2);
    expect(by.replied.v).toBe(1); // Abwesenheitsnotiz zählt nicht
    expect(by.replied.rows[0]).toMatchObject({ name: "Agentur Alpha", status: "positiv" });
    expect(by.meetings.v).toBe(1); // abgesagter Termin zählt nicht …
    expect(by.meetings.rows).toHaveLength(2); // … steht aber ausgegraut in der Liste
    expect(by.meetings.rows.find((r) => r.muted)?.status).toBe("abgesagt");
    expect(by.offers.v).toBe(2);
    expect(by.won.v).toBe(1);
    expect(by.won.rows[0].href).toBe(`/admin/vertrieb/kontakte/${contactIds[0]}`);
    expect(v.winRate).toBe(0.5);
    expect(v.acceptedOfSent).toBe(1);
  });

  it("anderer Zeitraum: dieser Monat", async () => {
    const v = await loadVertriebZahlen("monat", NOW);
    const by = Object.fromEntries(v.steps.map((s) => [s.key, s]));
    expect(by.meetings.v).toBe(1);
    expect(by.offers.v).toBe(0);
    expect(v.winRate).toBeNull();
  });
});
