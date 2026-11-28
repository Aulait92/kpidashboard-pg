// Einmalige Bereinigung aus dem Cron (Ole, 28.11.2026): läuft genau einmal (Merker im SystemHeartbeat).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { EINMAL_BEREINIGUNG_KEY, einmalNachfassenBereinigen } from "@/lib/lead-phase-server";
import { requireTestDb } from "./db";

beforeAll(async () => {
  requireTestDb();
  await prisma.systemHeartbeat.deleteMany({ where: { key: EINMAL_BEREINIGUNG_KEY } });
});
afterAll(async () => {
  await prisma.systemHeartbeat.deleteMany({ where: { key: EINMAL_BEREINIGUNG_KEY } });
});

describe("einmalNachfassenBereinigen", () => {
  it("läuft beim ersten Mal und danach nicht mehr", async () => {
    const erst = await einmalNachfassenBereinigen();
    expect(erst?.echt).toBe(true);
    const hb = await prisma.systemHeartbeat.findUniqueOrThrow({ where: { key: EINMAL_BEREINIGUNG_KEY } });
    expect(hb.ok).toBe(true);
    expect(hb.note).toContain("geprueft");
    expect(await einmalNachfassenBereinigen()).toBeNull();
  });
});
