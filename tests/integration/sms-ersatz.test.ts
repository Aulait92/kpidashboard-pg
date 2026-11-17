// SMS-Ersatz (Ole, 17.11.2026): WhatsApp-Terminnachricht im Vertrieb kommt mit „failed“ zurück → derselbe Text
// einmal per SMS über seven.io. Nicht bei Abmeldung, nicht für andere Nachrichten, nicht ohne Schlüssel.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push", () => ({
  sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
  sendToBuyersOfCustomer: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
  sendToUser: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
}));

import { prisma } from "@/lib/prisma";
import { handleFailedStatus } from "@/lib/whatsapp/kein-whatsapp";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { smsText } from "@/lib/sms/ersatz";
import { requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
const calls: Array<{ url: string; body: { to: string; text: string; from: string }; key: string | null }> = [];
let antwort: () => Response = () => new Response(JSON.stringify({ success: "100", messages: [{ id: "77", success: true }] }), { status: 200 });

describe("SMS-Ersatz für Terminnachrichten", () => {
  const phones: string[] = [];
  const contacts: string[] = [];

  beforeAll(async () => {
    requireTestDb();
    await prisma.customer.upsert({ where: { id: SUPPORT_CUSTOMER_ID }, create: { id: SUPPORT_CUSTOMER_ID, name: "performancegrowth Support", plan: "internal" }, update: {} });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), key: (init.headers as Record<string, string>)["X-Api-Key"] ?? null });
      return antwort();
    }));
  });
  beforeEach(() => {
    calls.length = 0;
    process.env.SEVEN_API_KEY = "test-key";
    delete process.env.MAIL_NUR_AN;
    antwort = () => new Response(JSON.stringify({ success: "100", messages: [{ id: "77", success: true }] }), { status: 200 });
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    delete process.env.SEVEN_API_KEY;
    await prisma.conversation.deleteMany({ where: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: { in: phones } } });
    await prisma.salesActivity.deleteMany({ where: { contactId: { in: contacts } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } });
  });

  async function terminNachricht(purpose: string | null = "vertrieb_termin", extra: { optedOutAt?: Date } = {}) {
    const phone = `49176${Math.floor(10000000 + Math.random() * 89999999)}`;
    phones.push(phone);
    const contact = await prisma.salesContact.create({ data: { name: "Sascha Test", email: `sms-${uid()}@example.test` } });
    contacts.push(contact.id);
    const conv = await prisma.conversation.create({
      data: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: phone, salesContactId: contact.id, botActive: false, status: "open", lastMessageAt: new Date(), ...extra },
    });
    const wamid = `wamid.sms-${uid()}`;
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: "outbound",
        kind: "template",
        body: "Guten Tag Herr Test, danke für Ihre Buchung! Am Dienstag um 14:30 Uhr – per Video. Viele Grüße, Ole Kannapinn",
        waMessageId: wamid,
        status: "failed",
        sentBy: "system",
        purpose,
      },
    });
    return { phone, contactId: contact.id, wamid };
  }

  it("131026 auf die Terminbestätigung: SMS mit demselben Text, genau einmal, im Verlauf vermerkt", async () => {
    const t = await terminNachricht();
    const r = await handleFailedStatus(t.wamid, [{ code: 131026, title: "Message undeliverable" }]);
    expect(r.sms).toBe("sent");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("gateway.seven.io/api/sms");
    expect(calls[0].key).toBe("test-key");
    expect(calls[0].body.to).toBe(`+${t.phone}`);
    expect(calls[0].body.text).toContain("danke für Ihre Buchung");
    expect(calls[0].body.text).not.toMatch(/[–—]/);
    const m = await prisma.message.findUnique({ where: { waMessageId: t.wamid } });
    expect(m?.smsAt).toBeTruthy();
    expect(m?.smsStatus).toBe("sent");
    const act = await prisma.salesActivity.findMany({ where: { contactId: t.contactId } });
    expect(act.map((a) => a.outcome)).toContain("Terminbestätigung per SMS gesendet (WhatsApp nicht zustellbar)");
    // Webhook wiederholt sich: keine zweite SMS
    const r2 = await handleFailedStatus(t.wamid, [{ code: 131026, title: "Message undeliverable" }]);
    expect(r2.sms).toBe("already");
    expect(calls).toHaveLength(1);
  });

  it("auch bei anderen Fehlern (z. B. Meta-Störung) für Erinnerungen", async () => {
    const t = await terminNachricht("vertrieb_erinnerung");
    expect((await handleFailedStatus(t.wamid, [{ code: 131000, title: "Something went wrong" }])).sms).toBe("sent");
  });

  it("nicht bei Abmeldung (131050) und nicht nach STOPP", async () => {
    const a = await terminNachricht();
    expect((await handleFailedStatus(a.wamid, [{ code: 131050, title: "opted out" }])).sms).toBe("skipped");
    const b = await terminNachricht("vertrieb_termin", { optedOutAt: new Date() });
    expect((await handleFailedStatus(b.wamid, [{ code: 131026, title: "x" }])).sms).toBe("skipped");
    expect(calls).toHaveLength(0);
  });

  it("nicht für andere Nachrichten (z. B. Zahlungserinnerung) und nicht ohne Schlüssel", async () => {
    const a = await terminNachricht("vertrieb_zahlung");
    expect((await handleFailedStatus(a.wamid, [{ code: 131026, title: "x" }])).sms).toBeUndefined();
    delete process.env.SEVEN_API_KEY;
    const b = await terminNachricht();
    expect((await handleFailedStatus(b.wamid, [{ code: 131026, title: "x" }])).sms).toBe("no_key");
    expect(calls).toHaveLength(0);
    // ohne Schlüssel keine Sperre: später mit Schlüssel noch möglich
    expect((await prisma.message.findUnique({ where: { waMessageId: b.wamid } }))?.smsAt).toBeNull();
  });

  it("Testumgebung (MAIL_NUR_AN): nur an freigegebene Nummern", async () => {
    process.env.MAIL_NUR_AN = "@performancegrowth.de";
    const t = await terminNachricht();
    expect((await handleFailedStatus(t.wamid, [{ code: 131026, title: "x" }])).sms).toBe("blocked");
    expect(calls).toHaveLength(0);
  });

  it("Fehler bei seven.io: Status vermerkt", async () => {
    antwort = () => new Response(JSON.stringify({ success: "900", messages: [] }), { status: 200 });
    const t = await terminNachricht();
    expect((await handleFailedStatus(t.wamid, [{ code: 131026, title: "x" }])).sms).toBe("failed");
    expect((await prisma.message.findUnique({ where: { waMessageId: t.wamid } }))?.smsStatus).toMatch(/^failed/);
  });

  it("smsText: Hinweis aufs Antworten in WhatsApp entfällt", () => {
    expect(smsText("Ihr Termin: Montag. Bei Fragen antworten Sie einfach auf diese Nachricht. Viele Grüße")).toBe("Ihr Termin: Montag. Viele Grüße");
  });
});
