// Anschluss Widerspruch (Kundenbereich) → Kampagnen-Leitplanken (24.11.2026)
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { requireTestDb } from "./db";
import { ausgenommeneUnter, vomLernenAusgenommen } from "@/lib/kampagnen/lern-sperre";

const ids: string[] = [];
afterAll(async () => {
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
});

describe("Lern-Sperre am Kundenfeld", () => {
  it("Kunde mit Widerspruch ist ausgenommen, ohne nicht; Rücknahme wirkt sofort", async () => {
    requireTestDb();
    const a = await prisma.customer.create({ data: { name: "Sperre A Test", anzeigenlernenWiderspruchAt: new Date() } });
    const b = await prisma.customer.create({ data: { name: "Sperre B Test" } });
    ids.push(a.id, b.id);
    expect([...(await vomLernenAusgenommen([a.id, b.id]))]).toEqual([a.id]);
    expect([...(await ausgenommeneUnter([a.id, b.id, null, a.id]))]).toEqual([a.id]);
    await prisma.customer.update({ where: { id: a.id }, data: { anzeigenlernenWiderspruchAt: null } });
    expect((await vomLernenAusgenommen([a.id, b.id])).size).toBe(0);
  });
});
