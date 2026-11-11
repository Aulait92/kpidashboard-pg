import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { HANDOFF_TTL_MS, createHandoff, redeemHandoff, safeNext } from "@/lib/app-handoff";
import { __setApnsSender, sendToDevices } from "@/lib/native-push";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

describe("App-Store-App: Einmal-Übergabe und Geräte", () => {
  let customerId = "";
  let userId = "";
  beforeAll(async () => {
    requireTestDb();
    const c = await makeCustomer();
    customerId = c.id;
    userId = (await makeBuyer(c.id, "owner")).id;
  });
  afterAll(async () => {
    __setApnsSender(null);
    await cleanupCustomer(customerId);
  });

  it("safeNext lässt nur interne Pfade zu", () => {
    expect(safeNext("/buyer/einstellungen")).toBe("/buyer/einstellungen");
    expect(safeNext("//evil.example")).toBe("/buyer");
    expect(safeNext("https://evil.example")).toBe("/buyer");
    expect(safeNext("/\\evil")).toBe("/buyer");
    expect(safeNext(null)).toBe("/buyer");
  });

  it("Übergabe-Link gilt genau einmal", async () => {
    const t = await createHandoff(userId, "/buyer/einstellungen");
    const row = await prisma.appHandoff.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
    expect(row?.tokenHash).not.toBe(t); // nur der Hash liegt in der DB
    expect(await redeemHandoff(t)).toEqual({ userId, next: "/buyer/einstellungen" });
    expect(await redeemHandoff(t)).toBeNull();
    expect(await redeemHandoff("falsch")).toBeNull();
  });

  it("Übergabe-Link läuft nach 5 Minuten ab", async () => {
    const start = new Date();
    const t = await createHandoff(userId, "/buyer", start);
    expect(await redeemHandoff(t, new Date(start.getTime() + HANDOFF_TTL_MS + 1000))).toBeNull();
  });

  it("tote iOS-Tokens werden beim Versand gelöscht, gültige bleiben", async () => {
    const env = { ...process.env };
    process.env.APNS_KEY_ID = "K";
    process.env.APNS_TEAM_ID = "T";
    process.env.APNS_PRIVATE_KEY = "nicht-benutzt";
    try {
      const ok = await prisma.deviceToken.create({ data: { userId, platform: "ios", token: `ok${"a".repeat(40)}${Date.now()}` } });
      await prisma.deviceToken.create({ data: { userId, platform: "ios", token: `tot${"b".repeat(40)}${Date.now()}` } });
      __setApnsSender(async (token) => (token.startsWith("tot") ? { status: 410, reason: "Unregistered" } : { status: 200 }));
      const out = await sendToDevices([userId], { title: "Test", body: "x" });
      expect(out).toEqual({ sent: 1, removed: 1, errors: [] });
      const left = await prisma.deviceToken.findMany({ where: { userId }, select: { id: true } });
      expect(left.map((d) => d.id)).toEqual([ok.id]);
    } finally {
      process.env = env;
    }
  });

  it("Geräte und Übergaben verschwinden mit dem Login", async () => {
    const u2 = await makeBuyer(customerId, "advisor");
    await prisma.deviceToken.create({ data: { userId: u2.id, platform: "android", token: `and${"c".repeat(40)}${Date.now()}` } });
    await createHandoff(u2.id, "/buyer");
    await prisma.user.delete({ where: { id: u2.id } });
    expect(await prisma.deviceToken.count({ where: { userId: u2.id } })).toBe(0);
    expect(await prisma.appHandoff.count({ where: { userId: u2.id } })).toBe(0);
  });
});
