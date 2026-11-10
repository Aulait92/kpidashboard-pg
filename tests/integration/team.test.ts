import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { assignLead, leadScope } from "@/lib/team";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

describe("Team: gleichmäßige Lead-Verteilung", () => {
  let customerId = "";
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    await prisma.lead.deleteMany({ where: { customerId } });
    await prisma.user.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });

  it("ein Login: keine Zuteilung", async () => {
    const c = await makeCustomer();
    customerId = c.id;
    await makeBuyer(c.id, "owner");
    const lead = await prisma.lead.create({ data: { customerId: c.id, name: "A" } });
    expect(await assignLead(lead.id)).toBeNull();
  });

  it("drei Personen: reihum, jeder gleich oft", async () => {
    await makeBuyer(customerId, "advisor");
    await makeBuyer(customerId, "advisor");
    const counts = new Map<string, number>();
    for (let i = 0; i < 9; i++) {
      const lead = await prisma.lead.create({ data: { customerId, name: `L${i}` } });
      const who = await assignLead(lead.id);
      expect(who).not.toBeNull();
      counts.set(who!, (counts.get(who!) ?? 0) + 1);
    }
    expect([...counts.values()].sort()).toEqual([3, 3, 3]);
  });

  it("wer keine Leads bekommt, wird übersprungen", async () => {
    const users = await prisma.user.findMany({ where: { customerId }, orderBy: { createdAt: "asc" } });
    await prisma.user.update({ where: { id: users[2].id }, data: { receivesLeads: false } });
    for (let i = 0; i < 4; i++) {
      const lead = await prisma.lead.create({ data: { customerId, name: `M${i}` } });
      expect(await assignLead(lead.id)).not.toBe(users[2].id);
    }
  });

  it("bereits zugeteilte Leads bleiben beim Zuständigen", async () => {
    const lead = await prisma.lead.findFirst({ where: { customerId, assignedUserId: { not: null } } });
    expect(await assignLead(lead!.id)).toBe(lead!.assignedUserId);
  });

  it("Berater sieht nur seine Leads, Inhaber alle", async () => {
    const advisor = await prisma.user.findFirst({ where: { customerId, teamRole: "advisor" } });
    const all = await prisma.lead.count({ where: leadScope({ customerId, userId: null, teamRole: "owner" }) });
    const own = await prisma.lead.count({ where: leadScope({ customerId, userId: advisor!.id, teamRole: "advisor" }) });
    const assigned = await prisma.lead.count({ where: { customerId, assignedUserId: advisor!.id } });
    expect(own).toBe(assigned);
    expect(own).toBeLessThan(all);
  });
});
