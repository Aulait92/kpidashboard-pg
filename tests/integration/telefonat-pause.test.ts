// Telefonate sauber erfassen (Ole, 15.11.2026, lib/telefonat.ts): „Anrufen“ pausiert den WhatsApp-Assistenten für
// diesen Lead (keine Antwort, kein Nachfassen, kein Erstanschreiben), bis ein Ergebnis eingetragen ist. Der Bedarf aus
// dem Telefonat landet am Lead und im Chat; was offen bleibt, fragt der Assistent danach mit Bezug aufs Telefonat ab.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st: { ai: number; last: { system: string; messages: { role: string; content: unknown }[] } | null } = { ai: 0, last: null };
const waSend = vi.fn();
vi.mock("@/lib/whatsapp/dialog360", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/dialog360")>();
  return {
    ...real,
    sendText: (...a: unknown[]) => waSend("text", ...a),
    sendTemplate: (...a: unknown[]) => waSend("template", ...a),
    sendButtons: (...a: unknown[]) => waSend("buttons", ...a),
    sendDocument: (...a: unknown[]) => waSend("document", ...a),
  };
});
const pushed = vi.fn();
vi.mock("@/lib/push", () => {
  const rec = async (...a: unknown[]) => {
    pushed(...a);
    return { sent: 1, removed: 0, errors: [] };
  };
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (req: { system: string; messages: { role: string; content: unknown }[] }) => {
        st.ai++;
        st.last = req;
        return { content: [{ type: "text", text: "Gern, kurz vorab: Wie groß ist Ihre Wohnung?" }], stop_reason: "end_turn" };
      },
    };
  },
}));
vi.mock("@/lib/whatsapp/erstinfo-pdf", () => ({ sendErstinfoPdf: async () => "already", sendErstinfo: async () => "already" }));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { runBotTurn } from "@/lib/whatsapp/bot";
import { anrufErledigt, anrufGestartet, anrufPausiert, bedarfLaden, bedarfSpeichern, runAnrufErinnerungen, runOffeneFragen } from "@/lib/telefonat-server";
import { runSequences } from "@/lib/lead-sequences";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4917${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
const DAY = 24 * 60 * 60 * 1000;

describe("Telefonat: Assistent pausiert beim Anruf", () => {
  let customerId = "";
  let userId = "";
  const pnid = `pnid-tel-${uid()}`;
  const value = (extra: Record<string, unknown>) => ({ messaging_product: "whatsapp", metadata: { phone_number_id: pnid, display_phone_number: "4930123456789" }, ...extra });
  const inbound = (from: string, text: string) =>
    handleInboundPayload({
      entry: [{ changes: [{ field: "messages", value: value({ contacts: [{ profile: { name: "Julia" } }], messages: [{ from, id: `wamid.in-${uid()}`, type: "text", text: { body: text } }] }) }] }],
    });

  async function leadMitChat(extra: Record<string, unknown> = {}) {
    const phone = newPhone();
    const lead = await prisma.lead.create({
      data: {
        customerId,
        name: "Julia Schneider",
        phone,
        source: "Privatschutz",
        status: "Im Gespräch",
        reached: true,
        outreachAt: new Date(),
        formData: [{ label: "Versicherungsinteresse", value: "Hausrat" }],
        ...extra,
      },
    });
    const conv = await prisma.conversation.create({
      data: {
        customerId,
        leadId: lead.id,
        contactPhone: phone,
        contactName: "Julia",
        botActive: true,
        windowExpiresAt: new Date(Date.now() + DAY),
        lastMessageAt: new Date(),
        qualificationData: { versichern: "nur ich" },
        messages: { create: [{ direction: "outbound", body: "Guten Tag, hier ist der Assistent.", sentBy: "bot" }] },
      },
    });
    return { lead, conv, phone };
  }

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    process.env.ANTHROPIC_API_KEY ||= "test";
    const c = await makeCustomer({ name: `Agentur Meier ${uid()}`, leadAddress: "sie" });
    customerId = c.id;
    userId = (await makeBuyer(customerId, "owner")).id;
    await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: false, followUpSequencesEnabled: true, systemPrompt: "Test" } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: pnid, apiKeyEnc: encryptSecret("k") } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    st.ai = 0;
    st.last = null;
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
    pushed.mockReset();
  });

  it("während des Anrufs antwortet der Assistent nicht, die Nachricht wartet auf den Vermittler; danach wieder normal", async () => {
    const { lead, conv, phone } = await leadMitChat();
    expect(await anrufGestartet(lead.id, customerId)).toBe(true);
    expect(await anrufPausiert(lead.id)).toBe(true);

    const res = await inbound(phone, "Ich habe gerade Ihren Anruf verpasst");
    expect(res.errors).toEqual([]);
    expect(st.ai).toBe(0);
    expect(waSend).not.toHaveBeenCalled();
    const c = await prisma.conversation.findUnique({ where: { id: conv.id } });
    expect(c).toMatchObject({ needsAttention: true, botActive: true });
    // Auch ein direkter Anstoß (z. B. aus anderen Abläufen) bleibt still
    await runBotTurn(conv.id);
    expect(st.ai).toBe(0);

    // Ergebnis eingetragen: Pause vorbei, der Assistent antwortet wieder
    await anrufErledigt(lead.id);
    expect(await anrufPausiert(lead.id)).toBe(false);
    await inbound(phone, "Wann passt es Ihnen?");
    expect(st.ai).toBeGreaterThan(0);
    expect(waSend).toHaveBeenCalled();
  });

  it("Pause endet von selbst nach 12 Stunden", async () => {
    const { lead } = await leadMitChat();
    await prisma.lead.update({ where: { id: lead.id }, data: { callStartedAt: new Date(Date.now() - 13 * 60 * 60 * 1000) } });
    expect(await anrufPausiert(lead.id)).toBe(false);
  });

  it("kein Nachfassen während des Anrufs: Schritt der Abfolge wartet", async () => {
    const { lead, phone } = await leadMitChat({ status: "Angebot gesendet" });
    const s = await prisma.leadSequence.create({ data: { customerId, leadId: lead.id, kind: "offer", step: 0, startedAt: new Date(Date.now() - 3 * DAY), nextAt: new Date(Date.now() - 60_000) } });
    await anrufGestartet(lead.id, customerId);
    // Zeitpunkt im Versandfenster (Dienstag 11 Uhr Berlin)
    const now = new Date("2026-11-17T10:00:00Z");
    await prisma.leadSequence.update({ where: { id: s.id }, data: { nextAt: new Date(now.getTime() - 60_000), startedAt: new Date(now.getTime() - 3 * DAY) } });
    await prisma.lead.update({ where: { id: lead.id }, data: { callStartedAt: new Date(now.getTime() - 60_000) } });
    await runSequences(now);
    const after = await prisma.leadSequence.findUnique({ where: { id: s.id } });
    expect(after).toMatchObject({ step: 0, stoppedAt: null });
    // (andere Leads der Testdatenbank dürfen nachgefasst werden, dieser nicht)
    expect(waSend.mock.calls.filter((c) => c.includes(phone))).toEqual([]);
  });

  it("Erinnerung per Push 15 Minuten nach „Anrufen“ ohne Ergebnis, einmal", async () => {
    const { lead } = await leadMitChat({ assignedUserId: userId });
    const now = new Date();
    await prisma.lead.update({ where: { id: lead.id }, data: { callStartedAt: new Date(now.getTime() - 16 * 60_000) } });
    const p = vi.fn(async () => undefined);
    expect(await runAnrufErinnerungen(now, { push: p })).toBeGreaterThanOrEqual(1);
    expect(p).toHaveBeenCalledWith(userId, customerId, expect.objectContaining({ body: expect.stringContaining("Julia Schneider") }));
    p.mockClear();
    await runAnrufErinnerungen(now, { push: p });
    expect(p).not.toHaveBeenCalledWith(userId, customerId, expect.anything());
  });

  it("Bedarf aus dem Telefonat: am Lead und im Chat, Pause endet, offene Punkte fragt der Assistent danach mit Bezug aufs Telefonat ab", async () => {
    const { lead, conv } = await leadMitChat();
    await anrufGestartet(lead.id, customerId);
    const vorher = await bedarfLaden(lead.id, customerId);
    // „nur ich“ aus dem Chat ist schon bekannt
    expect(vorher!.felder.find((f) => f.key === "versichern")!.wert).toBe("nur ich");
    expect(vorher!.offen).toContain("Geburtsdatum");

    const now = new Date("2026-11-17T10:00:00Z"); // Dienstag, 11 Uhr Berlin
    const r = await bedarfSpeichern(lead.id, customerId, { angaben: { geburt: "22.08.1992", vorhanden: "keine" }, notiz: "Will Hausrat für die neue Wohnung", userId }, now);
    expect(r!.stand).toBe("teilweise");
    expect(r!.offen).not.toContain("Geburtsdatum");
    expect(r!.offen).toContain("Wohnfläche, ständig bewohnt");
    const l = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(l).toMatchObject({ needState: "teilweise", callStartedAt: null, reached: true });
    expect(l!.openQuestionsAt!.getTime()).toBe(now.getTime() + 10 * 60_000);
    expect((await prisma.conversation.findUnique({ where: { id: conv.id } }))!.qualificationData).toMatchObject({ versichern: "nur ich", geburt: "22.08.1992", vorhanden: "keine" });
    const hist = await prisma.leadHistory.findFirst({ where: { leadId: lead.id, kind: "anruf" }, orderBy: { createdAt: "desc" } });
    expect(hist!.text).toContain("Bedarf teilweise besprochen");
    expect(hist!.text).toContain("Noch offen:");

    // Ohne Termin fragt der Assistent nicht nach
    const spaeter = new Date(now.getTime() + 11 * 60_000);
    const turn = vi.fn(async () => undefined);
    await runOffeneFragen(spaeter, { botTurn: turn });
    expect(turn).not.toHaveBeenCalled();

    // Mit Termin: einmal, nur die offenen Punkte
    await prisma.lead.update({ where: { id: lead.id }, data: { openQuestionsAt: now } });
    await prisma.appointment.create({ data: { customerId, leadId: lead.id, conversationId: conv.id, mode: "phone", startsAt: new Date(now.getTime() + 3 * DAY) } });
    await prisma.conversation.update({ where: { id: conv.id }, data: { windowExpiresAt: new Date(now.getTime() + DAY) } });
    await runOffeneFragen(spaeter);
    expect(st.ai).toBe(1);
    expect(waSend).toHaveBeenCalled();
    const last = st.last!.messages[st.last!.messages.length - 1];
    expect(last.role).toBe("user");
    expect(String(last.content)).toContain("hat gerade mit dem Interessenten telefoniert");
    expect(String(last.content)).toContain("Wohnfläche, ständig bewohnt");
    expect(String(last.content)).not.toContain("Geburtsdatum;");
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))!.openQuestionsAt).toBeNull();
    // Nicht doppelt
    await runOffeneFragen(spaeter);
    expect(st.ai).toBe(1);
  });

  it("Überspringen beim Termin: Assistent fragt vorsichtig nach; alles bekannt: keine Nachfrage", async () => {
    const { lead } = await leadMitChat();
    const now = new Date("2026-11-17T10:00:00Z");
    const r = await bedarfSpeichern(lead.id, customerId, { uebersprungen: true }, now);
    expect(r!.stand).toBeNull();
    const l = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(l!.needState).toBeNull();
    expect(l!.openQuestionsAt).not.toBeNull();

    const { lead: l2 } = await leadMitChat({ source: "TKV-Katze" });
    const r2 = await bedarfSpeichern(l2.id, customerId, { angaben: { tier: "Katze Bernd, gesund", tarifwunsch: "nur OP", geburt: "1.1.1990", vorhanden: "keine" } }, now);
    expect(r2).toMatchObject({ stand: "komplett", offen: [] });
    expect((await prisma.lead.findUnique({ where: { id: l2.id } }))!.openQuestionsAt).toBeNull();
  });
});
