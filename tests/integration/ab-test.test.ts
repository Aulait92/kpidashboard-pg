import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { abOverview, abVariantFor, loadAbStats, promoteAbWinners } from "@/lib/whatsapp/ab-test";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

// A/B-Test der Vorlage „Bestandskunden: Lücke schließen“ (campaign_cross_sell): Messung über Message.purpose/variant,
// automatische Übernahme der besseren Fassung mit Audit-Eintrag.
const PURPOSE = "campaign_cross_sell" as const;
const DAY = 24 * 60 * 60 * 1000;

describe("A/B-Test: Messung und automatische Übernahme", () => {
  let customerId = "";
  const now = new Date();

  beforeAll(async () => {
    requireTestDb();
    await prisma.templateAbTest.deleteMany({ where: { purpose: PURPOSE } });
    customerId = (await makeCustomer()).id;
  });
  afterAll(async () => {
    await prisma.templateAbTest.deleteMany({ where: { purpose: PURPOSE } });
    await prisma.auditLog.deleteMany({ where: { action: "whatsapp.ab_promote", entityId: PURPOSE } });
    await cleanupCustomer(customerId);
  });

  /** n Sendungen einer Fassung, davon replied mit Antwort (und optional Abmeldungen, die nicht zählen). */
  async function seed(variant: "a" | "b", n: number, replied: number, optOuts = 0) {
    const sentAt = new Date(now.getTime() - 4 * DAY);
    for (let i = 0; i < n; i++) {
      const conv = await prisma.conversation.create({ data: { customerId, contactPhone: `49170${variant === "a" ? 1 : 2}${String(i).padStart(6, "0")}` } });
      await prisma.message.create({ data: { conversationId: conv.id, direction: "outbound", kind: "template", body: "x", purpose: PURPOSE, variant, createdAt: sentAt } });
      if (i < replied) {
        await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", body: "Ja, gern prüfen", createdAt: new Date(sentAt.getTime() + 3600_000) } });
      } else if (i < replied + optOuts) {
        await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", body: "Keine Nachrichten mehr", createdAt: new Date(sentAt.getTime() + 3600_000) } });
      }
    }
    // Zu frisch (unter 72 Std.): zählt noch nicht
    const fresh = await prisma.conversation.create({ data: { customerId, contactPhone: `49171${variant === "a" ? 1 : 2}000000` } });
    await prisma.message.create({ data: { conversationId: fresh.id, direction: "outbound", kind: "template", body: "x", purpose: PURPOSE, variant } });
  }

  it("zählt Antworten ohne Abmeldungen, entscheidet erst mit genug Volumen und Signifikanz", async () => {
    await seed("a", 60, 12, 5);
    await seed("b", 60, 30);
    // Testlead bei einem echten Kunden: zählt nicht (Ole, 19.11.2026: eigene Tests verfälschen sonst die Ergebnisse)
    const testLead = await prisma.lead.create({ data: { customerId, name: "Test", phone: "4917099999999", isTest: true } });
    const testConv = await prisma.conversation.create({ data: { customerId, leadId: testLead.id, contactPhone: "4917099999999" } });
    await prisma.message.create({ data: { conversationId: testConv.id, direction: "outbound", kind: "template", body: "x", purpose: PURPOSE, variant: "a", createdAt: new Date(now.getTime() - 4 * DAY) } });
    const stats = await loadAbStats(PURPOSE, now);
    expect(stats.a).toMatchObject({ sent: 60, replied: 12 });
    expect(stats.b).toMatchObject({ sent: 60, replied: 30 });

    const promoted = await promoteAbWinners(now);
    expect(promoted).toContainEqual({ purpose: PURPOSE, winner: "b" });
    const row = await prisma.templateAbTest.findUniqueOrThrow({ where: { purpose: PURPOSE } });
    expect(row.winner).toBe("b");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "whatsapp.ab_promote", entityId: PURPOSE } });
    expect(log.actorRole).toBe("system");
    expect(log.details).toMatchObject({ winner: "b" });

    // Danach bekommen alle Leads die bessere Fassung; ein zweiter Lauf entscheidet nicht erneut
    for (const key of ["lead-1", "lead-2", "lead-3", "lead-4"]) expect(await abVariantFor(PURPOSE, key)).toBe("b");
    expect((await promoteAbWinners(now)).some((p) => p.purpose === PURPOSE)).toBe(false);
    expect((await abOverview(now)).find((t) => t.purpose === PURPOSE)).toMatchObject({ winner: "b" });
  });
});
