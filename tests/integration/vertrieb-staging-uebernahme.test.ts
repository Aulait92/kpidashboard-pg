import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { replaceFromColdCrm } from "@/lib/vertrieb/cold-crm-import";
import { makeCustomer, cleanupCustomer, requireTestDb } from "./db";

// Livegang: Vertrieb aus der Testumgebung übernehmen. Die Quelle wird als Schema
// „stagingsrc“ mit denselben „Sales…“-Tabellen nachgebaut.
const TABLES = ["SalesContact", "SalesCampaign", "SalesActivity", "SalesTask", "SalesCampaignLead", "SalesEmail", "SalesLinkedInEvent", "SalesMeeting", "SalesInboundLead"];

describe("Vertrieb: Übernahme aus der Testumgebung", () => {
  const env = { ...process.env };
  const backups: string[] = [];
  let stagingCustomer = "";

  beforeAll(async () => {
    requireTestDb();
    stagingCustomer = (await makeCustomer()).id;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS stagingsrc CASCADE`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA stagingsrc`);
    for (const t of TABLES) await prisma.$executeRawUnsafe(`CREATE TABLE stagingsrc."${t}" (LIKE public."${t}" INCLUDING DEFAULTS)`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO stagingsrc."SalesContact"(id, name, email, stage, "customerStage", "customerId", "updatedAt", "createdAt") VALUES ('st-a','Andy Test','st-a@example.com','GEWONNEN','VERTRAG','${stagingCustomer}',now(),now())`,
    );
    await prisma.$executeRawUnsafe(`INSERT INTO stagingsrc."SalesTask"(id, "contactId", title, "dueAt") VALUES ('st-t','st-a','Rechnung prüfen', now())`);
    const base = (process.env.DATABASE_URL ?? "").replace(/\?.*$/, "");
    process.env.VERTRIEB_QUELLE_URL = `${base}?options=-c%20search_path%3Dstagingsrc`;
    process.env.VERTRIEB_NEUIMPORT_ERLAUBT = "1";
  });

  afterAll(async () => {
    process.env = env;
    for (const b of backups) await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${b}" CASCADE`);
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS stagingsrc CASCADE`);
    await prisma.salesContact.deleteMany({ where: { id: { startsWith: "st-" } } });
    await cleanupCustomer(stagingCustomer);
  });

  it("übernimmt Kontakte und Aufgaben, löst die Verknüpfung zur Kundenakte", async () => {
    const { backup, report } = await replaceFromColdCrm(new Date("2026-11-21T08:00:00Z"), "staging");
    backups.push(backup);
    const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: "st-a" }, select: { name: true, customerId: true, customerStage: true } });
    expect(c).toEqual({ name: "Andy Test", customerId: null, customerStage: "VERTRAG" });
    expect(await prisma.salesTask.count({ where: { contactId: "st-a" } })).toBe(1);
    expect(report.find((r) => r.table === "SalesContact")).toMatchObject({ source: 1, inserted: 1 });
  });
});
