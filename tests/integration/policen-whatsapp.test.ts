// Policen per WhatsApp (Ole, 18.11.2026, nach der Rechtsprüfung docs/recht/policen-whatsapp-gesundheitsdaten.md):
// Eingang über den Webhook, Einwilligung per Knopf mit Nachweis (nur anhängen), Tor ohne Einwilligung (nichts abrufen,
// einmal nachfragen), „Lieber nicht“, Widerruf, Freigabe Kranken/BU/Leben je Vermittler, keine KI beim Dokumenteingang,
// Ablage im (hier simulierten) privaten Bucket mit Schlüssel je Mandant, Abruf nur über signierte Links mit Protokoll,
// Sichtbarkeit nur für den zuständigen Vermittler, Löschung 90 Tage nach dem Termin, Erinnerungs-Opt-in aus der Buchung.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st: { kiAufrufe: number; ctx: unknown } = { kiAufrufe: 0, ctx: null };

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
const mediaDelete = vi.fn();
vi.mock("@/lib/policen/media", () => ({ ladeMedia: (...a: unknown[]) => media(...a), loescheMedia: (...a: unknown[]) => mediaDelete(...a), downloadUrl: (u: string) => u }));
vi.mock("@/lib/push", () => {
  const rec = async () => ({ sent: 1, removed: 0, errors: [] });
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});
// Jeder KI-Aufruf wird gezählt: beim Dokumenteingang darf es keinen geben
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
vi.mock("@/lib/buyer-context", () => ({ getBuyerContext: async () => st.ctx }));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { darfPolicenErinnern, erinnerungOptIn, listUnterlagen, policenErinnerungStatus, prunePolicen, widerrufDurchVermittler } from "@/lib/policen/server";
import { setzeSpeicherFuerTests, type Speicher } from "@/lib/policen/ablage";
import { stimmeAvvZu, ladeFreischaltung, spaeterAvv } from "@/lib/policen/freischaltung";
import { einladungJetzt } from "@/lib/policen/assistent";
import { eraseLead } from "@/lib/erasure";
import { GET as unterlageGET } from "@/app/api/buyer/leads/[id]/unterlagen/[docId]/route";
import { GET as dateiGET } from "@/app/api/buyer/policen/datei/route";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4917${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
const DAY = 24 * 60 * 60 * 1000;
const texts = () => waSend.mock.calls.filter((c) => c[0] === "text").map((c) => String(c[3]));
const buttons = () => waSend.mock.calls.filter((c) => c[0] === "buttons");

// Privater Bucket im Speicher (S3 selbst wird nicht angesprochen)
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

describe("Policen per WhatsApp", () => {
  let customerId = "";
  let ownerId = "";
  let advisorId = "";
  const pnid = `pnid-pol-${uid()}`;
  const value = (extra: Record<string, unknown>) => ({ messaging_product: "whatsapp", metadata: { phone_number_id: pnid, display_phone_number: "4930123456789" }, ...extra });
  const send = (from: string, msg: Record<string, unknown>) =>
    handleInboundPayload({ entry: [{ changes: [{ field: "messages", value: value({ contacts: [{ profile: { name: "Julia" } }], messages: [{ from, id: `wamid.in-${uid()}`, ...msg }] }) }] }] });
  const doc = (from: string, filename = "HUK Haftpflicht.pdf", caption?: string) =>
    send(from, { type: "document", document: { id: `media-${uid()}`, mime_type: "application/pdf", filename, ...(caption ? { caption } : {}) } });
  const knopf = (from: string, id: string, title: string, context?: string) =>
    send(from, { type: "interactive", interactive: { type: "button_reply", button_reply: { id, title } }, ...(context ? { context: { id: context } } : {}) });
  const text = (from: string, body: string) => send(from, { type: "text", text: { body } });
  const einverstanden = (from: string, context?: string) => knopf(from, "policen:ja", "Einverstanden", context);

  async function leadMitChat(extra: Record<string, unknown> = {}) {
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
        qualificationData: { vorhanden: "Haftpflicht bei HUK" },
        messages: { create: [{ direction: "outbound", body: "Guten Tag, hier ist der digitale KI-Assistent.", sentBy: "bot" }] },
      },
    });
    return { lead, conv, phone };
  }

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    process.env.ANTHROPIC_API_KEY ||= "test";
    const c = await makeCustomer({ name: `Agentur Policen ${uid()}`, leadAddress: "sie" });
    customerId = c.id;
    ownerId = (await makeBuyer(customerId, "owner")).id;
    advisorId = (await makeBuyer(customerId, "advisor")).id;
    await prisma.erstinformation.create({ data: { customerId, token: `t-${uid()}`, name: "Ole Kannapinn", anrede: "Herr", firma: "Kannapinn Versicherungen" } });
    await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: false, systemPrompt: "Test" } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: pnid, apiKeyEnc: encryptSecret("k") } });
  });
  afterAll(async () => {
    setzeSpeicherFuerTests(null);
    for (const k of Object.keys(ABLAGE_ENV)) delete process.env[k];
    await cleanupCustomer(customerId);
  });
  beforeEach(async () => {
    Object.assign(process.env, ABLAGE_ENV);
    delete process.env.POLICEN_WHATSAPP_AUS;
    delete process.env.POLICEN_GESUNDHEIT_AUS;
    setzeSpeicherFuerTests(memory);
    st.kiAufrufe = 0;
    st.ctx = null;
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
    media.mockReset();
    media.mockImplementation(async () => ({ ok: true, data: Buffer.from(PDF), mime: "application/pdf" }));
    mediaDelete.mockReset();
    mediaDelete.mockImplementation(async () => true);
    await prisma.customer.update({ where: { id: customerId }, data: { policenIntern: false, isTest: false, policenAvvZugestimmtAt: null, policenAvvVersion: null, policenDatenschutzUrl: null, policenAvvSpaeter: 0 } });
  });

  it("Assistent: Bitte als Text, Einwilligung als eigene Nachricht mit zwei Knöpfen (Sach, ohne Gesundheitsteil)", async () => {
    const { conv } = await leadMitChat();
    const e = await einladungJetzt({ conversationId: conv.id, an: "sie", person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" } });
    expect(e?.text).toMatch(/^Damit Herr Kannapinn Ihren Termin gut vorbereiten kann/);
    expect(e?.text).toContain("egal ob Haftpflicht, Hausrat oder Kfz.");
    expect(e?.buttons).toBeNull();
    expect(e?.folge.text).toMatch(/^Kurz zum Datenschutz: Ich bin einverstanden, dass Ole Kannapinn \(Kannapinn Versicherungen\) meine hier gesendeten Policen/);
    expect(e?.folge.text).not.toContain("Gesundheitsangaben");
    expect(e?.folge.text).toMatch(/Infos: \S+\/datenschutz\/policen\?k=/);
    expect(e?.folge.buttons.map((b) => b.title)).toEqual(["Einverstanden", "Lieber nicht"]);
    expect(e?.folge.footer).toBe("Ihr Termin findet auch ohne Unterlagen statt.");
  });

  it("Sachpolice mit Einwilligung: Nachweis, verschlüsselt im Bucket, einmal bestätigt, keine KI, Medium bei Meta gelöscht", async () => {
    const { lead, phone } = await leadMitChat();
    await einverstanden(phone);
    const n = await prisma.policenNachweis.findFirstOrThrow({ where: { leadId: lead.id, art: "einwilligung" } });
    expect(n).toMatchObject({ customerId, phone, ki: true, quelle: "whatsapp", vermittlerUserId: ownerId, textVersion: "2026-11-18.s1" });
    expect(n.waMessageId).toMatch(/^wamid\.in-/);
    expect(n.wortlaut).toContain("Antwort (Knopf): „Einverstanden“");
    expect(texts().at(-1)).toBe("Danke! Schicken Sie die Policen gern als Foto oder PDF. Seiten mit Gesundheitsangaben können Sie schwärzen, wenn Sie sie nicht besprechen möchten.");

    waSend.mockClear();
    await doc(phone);
    await doc(phone, "Hausrat.pdf");
    expect(st.kiAufrufe).toBe(0);
    const docs = await prisma.leadDocument.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } });
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({ status: "gespeichert", data: null, consentId: n.id, gesundheitsbezug: true, sparte: "haftpflicht", extracted: null });
    expect(docs[0].storageKey).toMatch(new RegExp(`^policen/${customerId}/${lead.id}/`));
    expect(bucket.get(docs[0].storageKey!)!.includes(PDF)).toBe(false);
    // Löschfrist 90 Tage nach dem Eingang (kein Termin)
    expect(Math.round((docs[0].deleteAfter!.getTime() - docs[0].createdAt.getTime()) / DAY)).toBe(90);
    // Bestätigung genau einmal je Lead, beim zweiten Dokument nichts
    expect(texts()).toEqual(["Danke, ist angekommen. Haben Sie noch weitere?"]);
    expect(mediaDelete).toHaveBeenCalledTimes(2);
    // Chatverlauf (auch Admin-Chat): nur der Hinweis, kein Dateiname
    const msgs = await prisma.message.findMany({ where: { conversation: { leadId: lead.id }, direction: "inbound", kind: "document" }, select: { body: true } });
    expect(msgs.map((m) => m.body)).toEqual(["Dokument für den Vermittler", "Dokument für den Vermittler"]);
    // Nachweis ist unveränderbar
    await expect(prisma.policenNachweis.update({ where: { id: n.id }, data: { ki: false } })).rejects.toThrow();
    await expect(prisma.policenNachweis.delete({ where: { id: n.id } })).rejects.toThrow();
  });

  it("Dokument ohne Einwilligung: nichts abrufen, einmal nachfragen, erst nach Ja abrufen und ablegen", async () => {
    const { lead, phone } = await leadMitChat();
    await doc(phone);
    await doc(phone, "Kfz.pdf");
    expect(media).not.toHaveBeenCalled();
    expect(st.kiAufrufe).toBe(0);
    const wartet = await prisma.leadDocument.findMany({ where: { leadId: lead.id } });
    expect(wartet.map((d) => [d.status, d.data, d.storageKey])).toEqual([
      ["wartet", null, null],
      ["wartet", null, null],
    ]);
    const nachfragen = buttons();
    expect(nachfragen).toHaveLength(1);
    expect(String(nachfragen[0][3])).toMatch(/^Danke! Bevor ich Ihre Unterlagen ablege, brauche ich kurz Ihre Zustimmung:\n\nKurz zum Datenschutz: Ich bin einverstanden/);
    expect(nachfragen[0][5]).toBe("Ihr Termin findet auch ohne Unterlagen statt.");
    const frageId = (await prisma.message.findFirstOrThrow({ where: { conversation: { leadId: lead.id }, body: { startsWith: "Danke! Bevor ich" } } })).waMessageId;

    await einverstanden(phone, frageId ?? undefined);
    expect(media).toHaveBeenCalledTimes(2);
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id, status: "gespeichert" } })).toBe(2);
    const n = await prisma.policenNachweis.findFirstOrThrow({ where: { leadId: lead.id, art: "einwilligung" } });
    expect(n.frageWaMessageId).toBe(frageId);
    expect(n.wortlaut).toMatch(/^Danke! Bevor ich Ihre Unterlagen ablege/);
    expect(texts().at(-1)).toBe("Danke, ist angekommen. Haben Sie noch weitere?");
    expect(st.kiAufrufe).toBe(0);
  });

  it("Ohne Ja: nach 24 Stunden verworfen (Media-ID gelöscht, auch bei Meta)", async () => {
    const { lead, phone } = await leadMitChat();
    await doc(phone);
    const w = await prisma.leadDocument.findFirstOrThrow({ where: { leadId: lead.id } });
    const r = await prunePolicen(new Date(w.createdAt.getTime() + 25 * 60 * 60 * 1000));
    expect(r.wartet).toBeGreaterThanOrEqual(1);
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    expect(mediaDelete).toHaveBeenCalledWith("k", w.waMediaId);
    expect(media).not.toHaveBeenCalled();
  });

  it("„Lieber nicht“: freundliche Antwort, Wartendes verworfen, Nachweis, keine Erinnerungen", async () => {
    const { lead, phone } = await leadMitChat();
    await erinnerungOptIn({ customerId, leadId: lead.id, phone });
    await prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "video", startsAt: new Date(Date.now() + 2 * DAY) } });
    expect(await darfPolicenErinnern(lead.id)).toBe(true);
    await doc(phone);
    await knopf(phone, "policen:nein", "Lieber nicht");
    expect(texts().at(-1)).toBe("Kein Problem, Ihr Termin findet trotzdem statt. Bringen Sie Ihre Unterlagen dann einfach zum Termin mit.");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    expect(await prisma.policenNachweis.count({ where: { leadId: lead.id, art: "abgelehnt" } })).toBe(1);
    expect(await policenErinnerungStatus(lead.id)).toEqual({ darf: false, grund: "lieber_nicht" });
    expect(media).not.toHaveBeenCalled();
  });

  it("Widerruf im Chat löscht sofort alles (Bucket), bestätigt, Nachweis bleibt", async () => {
    const { lead, phone } = await leadMitChat();
    await einverstanden(phone);
    await doc(phone);
    const d = await prisma.leadDocument.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(bucket.has(d.storageKey!)).toBe(true);
    await text(phone, "Widerruf");
    expect(texts().at(-1)).toBe("Erledigt, Ihre Unterlagen sind gelöscht.");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    expect(bucket.has(d.storageKey!)).toBe(false);
    const arten = (await prisma.policenNachweis.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } })).map((x) => x.art);
    expect(arten).toEqual(["einwilligung", "widerruf"]);
    // Neues Dokument danach: wieder nachfragen statt ablegen
    waSend.mockClear();
    await doc(phone);
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id, status: "gespeichert" } })).toBe(0);
    // Widerruf durch den Vermittler (Telefon, E-Mail)
    await einverstanden(phone);
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id, status: "gespeichert" } })).toBe(1);
    expect((await widerrufDurchVermittler(lead.id, customerId, ownerId))?.geloescht).toBe(1);
    expect(bucket.size === 0 || ![...bucket.keys()].some((k) => k.includes(lead.id))).toBe(true);
  });

  it("Gesundheitspolice ohne Freigabe (A5): nicht abgerufen, Hinweis; nach Zustimmung zur AVV-Ergänzung angenommen", async () => {
    const { lead, phone } = await leadMitChat();
    await einverstanden(phone);
    waSend.mockClear();
    await doc(phone, "Krankenversicherung DKV.pdf");
    expect(media).not.toHaveBeenCalled();
    expect(texts().at(-1)).toBe("Danke! Unterlagen zur Kranken-, BU- oder Lebensversicherung speichere ich hier nicht, die schauen Sie sich am besten im Termin gemeinsam mit Herrn Kannapinn an.");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);

    // Inhaber stimmt zu (Berater nicht), Karte, Nachweis
    expect(await stimmeAvvZu({ customerId, userId: advisorId, preview: false, teamRole: "advisor" })).toBe(false);
    const owner = { customerId, userId: ownerId, preview: false, teamRole: "owner" };
    expect((await ladeFreischaltung(owner))?.karte).toBe(true);
    expect(await stimmeAvvZu(owner)).toBe(true);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(c).toMatchObject({ policenAvvUserId: ownerId, policenAvvVersion: "b-2026-11-17" });
    expect(c.policenDatenschutzUrl).toMatch(/\/datenschutz\/policen\?k=/);
    expect(await prisma.policenNachweis.count({ where: { customerId, art: "avv_zustimmung", vermittlerUserId: ownerId } })).toBe(1);
    const f = await ladeFreischaltung(owner);
    expect(f).toMatchObject({ karte: false, freigeschaltet: true });

    // Neue Einwilligungsnachricht nennt jetzt Gesundheitsangaben; Gesundheitspolice wird angenommen
    const neu = await leadMitChat();
    const e = await einladungJetzt({ conversationId: neu.conv.id, an: "sie", person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" } });
    expect(e?.text).toContain("Kfz, Kranken-, BU- oder Lebensversicherung");
    expect(e?.folge.text).toContain("auch wenn sie Gesundheitsangaben enthalten, z. B. bei Kranken-, BU- oder Lebensversicherung.");
    await einverstanden(neu.phone);
    expect((await prisma.policenNachweis.findFirstOrThrow({ where: { leadId: neu.lead.id, art: "einwilligung" } })).textVersion).toBe("2026-11-18.g1");
    await doc(neu.phone, "Krankenversicherung DKV.pdf");
    expect(await prisma.leadDocument.count({ where: { leadId: neu.lead.id, status: "gespeichert" } })).toBe(1);
    expect(st.kiAufrufe).toBe(0);
  });

  it("Karte: dreimal „Später“, danach nur in den Einstellungen; intern/Test sofort frei", async () => {
    const owner = { customerId, userId: ownerId, preview: false, teamRole: "owner" };
    for (let i = 0; i < 3; i++) await spaeterAvv(owner);
    expect(await ladeFreischaltung(owner)).toMatchObject({ karte: false, einstellungen: true, freigeschaltet: false });
    await prisma.customer.update({ where: { id: customerId }, data: { isTest: true } });
    expect(await ladeFreischaltung(owner)).toMatchObject({ karte: false, freigeschaltet: true, intern: true });
    expect(await ladeFreischaltung({ customerId, userId: advisorId, preview: false, teamRole: "advisor" })).toBeNull();
  });

  it("Abruf nur über signierten Link, protokolliert; nur zuständiger Vermittler und Inhaber, nie Admin-Vorschau", async () => {
    const { lead, phone } = await leadMitChat({ assignedUserId: advisorId });
    await einverstanden(phone);
    await doc(phone);
    const d = await prisma.leadDocument.findFirstOrThrow({ where: { leadId: lead.id } });
    const req = (q = "") => new Request(`http://localhost/api/buyer/leads/${lead.id}/unterlagen/${d.id}${q}`);
    const params = { params: Promise.resolve({ id: lead.id, docId: d.id }) };

    // Zuständiger Berater: 303 auf signierten Link, Datei, Protokoll
    st.ctx = { customerId, email: "b@x", preview: false, userId: advisorId, teamRole: "advisor" };
    const r = await unterlageGET(req("?download=1"), params);
    expect(r.status).toBe(303);
    const loc = r.headers.get("location")!;
    expect(loc).toMatch(/^\/api\/buyer\/policen\/datei\?t=/);
    const file = await dateiGET(new Request(`http://localhost${loc}`));
    expect(file.status).toBe(200);
    expect(Buffer.from(await file.arrayBuffer()).equals(PDF)).toBe(true);
    expect(file.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(file.headers.get("cache-control")).toContain("no-store");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "policen.abruf", entityId: d.id } });
    expect(log).toMatchObject({ actorId: advisorId });
    expect(JSON.stringify(log.details)).toContain("herunterladen");

    // Link für einen anderen Login: nichts
    st.ctx = { customerId, email: "o@x", preview: false, userId: ownerId, teamRole: "owner" };
    expect((await dateiGET(new Request(`http://localhost${loc}`))).status).toBe(404);
    // Inhaber darf (eigenes Team)
    expect((await unterlageGET(req(), params)).status).toBe(303);
    // Anderer Berater, dem der Lead nicht gehört: nichts
    const fremd = (await makeBuyer(customerId, "advisor")).id;
    st.ctx = { customerId, email: "f@x", preview: false, userId: fremd, teamRole: "advisor" };
    expect((await unterlageGET(req(), params)).status).toBe(404);
    // Admin in „Als Kunde ansehen“: weder Datei noch Dateiname
    st.ctx = { customerId, email: "admin@x", preview: true, userId: null, teamRole: "owner" };
    expect((await unterlageGET(req(), params)).status).toBe(404);
    expect((await listUnterlagen(lead.id, { preview: true }))[0]).toMatchObject({ fileName: "Dokument für den Vermittler", ansehen: false });
    // Abgelaufener bzw. veränderter Link
    st.ctx = { customerId, email: "b@x", preview: false, userId: advisorId, teamRole: "advisor" };
    expect((await dateiGET(new Request(`http://localhost${loc}x`))).status).toBe(410);
  });

  it("Löschung 90 Tage nach dem Termin (Cron), Bucket mit; Art. 17 löscht auch die Nachweise", async () => {
    const { lead, phone } = await leadMitChat();
    await einverstanden(phone);
    await doc(phone);
    const d = await prisma.leadDocument.findFirstOrThrow({ where: { leadId: lead.id } });
    await prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "video", startsAt: new Date(Date.now() - 10 * DAY), status: "completed" } });
    await prunePolicen(new Date(Date.now() + 79 * DAY));
    expect(await prisma.leadDocument.count({ where: { id: d.id } })).toBe(1);
    expect((await prisma.leadDocument.findUniqueOrThrow({ where: { id: d.id } })).deleteAfter!.getTime()).toBeLessThan(Date.now() + 81 * DAY);
    await prunePolicen(new Date(Date.now() + 81 * DAY));
    expect(await prisma.leadDocument.count({ where: { id: d.id } })).toBe(0);
    expect(bucket.has(d.storageKey!)).toBe(false);
    // Nachweis bleibt nach der Löschung der Policen
    expect(await prisma.policenNachweis.count({ where: { leadId: lead.id } })).toBe(1);
    await eraseLead(lead.id);
    expect(await prisma.policenNachweis.count({ where: { leadId: lead.id } })).toBe(0);
  });

  it("Erinnerungen nur mit Opt-in aus der Buchung, bis zum Termin, Stopp beim ersten Dokument und bei STOPP", async () => {
    const { lead, phone, conv } = await leadMitChat();
    await prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "video", startsAt: new Date(Date.now() + 3 * DAY) } });
    expect(await policenErinnerungStatus(lead.id)).toEqual({ darf: false, grund: "kein_optin" });
    await erinnerungOptIn({ customerId, leadId: lead.id, phone });
    expect(await darfPolicenErinnern(lead.id)).toBe(true);
    expect(await policenErinnerungStatus(lead.id, new Date(Date.now() + 4 * DAY))).toEqual({ darf: false, grund: "kein_termin" });
    await prisma.conversation.update({ where: { id: conv.id }, data: { optedOutAt: new Date() } });
    expect(await policenErinnerungStatus(lead.id)).toEqual({ darf: false, grund: "stopp" });
    await prisma.conversation.update({ where: { id: conv.id }, data: { optedOutAt: null } });
    await einverstanden(phone);
    await doc(phone);
    expect(await policenErinnerungStatus(lead.id)).toEqual({ darf: false, grund: "dokument_da" });
  });

  it("Funktion aus (Ablage nicht eingerichtet bzw. Notschalter): nichts abrufen, freundlicher Hinweis, keine Bitte", async () => {
    const { lead, phone, conv } = await leadMitChat();
    process.env.POLICEN_WHATSAPP_AUS = "1";
    await doc(phone);
    expect(media).not.toHaveBeenCalled();
    expect(texts().at(-1)).toBe("Danke! Ihre Unterlagen schauen wir uns am besten im Termin gemeinsam an, hier speichere ich sie nicht.");
    expect(await prisma.leadDocument.count({ where: { leadId: lead.id } })).toBe(0);
    expect(await einladungJetzt({ conversationId: conv.id, an: "sie", person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" } })).toBeNull();
    delete process.env.POLICEN_WHATSAPP_AUS;
    delete process.env.POLICEN_S3_ENDPOINT;
    expect(await einladungJetzt({ conversationId: conv.id, an: "sie", person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" } })).toBeNull();
    expect(st.kiAufrufe).toBe(0);
  });
});
