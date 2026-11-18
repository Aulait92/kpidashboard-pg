// Admin v2, Paket A5: Werkzeuge › Meta-Gebühren lädt Monat und Vormonat je Kunde aus den Nachrichten.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ladeMetaGebuehren } from "@/lib/admin-neu/meta-gebuehren";
import { priceCounts } from "@/lib/whatsapp/fees";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

requireTestDb();

describe("Meta-Gebühren (A5)", () => {
  let kundeId = "";
  beforeAll(async () => {
    const k = await makeCustomer();
    kundeId = k.id;
    const conv = await prisma.conversation.create({ data: { customerId: k.id, contactPhone: "491700009911" } });
    await prisma.message.createMany({
      data: [
        { conversationId: conv.id, direction: "outbound", body: "a", billable: true, pricingCategory: "marketing" },
        { conversationId: conv.id, direction: "outbound", body: "b", billable: true, pricingCategory: "utility" },
        { conversationId: conv.id, direction: "outbound", body: "c", billable: false, pricingCategory: "service" },
        { conversationId: conv.id, direction: "inbound", body: "d", billable: true, pricingCategory: "marketing" },
      ],
    });
  });
  afterAll(async () => cleanupCustomer(kundeId));

  it("zählt nur berechnete ausgehende Nachrichten des laufenden Monats", async () => {
    const { kunden } = await ladeMetaGebuehren();
    const k = kunden.find((x) => x.kundeId === kundeId)!;
    expect(k.nachrichten).toBe(2);
    expect(k.monat).toBe(priceCounts({ marketing: 1, utility: 1 }).amount);
    expect(k.vormonat).toBe(0);
  });
});
