// Policen-Strecke v2 mit WhatsApp Flow (hinter POLICEN_FLOW): Schalter aus = heutige Strecke; Schalter an: Chat-Nachricht
// als Flow-Nachricht bzw. Vorlage, Antwort nfm_reply mit 2 Dateien → Ablage und Einwilligung (ki true/false, Textversion,
// Hash), „Später“ → höchstens 2 Erinnerungen, „Nein, danke“ stoppt, Pay-per-Lead-Kunden nie, Anlegen bei 360dialog nur
// mit Schalter, K2 (Kranken/BU/Leben ohne Nachweis „keine Speicherung“ nie ausgelesen, KI-Satz neutral).
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/whatsapp/bot", async (orig) => ({ ...(await orig<typeof import("@/lib/whatsapp/bot")>()), runBotTurn: async () => undefined }));
const waSend = vi.fn();
vi.mock("@/lib/whatsapp/dialog360", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/dialog360")>();
  return {
    ...real,
    sendText: (...a: unknown[]) => waSend("text", ...a),
    sendTemplate: (...a: unknown[]) => waSend("template", ...a),
    sendButtons: (...a: unknown[]) => waSend("buttons", ...a),
    sendDocument: (...a: unknown[]) => waSend("document", ...a),
    sendFlow: (...a: unknown[]) => waSend("flow", ...a),
    listTemplates: async () => [],
    createTemplate: async (_k: string, req: { name: string; category: string }) => ({ name: req.name, language: "de", status: "PENDING", category: req.category, rejectedReason: null }),
  };
});
const media = vi.fn();
const mediaDelete = vi.fn();
vi.mock("@/lib/policen/media", () => ({ ladeMedia: (...a: unknown[]) => media(...a), loescheMedia: (...a: unknown[]) => mediaDelete(...a), downloadUrl: (u: string) => u }));
const flowApi = { create: vi.fn(), get: vi.fn(), list: vi.fn(), upload: vi.fn(), publish: vi.fn() };
vi.mock("@/lib/policen/flow/dialog360-flows", () => ({
  createFlow: (...a: unknown[]) => flowApi.create(...a),
  getFlow: (...a: unknown[]) => flowApi.get(...a),
  listFlows: (...a: unknown[]) => flowApi.list(...a),
  uploadFlowJson: (...a: unknown[]) => flowApi.upload(...a),
  publishFlow: (...a: unknown[]) => flowApi.publish(...a),
}));
vi.mock("@/lib/push", () => {
  const rec = async () => ({ sent: 1, removed: 0, errors: [] });
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});
const st = { kiAufrufe: 0 };
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async () => {
        st.kiAufrufe++;
        return { content: [{ type: "text", text: "Danke!" }], stop_reason: "end_turn" };
      },
    };
  },
}));
vi.mock("openai", () => ({
  default: class {
    constructor() {
      st.kiAufrufe++;
    }
  },
}));
vi.mock("@/lib/whatsapp/erstinfo-pdf", () => ({ sendErstinfoPdf: async () => "already", sendErstinfo: async () => "already" }));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { erinnerungOptIn } from "@/lib/policen/server";
import { setzeSpeicherFuerTests, type Speicher } from "@/lib/policen/ablage";
import { kiAbgelehnt } from "@/lib/policen/ohne-ki";
import { kiEinwilligung, sperreFuer } from "@/lib/policen/auslesen/server";
import { freigegebeneSparten } from "@/lib/policen/auslesen/konfig";
import * as flow from "@/lib/policen/flow/server";
import { flowJsonHash } from "@/lib/policen/flow/flow-json";
import { FLOW_TEXT_VERSION_SACH } from "@/lib/policen/flow/texte";
import * as strecke from "@/lib/whatsapp/termin-strecke";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";
import { starteClamd, type ClamdAttrappe } from "../fixtures/clamd";

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4916${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const PDF = Buffer.from("%PDF-1.4\n% Police Hausrat Beitrag 89,50 EUR\n%%EOF");
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]), Buffer.from("JFIF Foto Police Haftpflicht")]);
const b64sha = (b: Buffer) => createHash("sha256").update(b).digest("base64");
const calls = (art: string) => waSend.mock.calls.filter((c) => c[0] === art);

const bucket = new Map<string, Buffer>();
const memory: Speicher = {
  put: async (k, b) => void bucket.set(k, b),
  get: async (k) => bucket.get(k) ?? null,
  del: async (ks) => ks.forEach((k) => bucket.delete(k)),
  list: async (p) => [...bucket.keys()].filter((k) => k.startsWith(p)).map((key) => ({ key, at: new Date(0) })),
};
const ABLAGE_ENV = {
  POLICEN_S3_ENDPOINT: "https://test123.eu.r2.cloudflarestorage.com",
  POLICEN_S3_BUCKET: "pg-policen-eu",
  POLICEN_S3_ACCESS_KEY_ID: "id",
  POLICEN_S3_SECRET_ACCESS_KEY: "secret",
  POLICEN_SCHLUESSEL: Buffer.alloc(32, 11).toString("base64"),
};

describe("Policen-Strecke v2 (WhatsApp Flow)", () => {
  let clamd: ClamdAttrappe;
  let customerId = "";
  let pplId = "";
  let ownerId = "";
  const pnid = `pnid-pflow-${uid()}`;
  const send = (from: string, msg: Record<string, unknown>) =>
    handleInboundPayload({
      entry: [{ changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: pnid }, contacts: [{ profile: { name: "Julia" } }], messages: [{ from, id: `wamid.in-${uid()}`, ...msg }] } }] }],
    });
  const nfm = (from: string, response: Record<string, unknown>, context?: string | null) =>
    send(from, { type: "interactive", interactive: { type: "nfm_reply", nfm_reply: { name: "flow", body: "Sent", response_json: JSON.stringify(response) } }, ...(context ? { context: { id: context } } : {}) });
  const quickReply = (from: string, payload: string, text: string) => send(from, { type: "button", button: { payload, text } });
  const text = (from: string, body: string) => send(from, { type: "text", text: { body } });

  async function leadMitTermin(o: { source?: string; inTagen?: number; cid?: string } = {}) {
    const cid = o.cid ?? customerId;
    const phone = newPhone();
    const lead = await prisma.lead.create({ data: { customerId: cid, name: "Julia Schneider", phone, source: o.source ?? "Privatschutz", status: "Termin", reached: true, assignedUserId: ownerId } });
    const conv = await prisma.conversation.create({
      data: { customerId: cid, leadId: lead.id, contactPhone: phone, contactName: "Julia", botActive: true, windowExpiresAt: new Date(Date.now() + DAY), lastMessageAt: new Date() },
    });
    const termin = await prisma.appointment.create({ data: { customerId: cid, leadId: lead.id, conversationId: conv.id, mode: "video", startsAt: new Date(Date.now() + (o.inTagen ?? 4) * DAY), komplettcheck: false } });
    return { lead, conv, phone, termin };
  }
  async function flowVeroeffentlicht(cid: string, vorlagen: Record<string, unknown> = {}) {
    await prisma.policenFlow.upsert({
      where: { customerId: cid },
      create: { customerId: cid, flowId: "flow-123", name: "policen_senden_x", jsonHash: flowJsonHash(), status: "veroeffentlicht", vorlagen: vorlagen as object },
      update: { flowId: "flow-123", jsonHash: flowJsonHash(), status: "veroeffentlicht", vorlagen: vorlagen as object },
    });
  }
  const letzterMerker = async (conversationId: string) =>
    JSON.parse((await prisma.message.findFirstOrThrow({ where: { conversationId, kind: flow.MERKER_FLOW }, orderBy: { createdAt: "desc" } })).body!) as flow.FlowMerker;

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    process.env.ANTHROPIC_API_KEY ||= "test";
    // Kein Pay-per-Lead (Paket mit Betreuung)
    customerId = (await makeCustomer({ name: `Agentur Flow ${uid()}`, leadAddress: "sie", plan: "service" })).id;
    ownerId = (await makeBuyer(customerId, "owner")).id;
    clamd = await starteClamd();
    await prisma.erstinformation.create({ data: { customerId, token: `t-${uid()}`, name: "Ole Kannapinn", anrede: "Herr", firma: "Kannapinn Versicherungen" } });
    await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: false, systemPrompt: "Test" } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: pnid, apiKeyEnc: encryptSecret("k") } });
    // Pay-per-Lead-Kunde (Standardpaket ohne Betreuung) mit verbundener Nummer
    pplId = (await makeCustomer({ name: `PPL ${uid()}`, leadAddress: "sie" })).id;
    await prisma.whatsAppAccount.create({ data: { customerId: pplId, status: "connected", phoneNumberId: `pnid-ppl-${uid()}`, apiKeyEnc: encryptSecret("k2") } });
  });
  afterAll(async () => {
    setzeSpeicherFuerTests(null);
    for (const k of Object.keys(ABLAGE_ENV)) delete process.env[k];
    delete process.env.CLAMAV_HOST;
    delete process.env.CLAMAV_PORT;
    delete process.env.POLICEN_FLOW;
    await clamd.stop();
    await prisma.policenFlow.deleteMany({ where: { customerId: { in: [customerId, pplId] } } });
    await cleanupCustomer(customerId);
    await cleanupCustomer(pplId);
  });
  beforeEach(async () => {
    Object.assign(process.env, ABLAGE_ENV, { CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: String(clamd.port) });
    delete process.env.POLICEN_FLOW;
    delete process.env.POLICEN_FLOW_KUNDEN;
    delete process.env.POLICEN_WHATSAPP_AUS;
    delete process.env.POLICEN_OPENAI_API_KEY;
    setzeSpeicherFuerTests(memory);
    st.kiAufrufe = 0;
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
    media.mockReset();
    mediaDelete.mockReset();
    mediaDelete.mockImplementation(async () => true);
    for (const f of Object.values(flowApi)) f.mockReset();
    await prisma.policenFlow.deleteMany({ where: { customerId: { in: [customerId, pplId] } } });
  });

  it("Schalter aus: heutige Strecke (Bitte und Einwilligung), kein Anlegen bei 360dialog, keine v2-Erinnerungen", async () => {
    await flowVeroeffentlicht(customerId);
    const { conv } = await leadMitTermin();
    expect(await flow.aktiverFlow(customerId)).toBeNull();
    expect(await flow.policenFlowMoeglich(conv.id)).toBe(false);
    const k = (await strecke.streckenKontext(conv.id))!;
    const s = await strecke.naechsterSchritt(k);
    expect(s?.merker).toBe(strecke.STRECKE.policenBitte);
    expect(s?.flow).toBeUndefined();
    expect(s?.folge?.text).toMatch(/^Kurz zum Datenschutz: Ich bin einverstanden/);
    expect(s?.folge?.buttons.map((b) => b.title)).toEqual(["Einverstanden", "Lieber nicht"]);
    expect(await flow.syncPolicenFlows(new Date())).toEqual({ geprueft: 0, fehler: 0 });
    expect(await flow.runPolicenFlowErinnerungen(new Date())).toEqual({ gesendet: 0 });
    expect(await flow.sendeFlowNachricht(conv.id, "bitte")).toBeNull();
    expect(flowApi.create).not.toHaveBeenCalled();
    expect(waSend).not.toHaveBeenCalled();
  });

  it("Anlegen bei 360dialog nur mit Schalter, nie für Pay-per-Lead-Kunden; danach Vorlagen (UTILITY) eingereicht", async () => {
    process.env.POLICEN_FLOW = "1";
    flowApi.list.mockResolvedValue([]);
    flowApi.create.mockResolvedValue({ id: "flow-neu", validationErrors: [] });
    flowApi.get.mockResolvedValue({ id: "flow-neu", name: "x", status: "PUBLISHED", validationErrors: [] });
    process.env.POLICEN_FLOW_KUNDEN = `${customerId},${pplId}`;
    const r = await flow.syncPolicenFlows(new Date(), { limit: 50 });
    expect(r.fehler).toBe(0);
    expect(flowApi.create).toHaveBeenCalledTimes(1);
    expect(flowApi.create.mock.calls[0][1]).toMatchObject({ publish: true });
    expect(JSON.parse(flowApi.create.mock.calls[0][1].flowJson).screens).toHaveLength(2);
    const rec = await prisma.policenFlow.findUniqueOrThrow({ where: { customerId } });
    expect(rec).toMatchObject({ flowId: "flow-neu", status: "veroeffentlicht", jsonHash: flowJsonHash() });
    const v = rec.vorlagen as Record<string, { status: string; category: string }>;
    expect(Object.keys(v)).toHaveLength(6);
    expect(Object.values(v).every((x) => x.category === "utility")).toBe(true);
    expect(await prisma.policenFlow.count({ where: { customerId: pplId } })).toBe(0);
    // Pay-per-Lead nie aktiv, auch mit veröffentlichtem Flow
    await flowVeroeffentlicht(pplId);
    expect(await flow.aktiverFlow(pplId)).toBeNull();
    // Validierungsfehler bei Meta: Status „fehler“, nicht aktiv
    await prisma.policenFlow.deleteMany({ where: { customerId } });
    flowApi.create.mockResolvedValue({ id: "flow-x", validationErrors: [{ error: "INVALID" }] });
    const e = await flow.syncPolicenFlowFuerKunde(customerId);
    expect(e.status).toBe("fehler");
    expect(await flow.aktiverFlow(customerId)).toBeNull();
  });

  it("Schalter an: Chat-Nachricht als Flow-Nachricht im Fenster (ohne freigegebene Vorlage), sonst die Vorlage mit beiden Knöpfen", async () => {
    process.env.POLICEN_FLOW = "1";
    await flowVeroeffentlicht(customerId);
    const { conv, termin } = await leadMitTermin();
    const k = (await strecke.streckenKontext(conv.id))!;
    const s = (await strecke.naechsterSchritt(k))!;
    expect(s.flow).toBe(true);
    await strecke.sendeSchritt(k, s);
    const [f] = calls("flow");
    expect(f).toBeTruthy();
    const o = f[3] as { body: string; footer: string; flowId: string; token: string; cta: string; screen: string; data: Record<string, string> };
    expect(o.body).toMatch(/^Kleiner Tipp für \S+ 💡\n\nWenn Herr Kannapinn Ihre Policen vorab sieht, prüft er schon vor dem Termin, \*ob Sie Geld sparen können\*/);
    // Satz als letzter Absatz statt Fußzeile (Ole, 20.11.2026)
    expect(o.body.endsWith("\n\nIhr Termin findet auch ohne Policen statt.")).toBe(true);
    expect(o.footer ?? null).toBeNull();
    expect(o).toMatchObject({ flowId: "flow-123", cta: "Policen senden", screen: "POLICEN" });
    expect(o.data.punkt1).toBe("1. **Nur für Ihren Termin:** Herr Kannapinn (Kannapinn Versicherungen) speichert sie zur Vorbereitung.");
    // Auslesen nicht eingerichtet: neutraler Satz, ohne Freigabe Kranken/BU/Leben ohne Gesundheitssatz
    expect(o.data.punkt2).toBe("2. **Per KI ausgelesen, damit er sich vorbereiten kann:** Die Vertragsdaten liest ein KI-Dienst in der EU aus.");
    expect(o.data.datenschutz_url).toMatch(/\/datenschutz\/policen\?k=/);
    expect(calls("text")).toHaveLength(0);
    const m = await letzterMerker(conv.id);
    expect(m).toMatchObject({ art: "bitte", token: o.token, textVersion: FLOW_TEXT_VERSION_SACH, appointmentId: termin.id });
    expect((await strecke.streckenStand(conv.id, termin.id)).policenFlow).toBe(true);
    // Gespeichert mit Fußzeile (Verlauf)
    expect((await prisma.message.findFirstOrThrow({ where: { conversationId: conv.id, direction: "outbound" }, orderBy: { createdAt: "desc" } })).body).toContain("Ihr Termin findet auch ohne Policen statt.");

    // Vorlage freigegeben (UTILITY): auch im Fenster die Vorlage (beide Knöpfe in einer Nachricht)
    waSend.mockClear();
    await flowVeroeffentlicht(customerId, { [flow.vorlagenName("bitte", "sie", flowJsonHash())]: { status: "approved", category: "utility", grund: null } });
    await flow.sendeFlowNachricht(conv.id, "bitte");
    const [t] = calls("template");
    expect(t[3]).toBe(flow.vorlagenName("bitte", "sie", flowJsonHash()));
    const comps = t[5] as { type: string; sub_type?: string; parameters: { type: string; payload?: string; action?: { flow_token: string } }[] }[];
    expect(comps.map((c) => c.sub_type ?? c.type)).toEqual(["body", "flow", "quick_reply"]);
    expect(comps[2].parameters[0].payload).toBe("policen:spaeter");
    expect(comps[1].parameters[0].action?.flow_token).toMatch(/^pf1_/);
    // Fenster zu, Vorlage nicht freigegeben: nichts
    waSend.mockClear();
    await flowVeroeffentlicht(customerId);
    await prisma.conversation.update({ where: { id: conv.id }, data: { windowExpiresAt: new Date(Date.now() - HOUR) } });
    expect(await flow.sendeFlowNachricht(conv.id, "erinnerung1")).toBeNull();
    expect(waSend).not.toHaveBeenCalled();
  });

  it("Formular mit 2 Dateien: Einwilligung mit Textversion, Hash, Zeit, ki = true; Ablage mit Virenprüfung; Bestätigung mit Knopf; Schluss der Strecke", async () => {
    process.env.POLICEN_FLOW = "1";
    await flowVeroeffentlicht(customerId);
    const { conv, lead, phone, termin } = await leadMitTermin();
    const k = (await strecke.streckenKontext(conv.id))!;
    await strecke.sendeSchritt(k, (await strecke.naechsterSchritt(k))!);
    const m = await letzterMerker(conv.id);
    media.mockImplementation(async (_k: string, id: string) => ({ ok: true, data: id === "m1" ? JPG : PDF, mime: null }));
    waSend.mockClear();
    await nfm(phone, { flow_token: m.token, ohne_ki: false, bildschirm: "POLICEN", fotos: [{ id: "m1", file_name: "IMG_1.jpg", mime_type: "image/jpeg", sha256: b64sha(JPG) }, { id: "m2", file_name: "Hausrat.pdf", mime_type: "application/pdf", sha256: b64sha(PDF) }] }, m.waMessageId);

    const n = await prisma.policenNachweis.findFirstOrThrow({ where: { leadId: lead.id, art: "einwilligung" } });
    expect(n).toMatchObject({ ki: true, quelle: "whatsapp", textVersion: FLOW_TEXT_VERSION_SACH, textHash: m.hash, frageWaMessageId: m.waMessageId, datenschutzVersion: "2026-11-19.1" });
    expect(n.textHash).toBe(createHash("sha256").update(m.wortlaut).digest("hex"));
    expect(n.wortlaut).toContain("Zustimmen & senden");
    expect(n.wortlaut).toContain("Häkchen „Lieber ohne KI: nur speichern“: nicht gesetzt");
    expect(Math.abs(n.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
    expect(await kiEinwilligung(lead.id)).toEqual({ gesundheit: false });

    const docs = await prisma.leadDocument.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } });
    expect(docs.map((d) => [d.status, d.mimeType, d.consentId, d.virenStatus])).toEqual([
      ["gespeichert", "image/jpeg", n.id, "sauber"],
      ["gespeichert", "application/pdf", n.id, "sauber"],
    ]);
    expect(bucket.get(docs[0].storageKey!)!.includes(JPG)).toBe(false);
    expect(mediaDelete).toHaveBeenCalledTimes(2);
    expect(st.kiAufrufe).toBe(0);
    // Bestätigung als Flow-Nachricht „Weitere senden“ mit Fußzeile
    const [b] = calls("flow");
    const bo = b[3] as { body: string; footer: string; cta: string };
    expect(bo.body).toMatch(/^✅ Danke, \*2 Dateien sind angekommen\.\*\n\nHerr Kannapinn sieht sie sich vor \S+ an und prüft, wo Sie sparen können\./);
    expect(bo.body).not.toContain("nichts automatisch");
    expect(bo.footer).toBe("Widerruf jederzeit: einfach „Widerruf“ schreiben.");
    expect(bo.cta).toBe("Weitere senden");
    // Strecke: Antwort auf die Bitte gemerkt (art flow), danach der Schluss
    const stand = await strecke.streckenStand(conv.id, termin.id);
    expect(stand.policenAntwortAt).not.toBeNull();
    expect(stand.abschlussAt).not.toBeNull();
    // Chatverlauf ohne Dateinamen
    const inbound = await prisma.message.findFirstOrThrow({ where: { conversationId: conv.id, kind: "interactive" } });
    expect(inbound.body).toBe("Formular „Policen senden“: 2 Dokumente für den Vermittler");

    // „Weitere senden“ mit Häkchen „ohne KI“: neue Einwilligung ki = false, Zusatzsatz, nichts mehr auslesen
    const w = await letzterMerker(conv.id);
    expect(w.art).toBe("weitere");
    media.mockImplementation(async () => ({ ok: true, data: PDF, mime: null }));
    waSend.mockClear();
    await nfm(phone, { flow_token: w.token, ohne_ki: true, pdfs: [{ id: "m3", file_name: "Kfz.pdf", sha256: b64sha(PDF) }] });
    const n2 = await prisma.policenNachweis.findFirstOrThrow({ where: { leadId: lead.id, art: "einwilligung" }, orderBy: { createdAt: "desc" } });
    expect(n2.ki).toBe(false);
    expect(n2.wortlaut).toContain("Häkchen „Lieber ohne KI: nur speichern“: gesetzt");
    expect(await kiAbgelehnt(lead.id)).toBe(true);
    expect(await sperreFuer(customerId, lead.id)).toBe("ohne_ki");
    expect((calls("flow")[0][3] as { body: string }).body).toContain("*1 Datei ist angekommen.*\n\nHerr Kannapinn");
    expect((calls("flow")[0][3] as { body: string }).body).toContain("Alles klar, wir lesen nichts automatisch aus.");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id, status: "gespeichert" } })).toBe(3);
  });

  it("Formular: falscher Hash bzw. unbekanntes Token speichert nichts", async () => {
    process.env.POLICEN_FLOW = "1";
    await flowVeroeffentlicht(customerId);
    const { conv, lead, phone } = await leadMitTermin();
    await flow.sendeFlowNachricht(conv.id, "bitte");
    const m = await letzterMerker(conv.id);
    media.mockImplementation(async () => ({ ok: true, data: PDF, mime: null }));
    await nfm(phone, { flow_token: "pf1_unbekannt_unbekannt_1234", fotos: [{ id: "x1", sha256: b64sha(PDF) }] });
    expect(await prisma.policenNachweis.count({ where: { leadId: lead.id } })).toBe(0);
    expect(media).not.toHaveBeenCalled();
    waSend.mockClear();
    await nfm(phone, { flow_token: m.token, pdfs: [{ id: "x2", sha256: b64sha(Buffer.from("anders")) }] });
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    expect(mediaDelete).toHaveBeenCalledWith("k", "x2");
    expect(calls("text").map((c) => String(c[3])).at(-1)).toMatch(/konnte|nicht/i);
  });

  it("„Später“: Antwort mit „Nein, danke“ (Opt-in), kein Nachweis; höchstens 2 Erinnerungen; „Nein, danke“ stoppt", async () => {
    process.env.POLICEN_FLOW = "1";
    const { conv, lead, phone, termin } = await leadMitTermin({ inTagen: 5 });
    await erinnerungOptIn({ customerId, leadId: lead.id, phone });
    await flowVeroeffentlicht(customerId, Object.fromEntries((["bitte", "erinnerung1", "erinnerung2"] as const).map((a) => [flow.vorlagenName(a, "sie", flowJsonHash()), { status: "approved", category: "utility", grund: null }])));
    const k = (await strecke.streckenKontext(conv.id))!;
    await strecke.sendeSchritt(k, (await strecke.naechsterSchritt(k))!);
    waSend.mockClear();
    await quickReply(phone, "policen:spaeter", "Später");
    const [sp] = calls("buttons");
    expect(sp[3]).toBe("Alles klar, kein Problem. Ihr Termin findet so oder so statt. Ich erinnere Sie höchstens zweimal daran.");
    expect((sp[4] as { title: string }[]).map((b) => b.title)).toEqual(["Nein, danke"]);
    expect(await prisma.policenNachweis.count({ where: { leadId: lead.id, art: { in: ["einwilligung", "abgelehnt"] } } })).toBe(0);
    // Strecke geht weiter (Schluss), Antwort als „spaeter“ gemerkt
    const stand0 = await strecke.streckenStand(conv.id, termin.id);
    expect(stand0.abschlussAt).not.toBeNull();

    // Erinnerung 1 nach 24 Std. (Vorlage, Fenster zu)
    await prisma.conversation.update({ where: { id: conv.id }, data: { windowExpiresAt: new Date(Date.now() - HOUR) } });
    const bitte = await prisma.message.findFirstOrThrow({ where: { conversationId: conv.id, kind: strecke.STRECKE.policenBitte } });
    waSend.mockClear();
    const t1 = new Date(bitte.createdAt.getTime() + 25 * HOUR);
    expect(await flow.runPolicenFlowErinnerungen(t1)).toEqual({ gesendet: 1 });
    expect(await flow.runPolicenFlowErinnerungen(new Date(t1.getTime() + HOUR))).toEqual({ gesendet: 0 });
    const [e1] = calls("template");
    expect(e1[3]).toBe(flow.vorlagenName("erinnerung1", "sie", flowJsonHash()));
    expect((e1[5] as { sub_type?: string; parameters: { payload?: string }[] }[])[2].parameters[0].payload).toBe("policen:nein_danke");
    // Erinnerung 2 am Vortag ab 18 Uhr Berlin
    const vortag18 = new Date(termin.startsAt.getTime() - DAY);
    const berlin = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(vortag18);
    const t2 = new Date(`${berlin}T17:10:00Z`); // 18:10 Berlin (Winterzeit)
    waSend.mockClear();
    expect(await flow.runPolicenFlowErinnerungen(t2)).toEqual({ gesendet: 1 });
    expect(calls("template")[0][3]).toBe(flow.vorlagenName("erinnerung2", "sie", flowJsonHash()));
    // Mehr als 2: nie
    expect(await flow.runPolicenFlowErinnerungen(new Date(t2.getTime() + 30 * 60 * 1000))).toEqual({ gesendet: 0 });
    expect((await strecke.streckenStand(conv.id, termin.id)).policenErinnerungen).toBe(2);
    // Vortags-Erinnerung bekommt keine eigene Policen-Zeile mehr (Erinnerung 2 ist eine eigene Nachricht)
    expect(await strecke.policenVortagSatzFuer({ id: termin.id, conversationId: conv.id, leadId: lead.id }, "sie")).toBeNull();

    // „Nein, danke“ (Knopf der Vorlage): Nachweis erinnerung_stopp, Antwort mit Termin
    waSend.mockClear();
    await quickReply(phone, "policen:nein_danke", "Nein, danke");
    expect(await prisma.policenNachweis.count({ where: { leadId: lead.id, art: "erinnerung_stopp" } })).toBe(1);
    expect(String(calls("text")[0][3])).toMatch(/^Alles klar, keine Erinnerungen mehr\. Bis \S+ um \d+(:\d+)? Uhr!$/);
  });

  it("„Nein, danke“ getippt nach der Erinnerung stoppt weitere Erinnerungen; ohne Opt-in keine Erinnerung und kein Satz dazu", async () => {
    process.env.POLICEN_FLOW = "1";
    await flowVeroeffentlicht(customerId);
    const { conv, lead, phone, termin } = await leadMitTermin({ inTagen: 5 });
    await erinnerungOptIn({ customerId, leadId: lead.id, phone });
    const k = (await strecke.streckenKontext(conv.id))!;
    await strecke.sendeSchritt(k, (await strecke.naechsterSchritt(k))!);
    const bitte = await prisma.message.findFirstOrThrow({ where: { conversationId: conv.id, kind: strecke.STRECKE.policenBitte } });
    // Im Fenster (Lead hat inzwischen geschrieben) ohne Vorlage: interaktive Flow-Nachricht mit Fußzeile „Nein, danke“
    await prisma.conversation.update({ where: { id: conv.id }, data: { windowExpiresAt: new Date(bitte.createdAt.getTime() + 30 * HOUR) } });
    waSend.mockClear();
    expect(await flow.runPolicenFlowErinnerungen(new Date(bitte.createdAt.getTime() + 25 * HOUR))).toEqual({ gesendet: 1 });
    expect((calls("flow")[0][3] as { footer: string }).footer).toBe("Kein Interesse? Tippen Sie „Nein, danke“ oder STOP.");
    await text(phone, "Nein, danke");
    expect(await prisma.policenNachweis.count({ where: { leadId: lead.id, art: "erinnerung_stopp" } })).toBe(1);
    const vortag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(termin.startsAt.getTime() - DAY));
    expect(await flow.runPolicenFlowErinnerungen(new Date(`${vortag}T17:10:00Z`))).toEqual({ gesendet: 0 });

    // Ohne Opt-in: „Später“ ohne Ankündigung und ohne Knopf, keine Erinnerung
    const b = await leadMitTermin({ inTagen: 5 });
    const kb = (await strecke.streckenKontext(b.conv.id))!;
    await strecke.sendeSchritt(kb, (await strecke.naechsterSchritt(kb))!);
    waSend.mockClear();
    await quickReply(b.phone, "policen:spaeter", "Später");
    expect(String(calls("text")[0][3])).toBe("Alles klar, kein Problem. Ihr Termin findet so oder so statt.");
    const bb = await prisma.message.findFirstOrThrow({ where: { conversationId: b.conv.id, kind: strecke.STRECKE.policenBitte } });
    expect(await flow.runPolicenFlowErinnerungen(new Date(bb.createdAt.getTime() + 25 * HOUR))).toEqual({ gesendet: 0 });
  });

  it("Pay-per-Lead-Kunde: nie ein Flow, heutige Strecke", async () => {
    process.env.POLICEN_FLOW = "1";
    await flowVeroeffentlicht(pplId);
    const { conv } = await leadMitTermin({ cid: pplId });
    expect(await flow.policenFlowMoeglich(conv.id)).toBe(false);
    expect(await flow.sendeFlowNachricht(conv.id, "bitte")).toBeNull();
  });

  it("K2: Kranken/BU/Leben ohne Nachweis „keine Speicherung“ nie ausgelesen; KI-Satz für PKV-Lead neutral, für Sach mit Auslesen fertig", async () => {
    process.env.POLICEN_FLOW = "1";
    process.env.POLICEN_OPENAI_API_KEY = "sk-test";
    await prisma.policenAuslesenEinstellung.deleteMany({ where: { id: "global" } });
    expect(freigegebeneSparten({ zdr: false })).not.toEqual(expect.arrayContaining(["pkv"]));
    expect(freigegebeneSparten({ zdr: false }).some((s) => ["pkv", "bu", "leben"].includes(s))).toBe(false);
    expect(await flow.kiSatzAktiv({ customerId, source: "PKV Vollversicherung", formular: [], angaben: null })).toBe(false);
    expect(await flow.kiSatzAktiv({ customerId, source: "Privatschutz", formular: [], angaben: null })).toBe(true);
    // Mit KI-Satz im Formular
    await prisma.customer.update({ where: { id: customerId }, data: { policenIntern: true } });
    await flowVeroeffentlicht(customerId);
    const { conv } = await leadMitTermin();
    await flow.sendeFlowNachricht(conv.id, "bitte");
    const d = (calls("flow")[0][3] as { data: Record<string, string> }).data;
    expect(d.punkt2).toBe("2. **Per KI ausgelesen, damit Ihr Vergleich zum Termin schon fertig ist:** Die Vertragsdaten liest ein KI-Dienst in der EU aus, auch wenn die Policen Gesundheitsangaben enthalten.");
    expect((await letzterMerker(conv.id)).textVersion).toBe("2026-11-19.g1");
    // Tierkranken: ohne Gesundheitssatz
    waSend.mockClear();
    const tier = await leadMitTermin({ source: "Tierkrankenversicherung Katze" });
    await flow.sendeFlowNachricht(tier.conv.id, "bitte");
    expect((calls("flow")[0][3] as { data: Record<string, string> }).data.punkt2).not.toContain("Gesundheitsangaben");
    await prisma.customer.update({ where: { id: customerId }, data: { policenIntern: false } });
  });

  it("Produktionsfehler 19.11.2026: Flow-Versand wirft (360dialog 400 #131009) → Turn läuft weiter, Lead bekommt die bisherige Bitte mit Einwilligung, Flow gestört", async () => {
    process.env.POLICEN_FLOW = "1";
    await flowVeroeffentlicht(customerId);
    const { conv, termin } = await leadMitTermin();
    await prisma.appointment.update({ where: { id: termin.id }, data: { komplettcheck: true } });
    await strecke.merke(conv.id, strecke.STRECKE.vertragsfrage, { appointmentId: termin.id });
    waSend.mockImplementation(async (art: string) => {
      if (art === "flow")
        throw new Error('360dialog 400: {"error":{"code":131009,"message":"(#131009) Parameter value is not valid","error_data":{"details":"Specified screen POLICEN is not allowed as first screen of this flow. Allowed screen name is: <none>."}}}');
      return { messageId: `wamid.out-${uid()}`, raw: {} };
    });
    // Antwort auf die Komplettcheck-Frage: wirft nicht
    await expect(strecke.vertraegeAntwort(conv.id, "Haftpflicht bei der HUK")).resolves.toBe(true);
    expect(calls("flow")).toHaveLength(1);
    // Bisherige Bitte (Text) und Einwilligung (Knöpfe)
    const texte = [...calls("text"), ...calls("buttons")].map((c) => String(c[3] ?? ""));
    expect(texte.join("\n")).toMatch(/Policen/);
    const einw = calls("buttons").find((c) => String(c[3]).startsWith("Kurz zum Datenschutz"));
    expect(einw).toBeTruthy();
    // Flow für diesen Kunden gestört: aktiverFlow null, Sync schaltet ihn nicht wieder ein
    const rec = await prisma.policenFlow.findUniqueOrThrow({ where: { customerId } });
    expect(rec.status).toBe(flow.STATUS_GESTOERT);
    expect(rec.fehler).toMatch(/131009/);
    expect(await flow.aktiverFlow(customerId)).toBeNull();
    const sync = await flow.syncPolicenFlowFuerKunde(customerId);
    expect(sync.status).toBe(flow.STATUS_GESTOERT);
    expect(flowApi.create).not.toHaveBeenCalled();
    // Merker der Bitte ohne flow (bisherige Erinnerungen gelten)
    const stand = await strecke.streckenStand(conv.id, termin.id);
    expect(stand.policenBitteAt).toBeTruthy();
    expect(stand.policenFlow).toBe(false);
    // Nächster Lead: gleich die bisherige Bitte, ohne Flow-Versuch
    const b = await leadMitTermin();
    const k = (await strecke.streckenKontext(b.conv.id))!;
    const s = (await strecke.naechsterSchritt(k))!;
    expect(s.flow).toBeUndefined();
    expect(s.folge?.buttons.map((x) => x.title)).toEqual(["Einverstanden", "Lieber nicht"]);
  });

  it("aktiverFlow nur für das aktuelle Flow JSON (Einstieg POLICEN, kein Kreis): alter veröffentlichter Flow wird nicht benutzt; Meta-Status nicht mehr PUBLISHED → aus", async () => {
    process.env.POLICEN_FLOW = "1";
    await prisma.policenFlow.create({ data: { customerId, flowId: "flow-alt", name: "policen_senden_alt", jsonHash: "alt".padEnd(64, "0"), status: "veroeffentlicht" } });
    expect(await flow.aktiverFlow(customerId)).toBeNull();
    await flowVeroeffentlicht(customerId);
    expect(await flow.aktiverFlow(customerId)).not.toBeNull();
    flowApi.get.mockResolvedValue({ id: "flow-123", name: "x", status: "DEPRECATED", validationErrors: [] });
    flowApi.list.mockResolvedValue([]);
    const r = await flow.syncPolicenFlowFuerKunde(customerId);
    expect(r.status).toBe("fehler");
    expect(await flow.aktiverFlow(customerId)).toBeNull();
  });
});
