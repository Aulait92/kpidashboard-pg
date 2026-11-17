// Policen vor dem Termin per WhatsApp (Ole, 17.11.2026, lib/policen): Eingang über den Webhook, verschlüsselte
// Ablage, Einwilligung bei Gesundheitsbezug (ja/nein), Schalter aus, Widerruf, Löschfristen, Art. 17, Rechte,
// Einladung durch den Assistenten. Schalter an (docs/recht-gesundheitsunterlagen.md Abschnitt b): Einwilligung vorher,
// keine KI ohne Einwilligung, Verwerfen nach 24 Stunden, Widerruf sinngemäß, Löschfristen mit Abschluss und Behalten.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type AiReq = { system: unknown; tool_choice?: { type: string; name?: string }; output_config?: { format?: unknown }; messages: { role: string; content: unknown }[] };
const st: {
  klass: { police: boolean; sparte: string; gesundheit: boolean };
  auszug: Record<string, unknown>;
  widerruf: boolean | null;
  calls: string[];
  baseURLs: string[];
  botQueue: unknown[];
  ctx: unknown;
} = { klass: { police: true, sparte: "haftpflicht", gesundheit: false }, auszug: {}, widerruf: null, calls: [], baseURLs: [], botQueue: [], ctx: null };

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
    baseURL: string;
    constructor(opts?: { baseURL?: string }) {
      this.baseURL = opts?.baseURL ?? "standard";
    }
    messages = {
      create: async (req: AiReq) => {
        const system = typeof req.system === "string" ? req.system : JSON.stringify(req.system ?? "");
        const json = (x: unknown) => ({ content: [{ type: "text", text: JSON.stringify(x) }], stop_reason: "end_turn" });
        if (req.output_config?.format && system.startsWith("Du ordnest ein Dokument")) {
          st.calls.push("save_sparte");
          st.baseURLs.push(this.baseURL);
          return json(st.klass);
        }
        if (req.output_config?.format && system.startsWith("Du liest eine Police")) {
          st.calls.push("save_vertrag");
          st.baseURLs.push(this.baseURL);
          return json(st.auszug);
        }
        if (req.output_config?.format && system.includes("Einwilligung widerruft")) {
          st.calls.push("widerruf");
          if (st.widerruf === null) throw new Error("KI nicht erreichbar");
          return json({ widerruf: st.widerruf });
        }
        const tool = req.tool_choice?.type === "tool" ? req.tool_choice.name : null;
        st.calls.push(tool ?? "bot");
        if (!tool && st.botQueue.length) return st.botQueue.shift();
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
import { behalteUnterlage, listUnterlagen, ladeUnterlage, loescheUnterlage, prunePolicen, widerrufDurchVermittler } from "@/lib/policen/server";
import { EINWILLIGUNG_VERSION } from "@/lib/policen/regeln";
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
  const foto = (from: string) => send(from, { type: "image", image: { id: `media-${uid()}`, mime_type: "image/jpeg" } });
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
    delete process.env.POLICEN_KI_REGION;
    delete process.env.POLICEN_KI_EU_URL;
    delete process.env.POLICEN_KI_EU_KEY;
    st.widerruf = null;
    st.baseURLs = [];
    st.botQueue = [];
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

  it("Schalter an, Datei vor der Einwilligung: nicht geladen, keine KI, Frage nach der Datei; nach „Ja“ geladen und protokolliert", async () => {
    process.env.POLICEN_GESUNDHEIT_AN = "1";
    st.klass = { police: true, sparte: "kranken", gesundheit: true };
    const { lead, phone } = await leadMitChat();
    await doc(phone, "Krankenversicherung.pdf");
    const pending = await prisma.leadDocument.findMany({ where: { leadId: lead.id } });
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ status: "wartet", data: null, gesundheitsbezug: true, sparte: "kranken", size: 0 });
    expect(pending[0].waMediaId).toBeTruthy();
    // Inhalt nicht geladen, keine KI vor der Einwilligung
    expect(media).not.toHaveBeenCalled();
    expect(st.calls).toEqual([]);
    expect(buttons()).toHaveLength(1);
    const [, , , frage, knoepfe] = buttons()[0] as [string, string, string, string, { id: string; title: string }[]];
    expect(frage).toMatch(/^Danke für Ihre Unterlage\. Unterlagen zur Kranken-, Berufsunfähigkeits-, Lebens-, Pflege- oder Unfallversicherung können Angaben zu Ihrer Gesundheit enthalten\./);
    expect(frage).toContain("Sind Sie einverstanden, dass Herr Kannapinn (Agentur Kannapinn");
    expect(frage).toContain("Unterlagen von mitversicherten Personen schicken Sie bitte nur mit deren Einverständnis");
    expect(frage).toMatch(/Mehr dazu: https:\/\/\S+\/datenschutz\/policen\?k=t-/);
    expect(knoepfe.map((k) => k.title)).toEqual(["Ja, einverstanden", "Lieber im Termin"]);

    const antwortId = `wamid.ja-${uid()}`;
    await send(phone, { id: antwortId, type: "interactive", interactive: { type: "button_reply", button_reply: { id: "policen:ja", title: "Ja, einverstanden" } } });
    const d = await prisma.leadDocument.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(d).toMatchObject({ status: "gespeichert", waMediaId: null, gesundheitsbezug: true, extracted: null, sparte: "kranken" });
    expect(decryptBytes(d.data!).equals(PDF)).toBe(true);
    expect(d.consentAt).toBeTruthy();
    const log = await prisma.bestandConsentLog.findUniqueOrThrow({ where: { id: d.consentId! } });
    // Protokoll: Wortlaut (wie gesendet) mit Version, Zeitpunkt, Nummer, Lead, ID der Knopf-Antwort
    expect(log).toMatchObject({ channel: "whatsapp", action: "erteilt", source: "policen_gesundheit", address: phone, leadId: lead.id, version: EINWILLIGUNG_VERSION });
    expect(log.text).toBe(frage);
    expect(log.waMessageId).toBeTruthy();
    expect(log.confirmedAt).toBeTruthy();
    // einmal geladen (erst nach der Einwilligung), ohne EU-Endpunkt keine KI für mögliche Gesundheitsunterlagen
    expect(media).toHaveBeenCalledTimes(1);
    expect(st.calls).toEqual([]);
    expect(texts().at(-1)).toBe("Danke, ist angekommen.");
    // Weitere Unterlage mit Gesundheitsbezug: Einwilligung liegt vor, sofort gespeichert, ohne KI
    await doc(phone, "BU.pdf");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id, status: "gespeichert", gesundheitsbezug: true } })).toBe(2);
    expect(buttons()).toHaveLength(1);
    expect(st.calls).toEqual([]);
  });

  it("Schalter an: ohne Antwort nach 24 Stunden verworfen, Frage höchstens einmal erneut, danach verwerfen", async () => {
    process.env.POLICEN_GESUNDHEIT_AN = "1";
    const { lead, phone } = await leadMitChat({}, { versichern: "nur ich", vorhanden: "BU bei der Allianz" });
    await foto(phone);
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id, status: "wartet" } })).toBe(1);
    expect(buttons()).toHaveLength(1);
    // Zweites Foto, solange die Frage offen ist: keine zweite Frage
    await foto(phone);
    expect(buttons()).toHaveLength(1);
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id, status: "wartet" } })).toBe(2);
    // Keine Antwort: nach 24 Stunden ist auch die Media-ID weg
    await prisma.leadDocument.updateMany({ where: { leadId: lead.id }, data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
    await prunePolicen(new Date());
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    // Neue Datei: Frage einmal erneut
    await foto(phone);
    expect(buttons()).toHaveLength(2);
    await knopf(phone, "policen:nein", "Lieber im Termin");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    // Danach: nicht mehr fragen, verwerfen mit Hinweis
    await foto(phone);
    expect(buttons()).toHaveLength(2);
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    expect(texts().at(-1)).toContain("speichere ich hier nicht");
    // Nie geladen, nie an die KI
    expect(media).not.toHaveBeenCalled();
    expect(st.calls.filter((c) => c !== "bot")).toEqual([]);
    expect(await prisma.bestandConsentLog.count({ where: { customerId, address: phone } })).toBe(0);
  });

  it("Schalter an: Einladung enthält die Einwilligung, wenn der Lead eine Gesundheitssparte nennt; danach ohne Rückfrage", async () => {
    process.env.POLICEN_GESUNDHEIT_AN = "1";
    const { lead, phone } = await leadMitChat({}, { versichern: "nur ich", vorhanden: "BU bei der Allianz, Haftpflicht HUK" });
    await text(phone, "BU bei der Allianz und Haftpflicht bei der HUK");
    const einladung = buttons().find((b) => /Fotos oder PDFs Ihrer bisherigen Versicherungen/.test(String(b[3])));
    expect(einladung).toBeTruthy();
    expect(String(einladung![3])).toMatch(/^Vor dem Termin können Sie uns Fotos oder PDFs Ihrer bisherigen Versicherungen hier schicken\./);
    expect((einladung![4] as { title: string }[]).map((k) => k.title)).toEqual(["Ja, einverstanden", "Lieber im Termin"]);
    // Zustimmung ohne Datei: protokolliert, kurze Antwort
    await knopf(phone, "policen:ja", "Ja, einverstanden");
    expect(texts().at(-1)).toBe("Danke! Schicken Sie die Unterlagen einfach hier als Foto oder PDF.");
    const log = await prisma.bestandConsentLog.findFirstOrThrow({ where: { customerId, address: phone } });
    expect(log).toMatchObject({ action: "erteilt", leadId: lead.id, version: EINWILLIGUNG_VERSION });
    expect(log.text).toContain("Vor dem Termin können Sie uns Fotos oder PDFs");
    // Foto: sofort gespeichert, ohne EU-Endpunkt keine KI (Lead nennt BU)
    st.calls = [];
    await foto(phone);
    const d = await prisma.leadDocument.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(d).toMatchObject({ status: "gespeichert", gesundheitsbezug: true, consentId: log.id });
    expect(st.calls).toEqual([]);
    // Mit EU-Endpunkt: Zuordnung über die EU, Sachversicherung wird (dort) ausgelesen
    process.env.POLICEN_KI_REGION = "eu";
    process.env.POLICEN_KI_EU_URL = "https://claude-eu.example";
    process.env.POLICEN_KI_EU_KEY = "eu-key";
    st.klass = { police: true, sparte: "haftpflicht", gesundheit: false };
    await foto(phone);
    expect(st.calls).toEqual(["save_sparte", "save_vertrag"]);
    expect(st.baseURLs).toEqual(["https://claude-eu.example", "https://claude-eu.example"]);
    const sach = await prisma.leadDocument.findFirstOrThrow({ where: { leadId: lead.id, gesundheitsbezug: false } });
    expect(sach.extracted).toMatchObject({ gesellschaft: "HUK-Coburg" });
  });

  it("Schalter an, Lead nennt nur Sachversicherungen: KI-Zuordnung und Auslesen über den EU-Endpunkt, wenn eingerichtet", async () => {
    process.env.POLICEN_GESUNDHEIT_AN = "1";
    process.env.POLICEN_KI_REGION = "eu";
    process.env.POLICEN_KI_EU_URL = "https://claude-eu.example";
    process.env.POLICEN_KI_EU_KEY = "eu-key";
    const { lead, phone } = await leadMitChat({}, { versichern: "nur ich", vorhanden: "Hausrat Allianz" });
    await doc(phone, "Hausrat.pdf");
    expect(st.calls).toEqual(["save_sparte", "save_vertrag"]);
    expect(st.baseURLs).toEqual(["https://claude-eu.example", "https://claude-eu.example"]);
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id, status: "gespeichert", gesundheitsbezug: false } })).toBe(1);
  });

  it("Schalter an, minderjähriger Lead laut Formular: keine Einwilligungsfrage, Gesundheitsunterlagen verworfen", async () => {
    process.env.POLICEN_GESUNDHEIT_AN = "1";
    const { lead, phone } = await leadMitChat({ formData: [{ label: "Geburtsdatum", value: "01.06.2010" }] }, { versichern: "nur ich", vorhanden: "BU bei der Allianz, Haftpflicht HUK" });
    await text(phone, "BU bei der Allianz und Haftpflicht bei der HUK");
    expect(buttons()).toHaveLength(0);
    expect(texts()[0]).toContain("Sachversicherungen wie Haftpflicht, Hausrat oder Kfz");
    st.calls = [];
    st.klass = { police: true, sparte: "bu", gesundheit: true };
    await doc(phone, "BU.pdf");
    expect(buttons()).toHaveLength(0);
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    expect(texts().at(-1)).toContain("speichere ich hier nicht");
    // Ein alter Knopf „Ja“ (z. B. weitergeleitet) protokolliert keine Einwilligung
    await knopf(phone, "policen:ja", "Ja, einverstanden");
    expect(await prisma.bestandConsentLog.count({ where: { customerId, address: phone } })).toBe(0);
  });

  it("Schalter aus: Verhalten wie bisher (Einladung nur Sach, KI ordnet zu, Gesundheitsbezug verworfen, keine Knöpfe)", async () => {
    const { lead, phone } = await leadMitChat({}, { versichern: "nur ich", vorhanden: "BU bei der Allianz, Haftpflicht HUK" });
    await text(phone, "BU bei der Allianz und Haftpflicht bei der HUK");
    expect(texts()[0]).toBe(
      "Wenn Sie mögen, schicken Sie gern Fotos oder PDFs Ihrer Policen für Sachversicherungen wie Haftpflicht, Hausrat oder Kfz hier in den Chat, dann kann sich Herr Kannapinn vorher einlesen. Unterlagen zur Kranken-, BU- oder Lebensversicherung schauen wir uns im Termin gemeinsam an.",
    );
    expect(buttons().filter((b) => /Gesundheit/.test(String(b[3])))).toHaveLength(0);
    st.calls = [];
    st.klass = { police: true, sparte: "bu", gesundheit: true };
    await foto(phone);
    expect(st.calls).toEqual(["save_sparte"]);
    expect(media).toHaveBeenCalledTimes(1);
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    expect(texts().at(-1)).toContain("speichere ich hier nicht");
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
    expect(media).not.toHaveBeenCalled();
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

  it("Widerruf sinngemäß: KI erkennt ihn, ohne KI gilt die Regel; normale Nachrichten gehen an den Assistenten", async () => {
    process.env.POLICEN_GESUNDHEIT_AN = "1";
    const { lead, phone } = await leadMitChat();
    await doc(phone, "BU.pdf");
    await knopf(phone, "policen:ja", "Ja, einverstanden");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(1);
    // Kein Verdacht: keine KI-Prüfung, der Assistent antwortet
    st.calls = [];
    await text(phone, "Passt Donnerstag um 10?");
    expect(st.calls).not.toContain("widerruf");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(1);
    // Verdacht, KI nicht erreichbar: Regel sagt nein, nichts gelöscht
    st.widerruf = null;
    await text(phone, "Ich will das doch nicht");
    expect(st.calls).toContain("widerruf");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(1);
    // KI erkennt den sinngemäßen Widerruf: sofort gelöscht, bestätigt, protokolliert
    st.widerruf = true;
    await text(phone, "Hab es mir anders überlegt, bitte nehmt meine Sachen wieder raus");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    expect(texts().at(-1)).toBe("Erledigt, Ihre Unterlagen sind gelöscht.");
    const last = await prisma.bestandConsentLog.findFirst({ where: { customerId, address: phone }, orderBy: { createdAt: "desc" } });
    expect(last).toMatchObject({ action: "widerrufen", leadId: lead.id });
    expect(await prisma.leadHistory.count({ where: { leadId: lead.id, text: { contains: "widerrufen" } } })).toBe(1);
  });

  it("Vermittler: „Einwilligung widerrufen / Unterlagen löschen“ löscht alles und protokolliert", async () => {
    process.env.POLICEN_GESUNDHEIT_AN = "1";
    const { lead, phone } = await leadMitChat();
    await doc(phone, "Pflege.pdf");
    await knopf(phone, "policen:ja", "Ja, einverstanden");
    await doc(phone, "Hausrat.pdf");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(2);
    expect(await widerrufDurchVermittler(lead.id, "anderer-kunde", ownerId)).toBeNull();
    expect(await widerrufDurchVermittler(lead.id, customerId, ownerId)).toEqual({ geloescht: 2 });
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    const last = await prisma.bestandConsentLog.findFirstOrThrow({ where: { customerId, address: phone }, orderBy: { createdAt: "desc" } });
    expect(last).toMatchObject({ action: "widerrufen", actorUserId: ownerId, text: "Widerruf über den Vermittler" });
    // Weitere Datei: keine aktive Einwilligung mehr, also erst wieder fragen
    await doc(phone, "Kranken.pdf");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id, status: "wartet" } })).toBe(1);
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

  it("Löschfristen: 30 Tage nach dem Termin ohne Abschluss, mit Abschluss 90 Tage, offene Einwilligung nach 24 Stunden weg", async () => {
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
    const bDoc = await prisma.leadDocument.findFirstOrThrow({ where: { leadId: b.lead.id } });
    expect(bDoc.deleteAfter?.getTime()).toBe(bDoc.createdAt.getTime() + 90 * DAY);
    expect(bDoc.erinnertAt).toBeNull();
    const cDoc = await prisma.leadDocument.findFirstOrThrow({ where: { leadId: c.lead.id } });
    expect(cDoc.deleteAfter?.getTime()).toBe(now.getTime() + 2 * DAY + 30 * DAY);
    expect(await prisma.leadDocument.count({ where: { id: w.id } })).toBe(0);
  });

  it("Löschfristen mit Abschluss: Erinnerung 14 Tage vorher, dann gelöscht; „Beratungsdokumentation behalten“ verhindert die Löschung", async () => {
    const now = new Date();
    const { lead, phone } = await leadMitChat();
    await doc(phone, "Haftpflicht.pdf");
    await doc(phone, "Hausrat.pdf");
    const [d1, d2] = await prisma.leadDocument.findMany({ where: { leadId: lead.id }, orderBy: { fileName: "asc" } });
    // Abschluss vor 80 Tagen, Unterlagen vorher eingegangen
    await prisma.leadDocument.updateMany({ where: { leadId: lead.id }, data: { createdAt: new Date(now.getTime() - 100 * DAY) } });
    await prisma.lead.update({ where: { id: lead.id }, data: { status: "Abschluss", closedAt: new Date(now.getTime() - 80 * DAY) } });
    // Eine Unterlage behält der Vermittler (mit Vermerk und Zeitpunkt)
    expect(await behalteUnterlage(lead.id, d2.id, { customerId, userId: ownerId, behalten: true, now })).toBe(true);
    const behalten = await prisma.leadDocument.findUniqueOrThrow({ where: { id: d2.id } });
    expect(behalten).toMatchObject({ behaltenVonId: ownerId, behaltenVermerk: "Beratungsdokumentation (§ 61 VVG)", deleteAfter: null });
    expect(behalten.behaltenAt?.getTime()).toBe(now.getTime());
    const liste = await listUnterlagen(lead.id, { preview: false });
    expect(liste.find((u) => u.id === d2.id)).toMatchObject({ behaltenMoeglich: true, loeschtAm: null, behaltenVermerk: "Beratungsdokumentation (§ 61 VVG)" });
    expect(liste.find((u) => u.id === d1.id)?.behaltenMoeglich).toBe(true);

    // 80 Tage nach Abschluss: Erinnerung; Löschung frühestens 14 Tage danach (sonst wäre sie in 10 Tagen)
    const r1 = await prunePolicen(now);
    expect(r1.erinnert).toBeGreaterThanOrEqual(1);
    const e1 = await prisma.leadDocument.findUniqueOrThrow({ where: { id: d1.id } });
    expect(e1.erinnertAt?.getTime()).toBe(now.getTime());
    expect(e1.deleteAfter?.getTime()).toBe(now.getTime() + 14 * DAY);
    expect(await prisma.leadHistory.count({ where: { leadId: lead.id, text: { contains: "in die Kundenakte übernehmen" } } })).toBe(1);
    // Zweiter Lauf: keine zweite Erinnerung
    const r2 = await prunePolicen(new Date(now.getTime() + DAY));
    expect(await prisma.leadHistory.count({ where: { leadId: lead.id, text: { contains: "in die Kundenakte übernehmen" } } })).toBe(1);
    expect(r2.geloescht).toBe(0);
    // Nach Ablauf: gelöscht, behaltene Unterlage bleibt
    await prunePolicen(new Date(now.getTime() + 15 * DAY));
    expect(await prisma.leadDocument.count({ where: { id: d1.id } })).toBe(0);
    expect(await prisma.leadDocument.count({ where: { id: d2.id } })).toBe(1);
    // Behalten aufgehoben: Frist gilt wieder (mit neuer Erinnerung)
    expect(await behalteUnterlage(lead.id, d2.id, { customerId, userId: ownerId, behalten: false })).toBe(true);
    const wieder = await prisma.leadDocument.findUniqueOrThrow({ where: { id: d2.id } });
    expect(wieder).toMatchObject({ behaltenAt: null, behaltenVonId: null, erinnertAt: null });
    expect(wieder.deleteAfter).toBeTruthy();
    expect(await prisma.leadHistory.count({ where: { leadId: lead.id, text: { contains: "wird behalten" } } })).toBe(1);
  });

  it("Gesundheitsangaben aus dem Chat landen nicht in den Angaben des Assistenten", async () => {
    const { conv, phone } = await leadMitChat();
    st.botQueue = [
      {
        content: [
          {
            type: "tool_use",
            id: "q1",
            name: "record_qualification",
            input: { zusammenfassung: "Sucht BU. Hat Diabetes Typ 2.", angaben: { interesse: "BU, Diabetes", wunsch: "Videocall" } },
          },
        ],
        stop_reason: "tool_use",
      },
    ];
    await text(phone, "Ich suche eine BU");
    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(c.qualificationData).toMatchObject({ interesse: "BU", wunsch: "Videocall" });
    expect(c.qualificationSummary).toBe("Sucht BU.");
    const intern = await prisma.message.findFirstOrThrow({ where: { conversationId: conv.id, kind: "qualification" } });
    expect(intern.body).not.toMatch(/Diabetes/i);
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
    // Nur Sachversicherungen genannt: keine Einwilligungsfrage in der Einladung
    expect(buttons().filter((x) => /Gesundheit/.test(String(x[3])))).toHaveLength(0);
  });
});
