// Filter „Zuständig“ in Kontakte (Ole, 27.11.2026): nur Inhaber mit Team; Mitglied oder „ohne“.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ladeZustaendigFilter } from "@/lib/team";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

describe("Filter Zuständig", () => {
  let customerId = "";
  let ownerId = "";
  let advisorId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    ownerId = (await makeBuyer(customerId, "owner")).id;
    advisorId = (await makeBuyer(customerId, "advisor")).id;
    await prisma.lead.createMany({ data: [
      { customerId, name: "A", source: "Kfz", assignedUserId: advisorId },
      { customerId, name: "B", source: "Kfz", assignedUserId: null },
    ] });
  });
  afterAll(async () => cleanupCustomer(customerId));

  it("Inhaber: Mitglieder und „Niemand zugeteilt“, Filter wirkt", async () => {
    const owner = { customerId, userId: ownerId, teamRole: "owner" as const };
    const f = await ladeZustaendigFilter(owner, advisorId);
    expect(f.optionen.map((o) => o.value)).toEqual(expect.arrayContaining([ownerId, advisorId, "ohne"]));
    expect((await prisma.lead.findMany({ where: { customerId, ...f.where } })).map((l) => l.name)).toEqual(["A"]);
    const ohne = await ladeZustaendigFilter(owner, "ohne");
    expect((await prisma.lead.findMany({ where: { customerId, ...ohne.where } })).map((l) => l.name)).toEqual(["B"]);
    expect((await ladeZustaendigFilter(owner, "unbekannt")).where).toEqual({});
  });

  it("Berater sieht keinen Filter", async () => {
    expect((await ladeZustaendigFilter({ customerId, userId: advisorId, teamRole: "advisor" }, advisorId)).optionen).toEqual([]);
  });
});
