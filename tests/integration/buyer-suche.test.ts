import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { searchBuyer } from "@/lib/buyer-search";
import type { TeamCtx } from "@/lib/team";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

// Schnellsuche im Kundenbereich (Strg+K): Rechte über leadScope/conversationScope.
describe("Schnellsuche Kundenbereich", () => {
  let customerId = "";
  let otherCustomerId = "";
  let owner: TeamCtx;
  let advisorA: TeamCtx;
  let advisorB: TeamCtx;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    requireTestDb();
    const c = await makeCustomer({ existingCustomersEnabled: true });
    const other = await makeCustomer();
    customerId = c.id;
    otherCustomerId = other.id;
    const o = await makeBuyer(c.id, "owner");
    const a = await makeBuyer(c.id, "advisor");
    const b = await makeBuyer(c.id, "advisor");
    owner = { customerId, userId: o.id, teamRole: "owner" };
    advisorA = { customerId, userId: a.id, teamRole: "advisor" };
    advisorB = { customerId, userId: b.id, teamRole: "advisor" };
    ids.leadA = (await prisma.lead.create({ data: { customerId, name: "Erika Suchtest", phone: "4915112345678", email: "erika@example.org", assignedUserId: a.id } })).id;
    ids.leadB = (await prisma.lead.create({ data: { customerId, name: "Hans Suchtest", phone: "4917099887766", assignedUserId: b.id } })).id;
    ids.leadFree = (await prisma.lead.create({ data: { customerId, name: "Offen Suchtest" } })).id;
    ids.leadOther = (await prisma.lead.create({ data: { customerId: otherCustomerId, name: "Fremd Suchtest", phone: "4915112345678" } })).id;
    ids.bestand = (await prisma.existingCustomer.create({ data: { customerId, firstName: "Berta", lastName: "Suchtest", phone: "4916055544433" } })).id;
    await prisma.agentConfig.create({ data: { customerId, active: true } });
    ids.chatA = (await prisma.conversation.create({ data: { customerId, leadId: ids.leadA, contactPhone: "4915112345678", contactName: "Erika Suchtest" } })).id;
    ids.chatB = (await prisma.conversation.create({ data: { customerId, leadId: ids.leadB, contactPhone: "4917099887766", contactName: "Hans Suchtest" } })).id;
  });

  afterAll(async () => {
    await prisma.conversation.deleteMany({ where: { customerId } });
    await prisma.existingCustomer.deleteMany({ where: { customerId } });
    await prisma.lead.deleteMany({ where: { customerId: { in: [customerId, otherCustomerId] } } });
    await prisma.user.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
    await cleanupCustomer(otherCustomerId);
  });

  const keys = async (ctx: TeamCtx, q: string) =>
    (await searchBuyer(ctx, q, { newUi: true })).map((h) => `${h.kind}:${h.id}`).sort();

  it("Inhaber findet alle Kontakte, Bestandskunden und Chats des eigenen Kunden", async () => {
    expect(await keys(owner, "suchtest")).toEqual(
      [`kontakt:${ids.leadA}`, `kontakt:${ids.leadB}`, `kontakt:${ids.leadFree}`, `bestand:${ids.bestand}`, `chat:${ids.chatA}`, `chat:${ids.chatB}`].sort(),
    );
  });

  it("Berater findet nur eigene Kontakte und Chats, keinen Bestand", async () => {
    expect(await keys(advisorA, "suchtest")).toEqual([`kontakt:${ids.leadA}`, `chat:${ids.chatA}`].sort());
    expect(await keys(advisorB, "suchtest")).toEqual([`kontakt:${ids.leadB}`, `chat:${ids.chatB}`].sort());
    // Auch per Telefonnummer kein fremder Kontakt
    expect(await keys(advisorB, "0151 1234 5678")).toEqual([]);
  });

  it("Telefon in jeder Schreibweise, nie Kontakte anderer Kunden", async () => {
    for (const q of ["0151 1234 5678", "015112345678", "+49 151 12345678", "0049 151 12345678", "4915112345678", "12345678"]) {
      expect(await keys(owner, q), q).toEqual([`kontakt:${ids.leadA}`, `chat:${ids.chatA}`].sort());
    }
  });

  it("Linkziel je Oberfläche, unter 2 Zeichen nichts", async () => {
    const [neu] = await searchBuyer(advisorA, "erika@", { newUi: true });
    const [alt] = await searchBuyer(advisorA, "erika@", { newUi: false });
    expect(neu.href).toBe(`/buyer/kontakte/${ids.leadA}`);
    expect(alt.href).toBe(`/buyer/leads/${ids.leadA}`);
    expect(await searchBuyer(owner, "s", { newUi: true })).toEqual([]);
  });

  it("Bestand nur mit gebuchtem Modul", async () => {
    await prisma.customer.update({ where: { id: customerId }, data: { existingCustomersEnabled: false } });
    expect((await keys(owner, "berta")).length).toBe(0);
    await prisma.customer.update({ where: { id: customerId }, data: { existingCustomersEnabled: true } });
    expect(await keys(owner, "berta")).toEqual([`bestand:${ids.bestand}`]);
  });
});
