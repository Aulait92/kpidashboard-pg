// Löschfrist 24 Monate für Leads ohne Abschluss (Ole, 20.11.2026)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { faelligeLeads, leadLoeschfrist, loeschStichtag } from "@/lib/lead-loeschfrist";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ids: string[] = [];
const alt = new Date("2023-01-10T10:00:00Z");
const now = new Date("2026-11-20T03:00:00Z");

describe("Lead-Löschfrist", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of ids) await cleanupCustomer(id);
  });

  it("Stichtag 24 Monate", () => {
    expect(loeschStichtag(now).toISOString()).toBe("2024-11-20T03:00:00.000Z");
  });

  it("alt ohne Abschluss: anonymisiert; Abschluss, frischer Chat und Testlead bleiben", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    const mk = (data: Record<string, unknown>) =>
      prisma.lead.create({ data: { customerId: c.id, name: "Max Alt", phone: `49170${Math.floor(Math.random() * 1e7)}`, createdAt: alt, statusChangedAt: alt, ...data } });
    const faellig = await mk({ status: "Kein Interesse" });
    const abschluss = await mk({ status: "Abschluss" });
    const test = await mk({ isTest: true });
    const frisch = await mk({});
    await prisma.conversation.create({ data: { customerId: c.id, leadId: frisch.id, contactPhone: frisch.phone!, lastMessageAt: new Date("2025-06-01T10:00:00Z") } });
    const neu = await mk({ createdAt: new Date("2025-01-01T00:00:00Z"), statusChangedAt: new Date("2025-01-01T00:00:00Z") });

    const ids2 = await faelligeLeads(now);
    expect(ids2).toContain(faellig.id);
    for (const l of [abschluss, test, frisch, neu]) expect(ids2).not.toContain(l.id);

    const r = await leadLoeschfrist(now);
    expect(r.geloescht).toBeGreaterThanOrEqual(1);
    const nach = await prisma.lead.findUnique({ where: { id: faellig.id }, select: { erasedAt: true, phone: true } });
    expect(nach?.erasedAt).not.toBeNull();
    expect(nach?.phone).toBeNull();
    expect((await prisma.lead.findUnique({ where: { id: abschluss.id }, select: { erasedAt: true } }))?.erasedAt).toBeNull();
  });
});
