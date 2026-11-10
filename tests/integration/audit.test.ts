import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { audit, pruneAudit } from "@/lib/audit";
import { requireTestDb } from "./db";

describe("Änderungsprotokoll", () => {
  const tag = `test-${Math.random().toString(36).slice(2)}`;
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: tag } });
  });

  it("schreibt Einträge mit Person, Art und Details", async () => {
    await audit("pause.plan", { entity: "CustomerPause", entityId: tag, actor: { id: "u1", email: "a@test.local", role: "ADMIN" }, details: { from: "2026-12-01" } });
    const e = await prisma.auditLog.findFirstOrThrow({ where: { entityId: tag } });
    expect(e.action).toBe("pause.plan");
    expect(e.actorEmail).toBe("a@test.local");
    expect(e.details).toEqual({ from: "2026-12-01" });
  });

  it("löscht Einträge, die älter als 1 Jahr sind", async () => {
    await prisma.auditLog.create({ data: { action: "login", entityId: tag, at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) } });
    expect(await prisma.auditLog.count({ where: { entityId: tag } })).toBe(2);
    await pruneAudit();
    expect(await prisma.auditLog.count({ where: { entityId: tag } })).toBe(1);
  });
});
