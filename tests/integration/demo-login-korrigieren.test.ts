import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

// Fehlerfall aus Oles Screenshot: Der Demo-Login für die Google-Prüfung hängt an einem echten
// Kunden, der Demo-Kunde fehlt. Die Migration muss das reparieren und darf beliebig oft laufen.

const MIGRATIONS = path.join(__dirname, "../../prisma/migrations");
const DEMO_EMAIL = "google-review-demo@performancegrowth.de";
const DEMO_CUSTOMER = "cust_google_review_demo";

/** Führt eine migration.sql Anweisung für Anweisung aus (Prepared Statements kennen nur eine). */
async function runMigration(dir: string) {
  const sql = readFileSync(path.join(MIGRATIONS, dir, "migration.sql"), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  const statements = sql.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
  await prisma.$transaction(async (tx) => {
    for (const s of statements) await tx.$executeRawUnsafe(s);
  });
}

describe("Migration demo_login_korrigieren", () => {
  const ids: string[] = [];

  beforeAll(async () => {
    requireTestDb();
    // Ausgangslage herstellen: Demo-Kunde weg, Login (wie von Hand angelegt) bei einem echten Kunden.
    await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
    await prisma.customer.deleteMany({ where: { id: DEMO_CUSTOMER } });
  });

  afterAll(async () => {
    for (const id of ids) await cleanupCustomer(id);
    // Stand nach allen Migrationen wiederherstellen (Demo-Leads der ersten Migration).
    await runMigration("20261118491000_demo_kunde_google_pruefung");
    await runMigration("20261118660000_demo_login_korrigieren");
  });

  it("hängt den Login an den Demo-Kunden und löst fremde Zuweisungen", async () => {
    const meier = await makeCustomer({ name: "Agentur Susanne Meier" });
    ids.push(meier.id);
    const owner = await makeBuyer(meier.id, "owner");
    const demo = await prisma.user.create({
      data: { email: DEMO_EMAIL, passwordHash: "x", role: "BUYER", customerId: meier.id, teamRole: "advisor", receivesLeads: true },
    });
    const leadDemo = await prisma.lead.create({ data: { customerId: meier.id, name: "Echter Lead", assignedUserId: demo.id } });
    const leadOwner = await prisma.lead.create({ data: { customerId: meier.id, name: "Anderer Lead", assignedUserId: owner.id } });
    const conv = await prisma.conversation.create({ data: { customerId: meier.id, contactPhone: "4915100000777", assignedUserId: demo.id } });

    await runMigration("20261118660000_demo_login_korrigieren");

    const customer = await prisma.customer.findUnique({ where: { id: DEMO_CUSTOMER } });
    expect(customer).toMatchObject({ name: "Google Review Demo", plan: "internal" });

    const after = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } });
    expect(after).toMatchObject({ id: demo.id, customerId: DEMO_CUSTOMER, teamRole: "owner", receivesLeads: false });
    // Kunde im Sitzungs-Cookie: alte Sitzungen beim echten Kunden enden
    expect(after.sessionVersion).toBe(demo.sessionVersion + 1);

    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadDemo.id } })).assignedUserId).toBeNull();
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadOwner.id } })).assignedUserId).toBe(owner.id);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } })).assignedUserId).toBeNull();
    // Der echte Kunde behält seinen Inhaber und seine Leads
    expect(await prisma.user.count({ where: { customerId: meier.id } })).toBe(1);
    expect(await prisma.lead.count({ where: { customerId: meier.id } })).toBe(2);
  });

  it("zweiter Lauf ändert nichts mehr", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } });
    await runMigration("20261118660000_demo_login_korrigieren");
    const after = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } });
    expect(after.sessionVersion).toBe(before.sessionVersion);
    expect(after.customerId).toBe(DEMO_CUSTOMER);
  });

  it("lässt Leads beim Demo-Kunden zugewiesen", async () => {
    const demo = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } });
    const lead = await prisma.lead.create({ data: { customerId: DEMO_CUSTOMER, name: "Demo-Lead", assignedUserId: demo.id } });
    await runMigration("20261118660000_demo_login_korrigieren");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).assignedUserId).toBe(demo.id);
    await prisma.lead.delete({ where: { id: lead.id } });
  });
});
