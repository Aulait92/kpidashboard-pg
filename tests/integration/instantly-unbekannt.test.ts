import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { handleWebhook } from "@/lib/vertrieb/instantly";
import { requireTestDb } from "./db";

// Antwort aus einer Instantly-Liste, die nicht im CRM ist (z. B. Signal Iduna):
// Kontakt wird angelegt statt die Antwort zu verwerfen.
const tag = Math.random().toString(36).slice(2, 8);
const email = `christoph.engel-${tag}@signal-iduna.test`;
const parallel = `parallel-${tag}@signal-iduna.test`;

describe("Instantly: unbekannte Adresse", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    await prisma.salesContact.deleteMany({ where: { email: { in: [email, parallel] } } });
    await prisma.salesCampaign.deleteMany({ where: { name: `Signal Iduna ${tag}` } });
  });

  it("Öffnen allein legt keinen Kontakt an", async () => {
    expect(await handleWebhook({ event_type: "email_opened", lead_email: email, campaign_name: `Signal Iduna ${tag}` })).toEqual({ ignored: "unknown contact" });
    expect(await prisma.salesContact.findUnique({ where: { email } })).toBeNull();
  });

  it("Antwort legt den Kontakt mit Namen und Firma an und speichert die Antwort", async () => {
    const r = await handleWebhook({
      event_type: "reply_received",
      lead_email: email.toUpperCase(),
      firstName: "Christoph",
      lastName: "Engel",
      companyName: "SIGNAL IDUNA Bezirksdirektion Engel",
      campaign_name: `Signal Iduna ${tag}`,
      reply_subject: "Re: Leads für Ihre Agentur",
      reply_text: "Hallo, klingt interessant. Rufen Sie mich gern an.",
      timestamp: "2026-11-10T09:00:00Z",
    });
    expect(r).toEqual({ ok: true });
    const c = await prisma.salesContact.findUniqueOrThrow({ where: { email }, include: { emails: true, campaigns: true } });
    expect(c).toMatchObject({ name: "SIGNAL IDUNA Bezirksdirektion Engel", firstName: "Christoph", lastName: "Engel" });
    expect(c.emails).toHaveLength(1);
    expect(c.emails[0].direction).toBe("IN");
    expect(c.campaigns[0].replyCount).toBe(1);
  });

  it("gleichzeitige Ereignisse zur selben neuen Adresse legen genau einen Kontakt an", async () => {
    const ev = (event_type: string) => handleWebhook({ event_type, lead_email: parallel, campaign_name: `Signal Iduna ${tag}`, timestamp: "2026-11-10T09:00:00Z" });
    const res = await Promise.all([ev("email_sent"), ev("email_sent"), ev("lead_interested")]);
    expect(res.every((r) => "ok" in r)).toBe(true);
    expect(await prisma.salesContact.count({ where: { email: parallel } })).toBe(1);
  });
});
