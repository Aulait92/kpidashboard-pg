import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { needsNextStep } from "@/lib/lead-next-step";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

describe("Phase: seit wann und nächster Schritt", () => {
  let customerId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
  });
  afterAll(() => cleanupCustomer(customerId));

  it("setzt statusChangedAt nur bei echter Statusänderung (DB-Trigger)", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    const lead = await prisma.lead.create({ data: { customerId, status: "Neuer Lead", statusChangedAt: old } });
    await prisma.lead.update({ where: { id: lead.id }, data: { notes: "x", status: "Neuer Lead" } });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).statusChangedAt).toEqual(old);
    await prisma.lead.update({ where: { id: lead.id }, data: { status: "Im Gespräch" } });
    const after = (await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).statusChangedAt;
    expect(Date.now() - after.getTime()).toBeLessThan(60_000);
  });

  it("erkennt offene Leads ohne Wiedervorlage und Termin", () => {
    expect(needsNextStep({ status: "Im Gespräch" })).toBe(true);
    expect(needsNextStep({ status: "Im Gespräch", followUpAt: new Date() })).toBe(false);
    expect(needsNextStep({ status: "Im Gespräch", hasUpcomingAppointment: true })).toBe(false);
    expect(needsNextStep({ status: "Neuer Lead" })).toBe(false);
    expect(needsNextStep({ status: "Abschluss" })).toBe(false);
    expect(needsNextStep({ status: "Im Gespräch", erasedAt: new Date() })).toBe(false);
  });
});
