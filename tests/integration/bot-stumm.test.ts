// Sicherheitsnetz „Assistent stumm“ (lib/whatsapp/bot-stumm.ts): Lead-Nachricht über 2 Min. ohne Antwort → kurze
// Antwort an den Lead, Aufgabe und Hinweis beim Vermittler, Assistent pausiert; genau einmal je Nachricht; Ausnahmen
// (Support-Nummer, Assistent pausiert, Hinweis schon gesetzt, Stopp); Diagnose q=bot-stumm mit &aufgaben=1.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const waSend = vi.fn();
vi.mock("@/lib/whatsapp/dialog360", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/dialog360")>();
  return {
    ...real,
    sendText: (...a: unknown[]) => waSend("text", ...a),
    sendTemplate: (...a: unknown[]) => waSend("template", ...a),
    sendButtons: (...a: unknown[]) => waSend("buttons", ...a),
  };
});
const push = vi.fn();
vi.mock("@/lib/push", () => {
  const rec = async (...a: unknown[]) => {
    push(...a);
    return { sent: 1, removed: 0, errors: [] };
  };
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { BOT_STUMM_MERKER, botStummDiagnose, runBotStumm } from "@/lib/whatsapp/bot-stumm";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4917${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
const MIN = 60 * 1000;

describe("Sicherheitsnetz Assistent stumm", () => {
  let customerId = "";
  let ownerId = "";
  async function chat(o: { minutenAlt: number; isTest?: boolean; conv?: Record<string, unknown>; cid?: string }) {
    const cid = o.cid ?? customerId;
    const phone = newPhone();
    const lead = await prisma.lead.create({ data: { customerId: cid, name: "Julia Schneider", phone, source: "Privatschutz", status: "Termin", isTest: o.isTest ?? false, assignedUserId: ownerId } });
    const conv = await prisma.conversation.create({
      data: { customerId: cid, leadId: lead.id, contactPhone: phone, contactName: "Julia", botActive: true, windowExpiresAt: new Date(Date.now() + 20 * 60 * MIN), lastMessageAt: new Date(), ...(o.conv ?? {}) },
    });
    const msg = await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", kind: "text", body: "Haftpflicht bei der HUK", createdAt: new Date(Date.now() - o.minutenAlt * MIN) } });
    return { lead, conv, msg };
  }

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    customerId = (await makeCustomer({ name: `Agentur Stumm ${uid()}`, leadAddress: "sie" })).id;
    ownerId = (await makeBuyer(customerId, "owner")).id;
    await prisma.erstinformation.create({ data: { customerId, token: `t-${uid()}`, name: "Ole Kannapinn", anrede: "Herr", firma: "Kannapinn Versicherungen" } });
    await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: false, systemPrompt: "Test" } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: `pnid-stumm-${uid()}`, apiKeyEnc: encryptSecret("k") } });
  });
  afterAll(async () => {
    await cleanupCustomer(customerId);
  });
  beforeEach(() => {
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
    push.mockReset();
  });

  it("über 2 Min. ohne Antwort: Antwort an den Lead, Aufgabe, Push, Assistent pausiert; genau einmal", async () => {
    const { conv, lead, msg } = await chat({ minutenAlt: 3 });
    const r = await runBotStumm();
    expect(r.gemeldet).toBeGreaterThanOrEqual(1);
    const texte = waSend.mock.calls.filter((c) => c[0] === "text" && c[2] === conv.contactPhone).map((c) => String(c[3]));
    expect(texte).toEqual(["Danke, ich habe es notiert. Herr Kannapinn meldet sich dazu."]);
    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(c.botActive).toBe(false);
    expect(c.needsAttention).toBe(true);
    expect(c.attentionReason).toBe("Assistent hat nicht geantwortet: bitte Julia Schneider selbst antworten");
    expect(push).toHaveBeenCalled();
    const task = await prisma.leadTask.findUniqueOrThrow({ where: { leadId_kind: { leadId: lead.id, kind: `${BOT_STUMM_MERKER}:${msg.id}` } } });
    expect(task.note).toBe("Assistent hat nicht geantwortet: bitte Julia Schneider selbst antworten");
    expect(await prisma.message.count({ where: { conversationId: conv.id, kind: BOT_STUMM_MERKER } })).toBe(1);
    // Zweiter Lauf: nichts mehr
    waSend.mockClear();
    await runBotStumm();
    expect(waSend.mock.calls.filter((x) => x[2] === conv.contactPhone)).toHaveLength(0);
    expect(await prisma.message.count({ where: { conversationId: conv.id, kind: BOT_STUMM_MERKER } })).toBe(1);
  });

  it("Ausnahmen: jünger als 2 Min., beantwortet, Assistent pausiert, Hinweis schon gesetzt, Stopp, Support-Nummer", async () => {
    const jung = await chat({ minutenAlt: 1 });
    const beantwortet = await chat({ minutenAlt: 5 });
    await prisma.message.create({ data: { conversationId: beantwortet.conv.id, direction: "outbound", kind: "text", body: "Danke!", sentBy: "bot", createdAt: new Date(Date.now() - 4 * MIN) } });
    const pausiert = await chat({ minutenAlt: 5, conv: { botActive: false } });
    const hinweis = await chat({ minutenAlt: 5, conv: { needsAttention: true } });
    const stopp = await chat({ minutenAlt: 5, conv: { optedOutAt: new Date() } });
    const supportDa = await prisma.customer.findUnique({ where: { id: "cust_pg_support" } });
    if (!supportDa) await prisma.customer.create({ data: { id: "cust_pg_support", name: "Support" } });
    const support = await chat({ minutenAlt: 5, cid: "cust_pg_support" });
    await runBotStumm();
    for (const x of [jung, beantwortet, pausiert, hinweis, stopp, support]) {
      expect(await prisma.message.count({ where: { conversationId: x.conv.id, kind: BOT_STUMM_MERKER } })).toBe(0);
      expect(waSend.mock.calls.filter((c) => c[2] === x.conv.contactPhone)).toHaveLength(0);
    }
    await prisma.lead.deleteMany({ where: { customerId: "cust_pg_support", id: support.lead.id } });
    await prisma.conversation.deleteMany({ where: { id: support.conv.id } });
    if (!supportDa) await prisma.customer.delete({ where: { id: "cust_pg_support" } }).catch(() => {});
  });

  it("Diagnose q=bot-stumm: echte Leads und Testleads getrennt, &aufgaben=1 legt Aufgaben für echte offene Fälle an (idempotent)", async () => {
    const echt = await chat({ minutenAlt: 60 * 30 });
    const test = await chat({ minutenAlt: 60 * 30, isTest: true });
    const d = await botStummDiagnose({ tage: 7, aufgaben: false });
    expect(d.echt.liste.some((x) => x.leadId === echt.lead.id && x.kundeId === customerId && x.bisHeuteOffen)).toBe(true);
    expect(d.test.liste.some((x) => x.leadId === test.lead.id)).toBe(true);
    expect(d.echt.liste.some((x) => x.leadId === test.lead.id)).toBe(false);
    expect(await prisma.leadTask.count({ where: { leadId: echt.lead.id } })).toBe(0);
    const a1 = await botStummDiagnose({ tage: 7, aufgaben: true });
    expect(a1.aufgaben!.angelegt).toBeGreaterThanOrEqual(1);
    expect(await prisma.leadTask.count({ where: { leadId: echt.lead.id, kind: `${BOT_STUMM_MERKER}:${echt.msg.id}` } })).toBe(1);
    expect(await prisma.leadTask.count({ where: { leadId: test.lead.id } })).toBe(0);
    const a2 = await botStummDiagnose({ tage: 7, aufgaben: true });
    expect(a2.aufgaben!.angelegt).toBe(0);
    expect(await prisma.leadTask.count({ where: { leadId: echt.lead.id } })).toBe(1);
    // nichts gesendet
    expect(waSend).not.toHaveBeenCalled();
  });
});
