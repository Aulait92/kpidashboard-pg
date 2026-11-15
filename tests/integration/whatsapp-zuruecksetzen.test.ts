// Halb fertige WhatsApp-Verbindung zurücksetzen (Ole, 15.11.2026): Einladung/Einrichtung ja, verbundene Konten nie.
// Ohne Konto bzw. nur mit Einladung ist das Postfach (Chats) nicht frei.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetUnfinishedConnection } from "@/lib/whatsapp/dialog360-match";
import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

let customerId = "";
beforeAll(() => requireTestDb());
beforeEach(async () => {
  customerId = (await makeCustomer({ name: "Agentur Reset" })).id;
});
afterEach(async () => {
  await cleanupCustomer(customerId);
});

describe("resetUnfinishedConnection", () => {
  it("löscht eine Einladung, danach kein Postfach", async () => {
    await prisma.whatsAppAccount.create({ data: { customerId, status: "invited", dialog360ClientId: "cl1" } });
    expect(await hasWhatsAppInbox(customerId)).toBe(false);
    expect(await resetUnfinishedConnection(customerId, { role: "kunde" })).toEqual({ status: "reset" });
    expect(await prisma.whatsAppAccount.findUnique({ where: { customerId } })).toBeNull();
    expect(await resetUnfinishedConnection(customerId, { role: "kunde" })).toEqual({ status: "none" });
  });

  it("lässt verbundene Konten in Ruhe", async () => {
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", apiKeyEnc: "enc" } });
    expect(await hasWhatsAppInbox(customerId)).toBe(true);
    expect(await resetUnfinishedConnection(customerId, { role: "kunde" })).toEqual({ status: "connected" });
    expect(await prisma.whatsAppAccount.findUnique({ where: { customerId } })).not.toBeNull();
  });
});
