import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { login } from "@/lib/auth";
import { requireTestDb } from "./db";

describe("Login: Schutz gegen Durchprobieren", () => {
  const email = `niemand-${Math.random().toString(36).slice(2)}@test.local`;
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorEmail: email } });
  });

  it("sperrt nach 10 Fehlversuchen für 15 Minuten", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await login(email, "falsch");
      expect(r).toMatchObject({ ok: false, error: "Email oder Passwort falsch." });
    }
    const r = await login(email, "falsch");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/Zu viele Versuche/);
    expect(await prisma.auditLog.count({ where: { action: "login.failed", actorEmail: email } })).toBe(10);
  });
});
