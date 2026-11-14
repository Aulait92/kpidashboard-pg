// WhatsApp-Support-Postfach (Ole, 14.11.2026): Nachricht an die Support-Nummer → Chat unter Admin → WhatsApp,
// kein Assistent, keine Lead-Logik, Push an die Admins.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const adminPushes: Array<{ title: string; url?: string }> = [];
vi.mock("@/lib/push", () => ({
  sendToAdmins: vi.fn(async (p: { title: string; url?: string }) => {
    adminPushes.push(p);
    return { sent: 1, failed: 0 };
  }),
  sendToBuyersOfCustomer: vi.fn(async () => ({ sent: 0, failed: 0 })),
  sendToUser: vi.fn(async () => ({ sent: 0, failed: 0 })),
}));
vi.mock("@/lib/whatsapp/bot", () => ({ runBotTurn: vi.fn(async () => {}) }));

import { prisma } from "@/lib/prisma";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { runBotTurn } from "@/lib/whatsapp/bot";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { requireTestDb } from "./db";

const PNID = `pnid-support-${Math.random().toString(36).slice(2, 8)}`;

describe("Support-Postfach", () => {
  beforeAll(async () => {
    requireTestDb();
    await prisma.customer.upsert({ where: { id: SUPPORT_CUSTOMER_ID }, create: { id: SUPPORT_CUSTOMER_ID, name: "performancegrowth Support", plan: "internal" }, update: {} });
    await prisma.whatsAppAccount.upsert({
      where: { customerId: SUPPORT_CUSTOMER_ID },
      create: { customerId: SUPPORT_CUSTOMER_ID, phoneNumberId: PNID, phoneNumber: "4915679811535", status: "connected" },
      update: { phoneNumberId: PNID, status: "connected" },
    });
  });
  afterAll(async () => {
    await prisma.conversation.deleteMany({ where: { customerId: SUPPORT_CUSTOMER_ID } });
    await prisma.whatsAppAccount.deleteMany({ where: { customerId: SUPPORT_CUSTOMER_ID } });
  });

  it("legt den Chat ohne Assistent an, markiert ihn und schickt einen Push an die Admins", async () => {
    await handleInboundPayload({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: PNID }, contacts: [{ wa_id: "4917611112222", profile: { name: "Max Vermittler" } }], messages: [{ from: "4917611112222", id: `wamid.sup-${PNID}`, type: "text", text: { body: "Hallo, meine Rechnung stimmt nicht" } }] } }] }],
    });
    const conv = await prisma.conversation.findFirstOrThrow({ where: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: "4917611112222" }, include: { messages: true } });
    expect(conv.botActive).toBe(false);
    expect(conv.needsAttention).toBe(true);
    expect(conv.leadId).toBeNull();
    expect(conv.messages).toHaveLength(1);
    expect(runBotTurn).not.toHaveBeenCalled();
    expect(adminPushes.at(-1)).toMatchObject({ url: `/admin/whatsapp?c=${conv.id}` });
    expect(adminPushes.at(-1)!.title).toMatch(/Support-WhatsApp/);
  });
});
