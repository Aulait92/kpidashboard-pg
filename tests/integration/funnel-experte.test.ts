// Dankeseite „Dein Experte“ (Ole, 21.11.2026): nur bei Vermittlern, nicht bei Leadbrokern wie HvK
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { experteFuer } from "@/lib/funnel/server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ids: string[] = [];
async function leadBei(status: string | null) {
  const c = await makeCustomer();
  ids.push(c.id);
  await prisma.customer.update({ where: { id: c.id }, data: { vermittlerRegisterStatus: status } });
  await prisma.erstinformation.create({ data: { customerId: c.id, token: `fx${Date.now()}${Math.random().toString(36).slice(2, 8)}`, name: "Max Berater", firma: "Novus Test GmbH", telefon: "030 1" } });
  return (await prisma.lead.create({ data: { customerId: c.id, name: "Lead" } })).id;
}

describe("Funnel: Experte auf der Dankeseite", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of ids) {
      await prisma.lead.deleteMany({ where: { customerId: id } });
      await cleanupCustomer(id);
    }
  });
  it("Vermittler: Experte bekannt; Leadbroker (kein Vermittler): kein Experte", async () => {
    expect((await experteFuer(await leadBei("makler")))?.name).toBe("Max Berater");
    expect(await experteFuer(await leadBei("keiner"))).toBeNull();
  });
});
