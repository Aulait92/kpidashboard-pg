// Stornoquote über alle Kunden ohne Testkunden (Fixes KPIDASHBOARD-PG-A: LeadContract hat keine Relation „customer“).
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { allStornoStats } from "@/lib/storno-quote";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ids: string[] = [];
beforeAll(() => requireTestDb());
afterEach(async () => {
  for (const id of ids.splice(0)) await cleanupCustomer(id);
});

async function contractFor(customerId: string) {
  const lead = await prisma.lead.create({ data: { customerId, name: "Vertrag", status: "Abschluss" } });
  await prisma.leadContract.create({ data: { leadId: lead.id, customerId, primaryLeadId: lead.id, sparte: "katze", premium: 400, signedAt: new Date() } });
}

describe("allStornoStats", () => {
  it("läuft ohne Fehler und lässt Testkunden weg", async () => {
    const echt = await makeCustomer();
    const test = await makeCustomer({ isTest: true });
    ids.push(echt.id, test.id);
    await contractFor(echt.id);
    await contractFor(test.id);
    const stats = await allStornoStats();
    const kunden = stats.byCustomer.map((r) => r.key);
    expect(kunden).toContain(echt.id);
    expect(kunden).not.toContain(test.id);
  });
});
