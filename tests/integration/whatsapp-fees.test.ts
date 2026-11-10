import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { chargeWhatsAppFees, feeUsage } from "@/lib/whatsapp/fees";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

describe("WhatsApp-Gebühren abrechnen", () => {
  let customerId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected" } });
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: "4915199990001" } });
    const at = new Date("2026-10-15T10:00:00Z");
    const msg = (extra: object) => prisma.message.create({ data: { conversationId: conv.id, direction: "outbound", createdAt: at, ...extra } });
    await msg({ kind: "template", pricingCategory: "marketing", billable: true });
    await msg({ kind: "template", pricingCategory: "marketing", billable: true });
    await msg({ kind: "template", pricingCategory: "utility", billable: true });
    await msg({ kind: "template", pricingCategory: "utility", billable: false }); // im Service-Fenster kostenlos
    await msg({ kind: "text" }); // Antwort im Gespräch
    await prisma.message.create({ data: { conversationId: conv.id, direction: "outbound", createdAt: new Date("2026-11-01T10:00:00Z"), pricingCategory: "marketing", billable: true } });
  });
  afterAll(() => cleanupCustomer(customerId));

  it("zählt nur von Meta berechnete Nachrichten des Monats", async () => {
    const u = await feeUsage(customerId, "2026-10");
    expect(u.counts).toEqual({ marketing: 2, utility: 1, authentication: 0, service: 0 });
    expect(u.amount).toBe(0.27);
  });

  it("hält die Abrechnung einmal je Monat fest (ohne Stripe: von Hand)", async () => {
    const r1 = await chargeWhatsAppFees("2026-10");
    expect(r1.errors).toEqual([]);
    const charges = await prisma.whatsAppFeeCharge.findMany({ where: { customerId } });
    expect(charges).toHaveLength(1);
    expect(Number(charges[0].amount)).toBe(0.27);
    expect(charges[0].stripeInvoiceItemId).toBeNull();
    await chargeWhatsAppFees("2026-10");
    expect(await prisma.whatsAppFeeCharge.count({ where: { customerId } })).toBe(1);
  });
});
