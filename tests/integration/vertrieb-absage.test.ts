import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { fixDeclinedReplies, handleWebhook, recordReply } from "@/lib/vertrieb/instantly";
import { requireTestDb } from "./db";

const email = `absage-${Math.random().toString(36).slice(2)}@test.local`;

describe("Vertrieb: Absage per Mail erzeugt keine Aufgabe", () => {
  let contactId = "";
  beforeAll(async () => {
    requireTestDb();
    contactId = (await prisma.salesContact.create({ data: { name: "Test Absage", email } })).id;
  });
  afterAll(async () => {
    await prisma.salesContact.delete({ where: { id: contactId } }).catch(() => {});
  });

  it("Instantly sagt „interessiert“, Text ist eine Absage → keine Aufgabe, Kontakt verloren", async () => {
    await recordReply(contactId, {
      subject: "Re: Leads für Ihre Agentur",
      text: "Hallo, danke, aber wir haben uns dagegen entschieden. Ich möchte keinen Termin.",
      isAutoReply: false,
      sentAt: new Date(),
      interest: 1, // Instantly: Interessiert
    });
    expect(await prisma.salesTask.count({ where: { contactId, doneAt: null } })).toBe(0);
    const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId } });
    expect(c.stage).toBe("VERLOREN");
    expect(c.lossReason).toBe("KEIN_INTERESSE");
    // späteres Webhook-Ereignis „lead_interested“ legt auch keine Aufgabe an
    await handleWebhook({ lead_email: email, event_type: "lead_interested", campaign_name: "Test" });
    expect(await prisma.salesTask.count({ where: { contactId, doneAt: null } })).toBe(0);
  });

  it("räumt bestehende falsche Aufgaben auf", async () => {
    await prisma.salesTask.create({ data: { contactId, title: "Interessent aus Cold Mail anrufen", type: "NACHFASSEN", dueAt: new Date() } });
    expect(await fixDeclinedReplies()).toBeGreaterThanOrEqual(1);
    expect(await prisma.salesTask.count({ where: { contactId, doneAt: null } })).toBe(0);
  });
});
