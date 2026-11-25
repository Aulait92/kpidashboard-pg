import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadAdminHeute } from "@/lib/admin-heute";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

// Ole, 25.11.2026: Testkunden (isTest) erscheinen nicht in „Heute“ im Admin.
describe("Admin Heute ohne Testkunden", () => {
  let echt = "";
  let test = "";
  beforeAll(async () => {
    requireTestDb();
    echt = (await makeCustomer()).id;
    test = (await makeCustomer()).id;
    await prisma.customer.update({ where: { id: test }, data: { isTest: true, bestandRequestedAt: new Date(), existingCustomersEnabled: false } });
    await prisma.customer.update({ where: { id: echt }, data: { bestandRequestedAt: new Date(), existingCustomersEnabled: false } });
  });
  afterAll(async () => {
    await cleanupCustomer(echt);
    await cleanupCustomer(test);
  });
  it("zeigt die Anfrage des echten Kunden, nicht die des Testkunden", async () => {
    const { items } = await loadAdminHeute();
    const keys = items.map((i) => i.key);
    expect(keys).toContain(`modul:${echt}`);
    expect(keys).not.toContain(`modul:${test}`);
    expect(items.some((i) => i.action.href.includes(`/kunden/${test}`))).toBe(false);
  });
});
