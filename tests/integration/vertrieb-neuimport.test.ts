import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { replaceFromColdCrm } from "@/lib/vertrieb/cold-crm-import";
import { requireTestDb } from "./db";

// Neu-Import aus dem eingefrorenen Cold CRM: Die Quelle wird als eigenes Schema
// „coldsrc“ in der Test-DB nachgebaut (Tabellennamen wie im alten CRM).
const SRC: [string, string][] = [
  ["Contact", "SalesContact"],
  ["Campaign", "SalesCampaign"],
  ["Activity", "SalesActivity"],
  ["Task", "SalesTask"],
  ["CampaignLead", "SalesCampaignLead"],
  ["EmailMessage", "SalesEmail"],
  ["LinkedInEvent", "SalesLinkedInEvent"],
  ["Meeting", "SalesMeeting"],
  ["InboundLead", "SalesInboundLead"],
];

describe("Vertrieb: Neu-Import aus dem Cold CRM", () => {
  const env = { ...process.env };
  const backups: string[] = [];

  beforeAll(async () => {
    requireTestDb();
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS coldsrc CASCADE`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA coldsrc`);
    for (const [from, to] of SRC) await prisma.$executeRawUnsafe(`CREATE TABLE coldsrc."${from}" (LIKE public."${to}" INCLUDING DEFAULTS)`);
    // Quelle: Kontakt a1 hat sich im alten CRM geändert, b1 ist neu
    await prisma.$executeRawUnsafe(
      `INSERT INTO coldsrc."Contact"(id, name, email, stage, "updatedAt", "createdAt") VALUES ('nx-a1','Agentur Alt (neu)','nx-a1@example.com','INTERESSE',now(),now()), ('nx-b1','Agentur Neu','nx-b1@example.com','NEU',now(),now())`,
    );
    await prisma.$executeRawUnsafe(`INSERT INTO coldsrc."Task"(id, "contactId", title, "dueAt") VALUES ('nx-t1','nx-a1','Nachfassen', now())`);

    // Hier (Testumgebung): veralteter Stand von a1 mit Angebot + reiner Testkontakt
    await prisma.salesContact.create({ data: { id: "nx-a1", name: "Agentur Alt", email: "nx-a1@example.com", stage: "NEU" } });
    await prisma.salesContact.create({ data: { id: "nx-test", name: "Testkontakt", email: "nx-test@example.com" } });
    await prisma.offer.create({
      data: { number: "NX-1", token: "nx-tok", contactName: "Test", term: "12 Monate", products: [], setupFee: 0, monthlyFee: 1, softwareFee: 0, validUntil: new Date(Date.now() + 864e5), salesContactId: "nx-test" },
    });

    const base = (process.env.DATABASE_URL ?? "").replace(/\?.*$/, "");
    process.env.COLD_CRM_DATABASE_URL = `${base}?options=-c%20search_path%3Dcoldsrc`;
  });

  afterAll(async () => {
    process.env = env;
    for (const b of backups) await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${b}" CASCADE`);
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS coldsrc CASCADE`);
    await prisma.salesContact.deleteMany({ where: { id: { startsWith: "nx-" } } });
  });

  it("verweigert ohne Freigabe und löscht nichts", async () => {
    delete process.env.VERTRIEB_NEUIMPORT_ERLAUBT;
    await expect(replaceFromColdCrm()).rejects.toThrow(/nicht freigeschaltet/);
    expect(await prisma.salesContact.count({ where: { id: { startsWith: "nx-" } } })).toBe(2);
  });

  it("ersetzt den Vertrieb durch den Stand im Cold CRM, mit Sicherung", async () => {
    process.env.VERTRIEB_NEUIMPORT_ERLAUBT = "1";
    const { backup, report } = await replaceFromColdCrm(new Date("2026-11-10T21:05:00Z"));
    backups.push(backup);
    expect(backup).toBe("backup_vertrieb_20261110_2105");

    const contacts = await prisma.salesContact.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, stage: true } });
    expect(contacts).toEqual([
      { id: "nx-a1", name: "Agentur Alt (neu)", stage: "INTERESSE" },
      { id: "nx-b1", name: "Agentur Neu", stage: "NEU" },
    ]);
    expect(await prisma.salesTask.count({ where: { contactId: "nx-a1" } })).toBe(1);
    expect(await prisma.offer.count({ where: { number: "NX-1" } })).toBe(0);
    expect(report.find((r) => r.table === "SalesContact")).toMatchObject({ source: 2, inserted: 2 });

    // Sicherung enthält den alten Stand inkl. Angebot
    const saved = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(`SELECT id, name FROM "${backup}"."SalesContact" ORDER BY id`);
    expect(saved.map((c) => c.name)).toEqual(["Agentur Alt", "Testkontakt"]);
    expect(await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${backup}"."Offer"`)).toEqual([{ n: 1 }]);
  });

  it("bricht ab, wenn das Cold CRM leer ist (nichts gelöscht)", async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM coldsrc."Task"`);
    await prisma.$executeRawUnsafe(`DELETE FROM coldsrc."Contact"`);
    await expect(replaceFromColdCrm()).rejects.toThrow(/keine Kontakte/);
    expect(await prisma.salesContact.count({ where: { id: { startsWith: "nx-" } } })).toBe(2);
  });
});
