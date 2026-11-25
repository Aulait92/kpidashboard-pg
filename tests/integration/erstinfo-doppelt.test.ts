// Erstinformation bzw. Erstnachricht doppelt (Ole, 25.11.2026, Fall Rasema Zukanovic 24.11.: 18:43 „nicht zugestellt“,
// 18:45 erneut): gleichzeitige Läufe senden nur einmal (Sperre je Unterhaltung bzw. atomares Beanspruchen des Leads),
// eine nicht zugestellte Erstinformation bekommt genau einen neuen Versuch, danach bleibt der Link als Rückfall.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async () => {}),
  sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
}));
vi.mock("@/lib/whatsapp/bot", () => ({ runBotTurn: vi.fn(async () => {}) }));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { runOutreach } from "@/lib/whatsapp/outreach";
import { sendErstinfo, sendErstinfoPdf, ERSTINFO_MAX_VERSUCHE } from "@/lib/whatsapp/erstinfo-pdf";
import { nachNummernKorrektur } from "@/lib/whatsapp/kein-whatsapp";
import { erneutGesendet } from "@/lib/chat-zustellung";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ENV = { ...process.env };
const sent: Array<{ to: string; type: string; text?: { body: string } }> = [];
const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4917${String(Date.now()).slice(-5)}${String(++seq).padStart(3, "0")}`;

/** 360dialog nachgebildet, mit kurzer Wartezeit (so überlappen gleichzeitige Läufe wirklich). */
async function fake360(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("/messages")) {
    await new Promise((r) => setTimeout(r, 80));
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ messages: [{ id: `wamid.dop.${uid()}` }] }), { status: 200 });
  }
  return new Response("not found", { status: 404 });
}

let customerId = "";
const V6_SIE = "Hallo {{1}}, danke für Ihre Anfrage zum Thema {{2}}! Ich bin der digitale KI-Assistent von {{3}}.\n\n*{{4}}?*";

beforeAll(() => requireTestDb());
beforeEach(async () => {
  process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
  process.env.APP_URL = "https://app.example.de";
  sent.length = 0;
  vi.stubGlobal("fetch", vi.fn(fake360));
  customerId = (await makeCustomer({ name: `Agentur Doppelt ${uid()}`, leadAddress: "sie" })).id;
  await prisma.whatsAppAccount.create({ data: { customerId, provider: "360dialog", status: "connected", apiKeyEnc: encryptSecret("k"), phoneNumberId: `pn-dop-${uid()}` } });
  await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: true, outreachDelayMin: 0 } });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await prisma.lead.deleteMany({ where: { customerId } });
  await cleanupCustomer(customerId);
});
afterAll(() => {
  process.env = { ...ENV };
});

async function offenerChat() {
  const phone = newPhone();
  const lead = await prisma.lead.create({ data: { customerId, name: "Rasema Test", phone, status: "Neuer Lead", outreachAt: new Date(), outreachStatus: "sent" } });
  const conv = await prisma.conversation.create({
    data: { customerId, contactPhone: phone, leadId: lead.id, botActive: true, status: "open", lastMessageAt: new Date(), windowExpiresAt: new Date(Date.now() + 3600_000) },
  });
  return { phone, lead, conv };
}
const dokumente = (phone: string) => sent.filter((s) => s.to === phone && s.type === "document");

describe("Erstinformation als PDF: höchstens einmal zugestellt", () => {
  it("zwei gleichzeitige Antworten des Assistenten: das PDF geht nur einmal raus", async () => {
    const { phone, conv } = await offenerChat();
    const r = await Promise.all([sendErstinfoPdf({ conversationId: conv.id }), sendErstinfoPdf({ conversationId: conv.id }), sendErstinfoPdf({ conversationId: conv.id })]);
    expect(r.filter((x) => x === "sent")).toHaveLength(1);
    expect(r.filter((x) => x === "already")).toHaveLength(2);
    expect(dokumente(phone)).toHaveLength(1);
    expect(await prisma.message.count({ where: { conversationId: conv.id, kind: "document" } })).toBe(1);
  });

  it("nicht zugestellt: genau ein neuer Versuch, im Verlauf „erneut gesendet“; scheitert auch der, Link als Rückfall", async () => {
    const { phone, conv } = await offenerChat();
    expect(await sendErstinfoPdf({ conversationId: conv.id })).toBe("sent");
    // Zugestellt bzw. unterwegs: kein zweites
    expect(await sendErstinfoPdf({ conversationId: conv.id })).toBe("already");
    // Meta meldet „failed“ (Status-Webhook)
    await prisma.message.updateMany({ where: { conversationId: conv.id, kind: "document" }, data: { status: "failed", errorCode: 131053 } });
    expect(await sendErstinfoPdf({ conversationId: conv.id })).toBe("sent");
    expect(dokumente(phone)).toHaveLength(2);
    const verlauf = await prisma.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: "asc" } });
    expect([...erneutGesendet(verlauf)]).toEqual([verlauf[0].id]);
    // Auch der zweite kommt nicht an: kein drittes PDF, stattdessen einmal der Link
    await prisma.message.updateMany({ where: { conversationId: conv.id, kind: "document" }, data: { status: "failed" } });
    expect(ERSTINFO_MAX_VERSUCHE).toBe(2);
    expect(await sendErstinfoPdf({ conversationId: conv.id })).toBe("failed");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await sendErstinfo({ conversationId: conv.id, advisorName: "Herrn Test" })).toBe("link");
    expect(await sendErstinfo({ conversationId: conv.id, advisorName: "Herrn Test" })).toBe("failed");
    expect(dokumente(phone)).toHaveLength(2);
    expect(sent.filter((s) => s.to === phone && s.type === "text" && s.text?.body.includes("/erstinformation/"))).toHaveLength(1);
  });
});

describe("Erstanschreiben: gleichzeitige Läufe schreiben nur einmal an", () => {
  it("Cron und Eingang gleichzeitig (runOutreach zweimal): eine Vorlage", async () => {
    await prisma.messageTemplate.create({ data: { customerId, name: "pg_outreach_v6_sie", language: "de", purpose: "outreach", category: "marketing", status: "approved", auto: true, body: V6_SIE, headerFormat: "DOCUMENT" } });
    const phone = newPhone();
    const lead = await prisma.lead.create({ data: { customerId, name: "Rasema Zukanovic", phone, status: "Neuer Lead", source: "Privatschutz" } });
    const [a, b] = await Promise.all([runOutreach(customerId), runOutreach(customerId, { leadIds: [lead.id] })]);
    expect(a.sent + b.sent).toBe(1);
    expect(sent.filter((s) => s.to === phone && s.type === "template")).toHaveLength(1);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).outreachStatus).toBe("sent");
  });

  it("ohne freigegebene Vorlage: outreachAt bleibt frei, der nächste Lauf schreibt an", async () => {
    const phone = newPhone();
    const lead = await prisma.lead.create({ data: { customerId, name: "Rasema Zukanovic", phone, status: "Neuer Lead", source: "Privatschutz" } });
    await runOutreach(customerId);
    expect(await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).toMatchObject({ outreachAt: null, outreachStatus: "no_template" });
    await prisma.messageTemplate.create({ data: { customerId, name: "pg_outreach_v6_sie", language: "de", purpose: "outreach", category: "marketing", status: "approved", auto: true, body: V6_SIE, headerFormat: "DOCUMENT" } });
    await runOutreach(customerId);
    expect(sent.filter((s) => s.to === phone && s.type === "template")).toHaveLength(1);
  });

  it("„Hat doch WhatsApp“ doppelt geklickt: nur ein neuer Versuch", async () => {
    await prisma.messageTemplate.create({ data: { customerId, name: "pg_outreach_v6_sie", language: "de", purpose: "outreach", category: "marketing", status: "approved", auto: true, body: V6_SIE, headerFormat: "DOCUMENT" } });
    const phone = newPhone();
    const lead = await prisma.lead.create({
      data: { customerId, name: "Rasema Zukanovic", phone, status: "Neuer Lead", source: "Privatschutz", outreachAt: new Date(), outreachStatus: "no_whatsapp", waUnavailableAt: new Date() },
    });
    const r = await Promise.all([nachNummernKorrektur(lead.id), nachNummernKorrektur(lead.id)]);
    expect(r.filter((x) => x === "erstanschreiben")).toHaveLength(1);
    expect(r.filter((x) => x === "nichts")).toHaveLength(1);
    expect(sent.filter((s) => s.to === phone && s.type === "template")).toHaveLength(1);
  });
});
