// Policen vor dem Termin per WhatsApp (Ole, 17.11.2026, lib/policen): Eingang über den Webhook, verschlüsselte
// Ablage, Einwilligung bei Gesundheitsbezug (ja/nein), Schalter aus, Widerruf, Löschfristen, Art. 17, Rechte,
// Einladung durch den Assistenten.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type AiReq = { system: string; tool_choice?: { type: string; name?: string }; messages: { role: string; content: unknown }[] };
const st: {
  klass: { police: boolean; sparte: string; gesundheit: boolean };
  auszug: Record<string, unknown>;
  calls: string[];
  ctx: unknown;
} = { klass: { police: true, sparte: "haftpflicht", gesundheit: false }, auszug: {}, calls: [], ctx: null };

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
const PDF = Buffer.from("%PDF-1.4\n% Police Privathaftpflicht HUK-Coburg Beitrag 89,50 EUR jaehrlich\n%%EOF");
const media = vi.fn();
vi.mock("@/lib/policen/media", () => ({ ladeMedia: (...a: unknown[]) => media(...a) }));
vi.mock("@/lib/push", () => {
  const rec = async () => ({ sent: 1, removed: 0, errors: [] });
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (req: AiReq) => {
        const tool = req.tool_choice?.type === "tool" ? req.tool_choice.name : null;
        st.calls.push(tool ?? "bot");
        if (tool === "save_sparte") return { content: [{ type: "tool_use", id: "t1", name: tool, input: st.klass }], stop_reason: "tool_use" };
        if (tool === "save_vertrag") return { content: [{ type: "tool_use", id: "t2", name: tool, input: st.auszug }], stop_reason: "tool_use" };
        return { content: [{ type: "text", text: "Danke! Passt Ihnen morgen um 10 Uhr oder um 14 Uhr?" }], stop_reason: "end_turn" };
      },
    };
  },
}));
vi.mock("@/lib/whatsapp/erstinfo-pdf", () => ({ sendErstinfoPdf: async () => "already", sendErstinfo: async () => "already" }));
vi.mock("@/lib/buyer-context", () => ({ getBuyerContext: async () => st.ctx }));

import { prisma } from "@/lib/prisma";
import { decryptBytes, encryptSecret } from "@/lib/encryption";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { runBotTurn } from "@/lib/whatsapp/bot";
import { listUnterlagen, ladeUnterlage, loescheUnterlage, prunePolicen } from "@/lib/policen/server";
import { eraseLead } from "@/lib/erasure";
import { GET } from "@/app/api/buyer/leads/[id]/unterlagen/[docId]/route";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4917${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
const DAY = 24 * 60 * 60 * 1000;
const texts = () => waSend.mock.calls.filter((c) => c[0] === "text").map((c) => String(c[3]));
const buttons = () => waSend.mock.calls.filter((c) => c[0] === "buttons");

describe("Policen per WhatsApp", () => {
  let customerId = "";
  let ownerId = "";
  let advisorId = "";
  const pnid = `pnid-pol-${uid()}`;
  const value = (extra: Record<string, unknown>) => ({ messaging_product: "whatsapp", metadata: { phone_number_id: pnid, display_phone_number: "4930123456789" }, ...extra });
  const send = (from: string, msg: Record<string, unknown>) =>
    handleInboundPayload({ entry: [{ changes: [{ field: "messages", value: value({ contacts: [{ profile: { name: "Julia" } }], messages: [{ from, id: `wamid.in-${uid()}`, ...msg }] }) }] }] });
  const doc = (from: string, filename = "Police.pdf", caption?: string) => send(from, { type: "document", document: { id: `media-${uid()}`, mime_type: "application/pdf", filename, ...(caption ? { caption } : {}) } });
  const knopf = (from: string, id: string, title: string) => send(from, { type: "interactive", interactive: { type: "button_reply", button_reply: { id, title } } });
  const text = (from: string, body: string) => send(from, { type: "text", text: { body } });

  async function leadMitChat(extra: Record<string, unknown> = {}, qualificationData: Record<string, string> = { versichern: "nur ich" }) {
    const phone = newPhone();
    const lead = await prisma.lead.create({
      data: { customerId, name: "Julia Schneider", phone, source: "Privatschutz", status: "Im Gespräch", reached: true, outreachAt: new Date(), assignedUserId: ownerId, ...extra },
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
        qualificationData,
        messages: { create: [{ direction: "outbound", body: "Guten Tag, hier ist der digitale KI-Assistent.", sentBy: "bot" }] },
      },
    });
    return { lead, conv, phone };
  }

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    process.env.ANTHROPIC_API_KEY ||= "test";
    const c = await makeCustomer({ name: `Agentur Kannapinn ${uid()}`, leadAddress: "sie" });
    customerId = c.id;
    ownerId = (await makeBuyer(customerId, "owner")).id;
    advisorId = (await makeBuyer(customerId, "advisor")).id;
    await prisma.erstinformation.create({ data: { customerId, token: `t-${uid()}`, name: "Ole Kannapinn", anrede: "Herr" } });
    await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: false, systemPrompt: "Test" } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: pnid, apiKeyEnc: encryptSecret("k") } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    delete process.env.POLICEN_GESUNDHEIT_AN;
    st.klass = { police: true, sparte: "haftpflicht", gesundheit: false };
    st.auszug = { gesellschaft: "HUK-Coburg", sparte: "haftpflicht", beitrag: 89.5, zahlweise: "jährlich", versicherungssumme: "10 Mio. €", selbstbeteiligung: "keine", ablauf: "01.03.2027", hauptfaelligkeit: "01.03." };
    st.calls = [];
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
    media.mockReset();
    media.mockImplementation(async () => ({ ok: true, data: Buffer.from(PDF), mime: "application/pdf" }));
  });

  it("Sachversicherung: verschlüsselt gespeichert, kurz bestätigt, ausgelesen, Chat zeigt „Dokument empfangen“", async () => {
    const { lead, conv, phone } = await leadMitChat();
    const res = await doc(phone, "HUK Haftpflicht.pdf");
    expect(res.errors).toEqual([]);
    const docs = await prisma.leadDocument.findMany({ where: { leadId: lead.id } });
    expect(docs).toHaveLength(1);
    const d = docs[0];
    expect(d).toMatchObject({ status: "gespeichert", gesundheitsbezug: false, sparte: "haftpflicht", mimeType: "application/pdf", fileName: "HUK Haftpflicht.pdf", consentId: null });
    // Verschlüsselt: Klartext steht nicht in der Datenbank, Entschlüsseln ergibt die Datei
    expect(Buffer.from(d.data!).includes(Buffer.from("Privathaftpflicht"))).toBe(false);
    expect(decryptBytes(d.data!).equals(PDF)).toBe(true);
    expect(d.extracted).toMatchObject({ gesellschaft: "HUK-Coburg", beitrag: 89.5, zahlweise: "jährlich" });
    expect(d.deleteAfter).toBeTruthy();
    expect(texts()).toEqual(["Danke, ist angekommen."]);
    // Klassifizieren und Auslesen, aber keine Antwort des Assistenten (nicht nachhaken)
    expect(st.calls).toEqual(["save_sparte", "save_vertrag"]);
    const msg = await prisma.message.findFirst({ where: { conversationId: conv.id, direction: "inbound" } });
    expect(msg?.body).toBe("Dokument empfangen: HUK Haftpflicht.pdf");
    // Zweites Foto gleich danach: keine zweite Bestätigung
    await send(phone, { type: "image", image: { id: `media-${uid()}`, mime_type: "image/jpeg" } });
    expect(texts()).toEqual(["Danke, ist angekommen."]);
  });

  it("Gesundheitsbezug bei Schalter aus: nicht gespeichert, freundlicher Hinweis, nicht ausgelesen", async () => {
    st.klass = { police: true, sparte: "bu", gesundheit: true };
    const { lead, phone } = await leadMitChat();
    await doc(phone, "scan.pdf");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    expect(texts()[0]).toContain("Unterlagen zur Kranken-, BU- oder Lebensversicherung speichere ich hier nicht");
    expect(texts()[0]).toContain("Herrn Kannapinn");
    expect(st.calls).toEqual(["save_sparte"]);
    expect(buttons()).toHaveLength(0);
  });

  it("Gesundheitsbezug mit Schalter an: erst Einwilligung (nichts gespeichert), nach „Ja, einverstanden“ gespeichert und protokolliert", async () => {
    process.env.POLICEN_GESUNDHEIT_AN = "1";
    st.klass = { police: true, sparte: "kranken", gesundheit: true };
    const { lead, phone } = await leadMitChat();
    await doc(phone, "Krankenversicherung.pdf");
    const pending = await prisma.leadDocument.findMany({ where: { leadId: lead.id } });
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ status: "wartet", data: null, gesundheitsbezug: true });
    expect(pending[0].waMediaId).toBeTruthy();
    expect(buttons()).toHaveLength(1);
    const [, , , frage, knoepfe] = buttons()[0] as [string, string, string, string, { id: string; title: string }[]];
    expect(frage).toBe(
      "Unterlagen zur Kranken-, BU- oder Lebensversicherung können Gesundheitsangaben enthalten. Dürfen wir sie für Herrn Kannapinn zur Vorbereitung speichern? Sie können das jederzeit widerrufen.",
    );
    expect(knoepfe.map((k) => k.title)).toEqual(["Ja, einverstanden", "Lieber im Termin"]);

    await knopf(phone, "policen:ja", "Ja, einverstanden");
    const d = await prisma.leadDocument.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(d).toMatchObject({ status: "gespeichert", waMediaId: null, gesundheitsbezug: true, extracted: null });
    expect(decryptBytes(d.data!).equals(PDF)).toBe(true);
    expect(d.consentAt).toBeTruthy();
    const log = await prisma.bestandConsentLog.findUniqueOrThrow({ where: { id: d.consentId! } });
    expect(log).toMatchObject({ channel: "whatsapp", action: "erteilt", source: "policen_gesundheit", address: phone });
    expect(log.text).toContain("Dürfen wir sie für Herrn Kannapinn zur Vorbereitung speichern?");
    // nie ausgelesen, zweimal geladen (Klassifikation, nach der Einwilligung)
    expect(st.calls).not.toContain("save_vertrag");
    expect(media).toHaveBeenCalledTimes(2);
    expect(texts().at(-1)).toBe("Danke, ist angekommen.");
    // Weitere Unterlage mit Gesundheitsbezug: Einwilligung liegt vor, sofort gespeichert
    await doc(phone, "BU.pdf");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id, status: "gespeichert" } })).toBe(2);
    expect(buttons()).toHaveLength(1);
  });

  it("Einwilligung abgelehnt: Datei verworfen, „Kein Problem, dann schauen wir sie im Termin an.“", async () => {
    process.env.POLICEN_GESUNDHEIT_AN = "1";
    st.klass = { police: true, sparte: "leben", gesundheit: true };
    const { lead, phone } = await leadMitChat();
    await doc(phone);
    await knopf(phone, "policen:nein", "Lieber im Termin");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    expect(texts().at(-1)).toBe("Kein Problem, dann schauen wir sie im Termin an.");
    expect(await prisma.bestandConsentLog.count({ where: { customerId, address: phone } })).toBe(0);
    expect(media).toHaveBeenCalledTimes(1);
  });

  it("Widerruf: alle Unterlagen sofort gelöscht, Widerruf protokolliert", async () => {
    process.env.POLICEN_GESUNDHEIT_AN = "1";
    st.klass = { police: true, sparte: "kranken", gesundheit: true };
    const { lead, phone } = await leadMitChat();
    await doc(phone);
    await knopf(phone, "policen:ja", "Ja, einverstanden");
    st.klass = { police: true, sparte: "hausrat", gesundheit: false };
    await doc(phone, "Hausrat.pdf");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(2);
    await text(phone, "Widerruf");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    expect(texts().at(-1)).toBe("Erledigt, Ihre Unterlagen sind gelöscht.");
    const last = await prisma.bestandConsentLog.findFirst({ where: { customerId, address: phone }, orderBy: { createdAt: "desc" } });
    expect(last?.action).toBe("widerrufen");
    // Ohne Unterlagen und Einwilligung ist „löschen“ eine normale Nachricht für den Assistenten
    st.calls = [];
    await text(phone, "Bitte meine Unterlagen löschen");
    expect(st.calls).toContain("bot");
  });

  it("Rechte: Inhaber und zuständiger Berater sehen die Datei, Admin-Vorschau keine Inhalte mit Gesundheitsbezug, fremder Berater nichts", async () => {
    process.env.POLICEN_GESUNDHEIT_AN = "1";
    const { lead, phone } = await leadMitChat();
    await doc(phone, "Haftpflicht.pdf");
    st.klass = { police: true, sparte: "kranken", gesundheit: true };
    await doc(phone, "Kranken.pdf");
    await knopf(phone, "policen:ja", "Ja, einverstanden");
    const docs = await prisma.leadDocument.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } });
    const [sach, ges] = docs;
    const get = (docId: string) => GET(new Request("http://x"), { params: Promise.resolve({ id: lead.id, docId }) });

    st.ctx = { customerId, email: "o@x", preview: false, userId: ownerId, teamRole: "owner" };
    expect((await get(sach.id)).status).toBe(200);
    const r = await get(ges.id);
    expect(r.status).toBe(200);
    expect(Buffer.from(await r.arrayBuffer()).equals(PDF)).toBe(true);
    expect(r.headers.get("cache-control")).toContain("no-store");
    // Zugriff auf Gesundheitsunterlagen wird protokolliert
    expect(await prisma.auditLog.count({ where: { action: "policen.ansehen", entityId: ges.id } })).toBe(1);

    // Admin in „Als Kunde ansehen“: Sachversicherung ja, Gesundheitsbezug nein (auch nicht der Dateiname)
    st.ctx = { customerId, email: "admin@x", preview: true, userId: null, teamRole: "owner" };
    expect((await get(sach.id)).status).toBe(200);
    expect((await get(ges.id)).status).toBe(404);
    const liste = await listUnterlagen(lead.id, { preview: true });
    const g = liste.find((u) => u.id === ges.id)!;
    expect(g).toMatchObject({ ansehen: false, gesundheit: true, auszug: null });
    expect(g.fileName).not.toContain("Kranken");
    expect(g.consentAt).toBeTruthy();
    expect(liste.find((u) => u.id === sach.id)?.auszug).toContain("HUK-Coburg");

    // Berater, dem der Lead nicht gehört
    st.ctx = { customerId, email: "b@x", preview: false, userId: advisorId, teamRole: "advisor" };
    expect((await get(sach.id)).status).toBe(404);
    // anderer Kunde
    expect(await ladeUnterlage(lead.id, sach.id, { customerId: "anderer", preview: false, userId: ownerId })).toBeNull();
    // Vermittler löscht eine Unterlage
    expect(await loescheUnterlage(lead.id, sach.id, customerId, ownerId)).toBe(true);
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(1);
  });

  it("Löschfristen: 30 Tage nach dem Termin ohne Abschluss, mit Abschluss bleibt, offene Einwilligung nach 24 Stunden weg", async () => {
    const now = new Date();
    const a = await leadMitChat();
    await doc(a.phone);
    await prisma.appointment.create({ data: { customerId, leadId: a.lead.id, mode: "video", startsAt: new Date(now.getTime() - 31 * DAY), status: "completed" } });
    const b = await leadMitChat();
    await doc(b.phone);
    await prisma.appointment.create({ data: { customerId, leadId: b.lead.id, mode: "video", startsAt: new Date(now.getTime() - 31 * DAY), status: "completed" } });
    await prisma.lead.update({ where: { id: b.lead.id }, data: { status: "Abschluss" } });
    const c = await leadMitChat();
    await doc(c.phone);
    await prisma.appointment.create({ data: { customerId, leadId: c.lead.id, mode: "video", startsAt: new Date(now.getTime() + 2 * DAY) } });
    const w = await prisma.leadDocument.create({
      data: { customerId, leadId: c.lead.id, status: "wartet", waMediaId: "m1", mimeType: "application/pdf", fileName: "x.pdf", size: 1, gesundheitsbezug: true, createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000) },
    });

    const r = await prunePolicen(now);
    expect(r.wartet).toBeGreaterThanOrEqual(1);
    expect(await prisma.leadDocument.count({ where: { leadId: a.lead.id } })).toBe(0);
    expect(await prisma.leadDocument.count({ where: { leadId: b.lead.id } })).toBe(1);
    expect((await prisma.leadDocument.findFirst({ where: { leadId: b.lead.id } }))?.deleteAfter).toBeNull();
    const cDoc = await prisma.leadDocument.findFirstOrThrow({ where: { leadId: c.lead.id } });
    expect(cDoc.deleteAfter?.getTime()).toBe(now.getTime() + 2 * DAY + 30 * DAY);
    expect(await prisma.leadDocument.count({ where: { id: w.id } })).toBe(0);
  });

  it("Art. 17: Löschen des Leads löscht Unterlagen und Einwilligung", async () => {
    process.env.POLICEN_GESUNDHEIT_AN = "1";
    st.klass = { police: true, sparte: "pflege", gesundheit: true };
    const { lead, phone } = await leadMitChat();
    await doc(phone);
    await knopf(phone, "policen:ja", "Ja, einverstanden");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(1);
    await eraseLead(lead.id, { role: "system" });
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    expect(await prisma.bestandConsentLog.count({ where: { customerId, address: phone } })).toBe(0);
  });

  it("ohne Lead (privater Chat): nichts geladen, nichts gespeichert", async () => {
    const phone = newPhone();
    await doc(phone);
    expect(media).not.toHaveBeenCalled();
    expect(await prisma.leadDocument.count({ where: { customerId, conversationId: { not: null }, lead: { phone } } })).toBe(0);
  });

  it("Assistent lädt nach der Vertragsfrage einmal ein; Bereitlegen-Liste ohne bisherige Policen", async () => {
    const { conv, phone } = await leadMitChat({}, { versichern: "nur ich", vorhanden: "Haftpflicht bei der HUK" });
    await text(phone, "Haftpflicht bei der HUK");
    const t = texts();
    expect(t).toHaveLength(2);
    expect(t[0]).toBe(
      "Wenn Sie mögen, schicken Sie gern Fotos oder PDFs Ihrer Policen für Sachversicherungen wie Haftpflicht, Hausrat oder Kfz hier in den Chat, dann kann sich Herr Kannapinn vorher einlesen. Sonst schauen wir sie im Termin gemeinsam an.",
    );
    expect(t[1]).toContain("Passt Ihnen");
    // nur einmal
    waSend.mockClear();
    await runBotTurn(conv.id);
    expect(texts().filter((x) => /Fotos oder PDFs/.test(x))).toHaveLength(0);
    // Schalter an: Wortlaut ohne Einschränkung
    process.env.POLICEN_GESUNDHEIT_AN = "1";
    const b = await leadMitChat({}, { vorhanden: "Hausrat Allianz" });
    await text(b.phone, "Hausrat bei der Allianz");
    expect(texts().some((x) => x.startsWith("Wenn Sie mögen, schicken Sie gern Fotos oder PDFs Ihrer Policen hier in den Chat, dann kann sich Herr Kannapinn vorher einlesen."))).toBe(true);
  });
});
