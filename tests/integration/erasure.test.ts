import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ERASED_NAME, eraseCustomerData, eraseLead } from "@/lib/erasure";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const actor = { id: "admin", email: "admin@test.local", role: "ADMIN" };

async function leadWithChat(customerId: string, phone: string) {
  const lead = await prisma.lead.create({
    data: { customerId, name: "Erika Muster", phone, email: "erika@test.local", formData: [{ label: "Beruf", value: "Lehrerin" }], notes: "ruft abends zurück", status: "Termin vereinbart" },
  });
  await prisma.revenue.create({ data: { customerId, leadId: lead.id, amount: 50 } });
  const conv = await prisma.conversation.create({ data: { customerId, leadId: lead.id, contactPhone: phone, contactName: "Erika" } });
  await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", body: "Hallo" } });
  await prisma.appointment.create({ data: { customerId, leadId: lead.id, conversationId: conv.id, mode: "phone", startsAt: new Date() } });
  await prisma.consentOptIn.create({ data: { customerId, contactPhone: phone, grantedAt: new Date() } });
  return lead;
}

describe("Datenschutz-Löschung", () => {
  let customerId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });

  it("anonymisiert einen Lead, löscht Chat, Termin und Einwilligung, Umsatz bleibt", async () => {
    const lead = await leadWithChat(customerId, "4915100000001");
    const other = await leadWithChat(customerId, "4915100000002");
    const r = await eraseLead(lead.id, actor);
    expect(r).toEqual({ conversations: 1, messages: 1, appointments: 1, consents: 1 });

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.name).toBe(ERASED_NAME);
    expect([after.phone, after.email, after.formData, after.notes]).toEqual([null, null, null, null]);
    expect(after.erasedAt).not.toBeNull();
    expect(after.status).toBe("Termin vereinbart");
    expect(await prisma.revenue.count({ where: { leadId: lead.id } })).toBe(1);
    expect(await prisma.conversation.count({ where: { contactPhone: "4915100000001" } })).toBe(0);
    expect(await prisma.consentOptIn.count({ where: { customerId, contactPhone: "4915100000001" } })).toBe(0);

    // Der andere Lead bleibt unberührt.
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: other.id } })).phone).toBe("4915100000002");
    expect(await prisma.conversation.count({ where: { leadId: other.id } })).toBe(1);

    // Protokoll ohne Namen/Telefon.
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "lead.erase", entityId: lead.id } });
    expect(JSON.stringify(log.details)).not.toContain("4915100000001");
    expect(JSON.stringify(log.details)).not.toContain("Erika");
  });

  it("löscht bei Vertragsende alle Lead-Daten des Kunden", async () => {
    await prisma.conversation.create({ data: { customerId, contactPhone: "4915100000009" } });
    const r = await eraseCustomerData(customerId, actor);
    expect(r.leads).toBe(2);
    expect(await prisma.lead.count({ where: { customerId, phone: { not: null } } })).toBe(0);
    expect(await prisma.conversation.count({ where: { customerId } })).toBe(0);
    expect(await prisma.appointment.count({ where: { customerId } })).toBe(0);
    expect(await prisma.revenue.count({ where: { customerId } })).toBe(2);
  });
});

describe("Löschfristen für Hilfsdaten", () => {
  it("löscht alte nicht zugeordnete Leads, behält frische", async () => {
    const { pruneTransient } = await import("@/lib/erasure");
    const day = 24 * 60 * 60 * 1000;
    const tag = Math.random().toString(36).slice(2);
    const old = await prisma.unassignedLead.create({ data: { via: "meta", payload: {}, formId: tag, createdAt: new Date(Date.now() - 100 * day) } });
    const done = await prisma.unassignedLead.create({ data: { via: "meta", payload: {}, formId: tag, resolvedAt: new Date(Date.now() - 40 * day) } });
    const fresh = await prisma.unassignedLead.create({ data: { via: "meta", payload: {}, formId: tag } });
    await pruneTransient();
    const left = await prisma.unassignedLead.findMany({ where: { formId: tag }, select: { id: true } });
    expect(left.map((l) => l.id)).toEqual([fresh.id]);
    expect([old.id, done.id]).not.toContain(left[0].id);
    await prisma.unassignedLead.deleteMany({ where: { formId: tag } });
  });

  it("löscht Abwesenheiten 1 Jahr nach ihrem Ende, behält jüngere", async () => {
    const { pruneTransient } = await import("@/lib/erasure");
    const day = 24 * 60 * 60 * 1000;
    const c = await makeCustomer();
    const u = await makeBuyer(c.id, "owner");
    const now = Date.now();
    const mk = (startDays: number, endDays: number, endedDays?: number) =>
      prisma.userAbsence.create({
        data: {
          userId: u.id,
          customerId: c.id,
          kind: "krank",
          startsAt: new Date(now - startDays * day),
          endsAt: new Date(now - endDays * day),
          endedAt: endedDays != null ? new Date(now - endedDays * day) : null,
        },
      });
    const old = await mk(400, 380);
    const earlyEnded = await mk(380, 300, 370); // geplant bis vor 300 Tagen, vorzeitig beendet vor 370 Tagen
    const recent = await mk(200, 190);
    await pruneTransient();
    const left = (await prisma.userAbsence.findMany({ where: { customerId: c.id }, select: { id: true } })).map((a) => a.id);
    expect(left).toEqual([recent.id]);
    expect(left).not.toContain(old.id);
    expect(left).not.toContain(earlyEnded.id);
    await cleanupCustomer(c.id);
  });
});
