import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async () => {}),
  sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
}));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { sendToAdmins } from "@/lib/push";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { resubmitTemplate, submitTemplatesForCustomer, syncTemplates } from "@/lib/whatsapp/template-submit";
import { completeSelfConnect } from "@/lib/whatsapp/self-connect";
import { loadOnboarding, onboardingChecklist } from "@/lib/onboarding";
import { plannedTemplates, purposesFor, templateNameFor } from "@/lib/whatsapp/template-plan";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ENV = { ...process.env };

/** 360dialog nachgebildet: Vorlagen (Liste/Einreichen), Partner-API, Webhook, Senden. */
type Remote = { name: string; language: string; status: string; category: string; rejected_reason?: string };
let remote: Remote[] = [];
let created: Array<{ name: string; category: string; components: Array<{ type: string; text?: string; format?: string; example?: { header_handle?: string[] }; buttons?: unknown[] }> }> = [];
/** Text (BODY) eines Antrags; das Erstanschreiben hat davor den Dokument-Kopf. */
const bodyText = (c: { components: Array<{ type: string; text?: string }> }) => c.components.find((x) => x.type === "BODY")?.text ?? "";
/** Alle geplanten Namen (v4, mit A/B-Fassungen). */
const plannedNames = (bestand: boolean) => plannedTemplates(purposesFor({ bestand })).map((t) => templateNameFor(t.purpose, undefined, t.form, t.variant));
const sent: Array<Record<string, unknown>> = [];
let listFails = false;
const API_KEY = "d360-secret-key";

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}
function fake360(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  const method = init?.method ?? "GET";
  if (url.includes("/v1/configs/templates")) {
    const key = new Headers(init?.headers).get("D360-API-KEY");
    if (key !== API_KEY) return json({ error: "unauthorized" }, 401);
    if (method === "GET") return listFails ? json({ error: "boom" }, 500) : json({ count: remote.length, waba_templates: remote });
    const body = JSON.parse(String(init?.body));
    if (remote.some((t) => t.name === body.name)) return json({ error: "exists" }, 400);
    created.push(body);
    remote.push({ name: body.name, language: body.language, status: "submitted", category: body.category });
    return json({ id: `t${created.length}`, name: body.name, language: body.language, status: "submitted", category: body.category });
  }
  if (url.includes("/api_keys")) return json({ id: "k1", api_key: API_KEY, address: "https://waba-v2.360dialog.io" });
  if (url.includes("/channels?")) return json({ partner_channels: [{ id: "chV1", setup_info: { phone_number: "4915112345678", phone_name: "Agentur Test" } }] });
  if (url.includes("/v1/configs/webhook")) return json({});
  if (url.includes("/messages")) {
    sent.push(JSON.parse(String(init?.body)));
    return json({ messages: [{ id: `wamid.${sent.length}` }] });
  }
  return Promise.resolve(new Response("not found", { status: 404 }));
}

let customerId = "";

async function connect(extra: Record<string, unknown> = {}) {
  return prisma.whatsAppAccount.create({
    data: { customerId, provider: "360dialog", status: "connected", apiKeyEnc: encryptSecret(API_KEY), phoneNumberId: `pn-${customerId}`, ...extra },
  });
}

beforeAll(() => requireTestDb());
beforeEach(async () => {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-123456";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.DIALOG360_PARTNER_ID = "PaRtNeR1";
  process.env.DIALOG360_PARTNER_API_KEY = "partner-key";
  process.env.APP_URL = "https://app.example.de";
  process.env.WHATSAPP_WEBHOOK_SECRET = "wh-secret";
  remote = [];
  created = [];
  sent.length = 0;
  listFails = false;
  vi.stubGlobal("fetch", vi.fn(fake360));
  vi.mocked(sendToAdmins).mockClear();
  customerId = (await makeCustomer({ name: "Allianz Anid Brand", leadAddress: "du" })).id;
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await prisma.salesTask.deleteMany({ where: { title: { contains: "Allianz Anid Brand" } } });
  await cleanupCustomer(customerId);
});
afterAll(() => {
  process.env = { ...ENV };
});

describe("WhatsApp-Vorlagen automatisch einreichen", () => {
  it("nach dem Selbst-Verbinden: 14 Zwecke in je 3 Fassungen (plus A/B) eingereicht, lokal „in Prüfung“, Beratername eingesetzt", async () => {
    const res = await completeSelfConnect({ customerId, userId: null, clientId: "cl1", channels: ["chV1"] });
    expect(res.status).toBe("connected");
    expect(created.map((c) => c.name).sort()).toEqual(plannedNames(false).sort());
    expect(created).toHaveLength(48);
    const outreach = created.find((c) => c.name === "pg_outreach_v4")!;
    expect(outreach.category).toBe("MARKETING");
    expect(bodyText(outreach)).toContain("Anid Brand");
    expect(bodyText(outreach)).not.toContain("[Berater]");
    expect(bodyText(outreach)).not.toContain("[Firma]");
    // Erstinformation als PDF im Kopf: Beispiel ist das öffentliche PDF dieses Kunden
    expect(outreach.components[0]).toMatchObject({ type: "HEADER", format: "DOCUMENT" });
    expect(outreach.components[0].example?.header_handle?.[0]).toMatch(/^https:\/\/app\.example\.de\/erstinformation\/[A-Za-z0-9_-]+\/pdf$/);
    expect(outreach.components.map((c) => c.type)).toEqual(["HEADER", "BODY", "FOOTER", "BUTTONS"]);
    expect(bodyText(created.find((c) => c.name === "pg_outreach_v4_sie")!)).toMatch(/^Guten Tag \{\{1\}\}, vielen Dank für Ihre Anfrage!/);
    expect(bodyText(created.find((c) => c.name === "pg_outreach_v4_sie_ohne_name")!)).toMatch(/^Guten Tag, vielen Dank für Ihre Anfrage!/);
    expect(bodyText(created.find((c) => c.name === "pg_outreach_tkv_v4_b_sie")!)).toContain("Erste Frage: Für welches Tier suchen Sie den Schutz?");
    expect(created.find((c) => c.name === "pg_reminder_v4")!.category).toBe("UTILITY");
    expect(created.find((c) => c.name === "pg_reschedule_v4_sie")!.category).toBe("UTILITY");
    expect(created.find((c) => c.name === "pg_reminder_soon_v4")!.category).toBe("UTILITY");
    expect(created.find((c) => c.name === "pg_followup_nudge_v4")!.category).toBe("MARKETING");
    expect(created.find((c) => c.name === "pg_reminder_v4")!.components.find((c) => c.type === "BUTTONS")).toEqual({
      type: "BUTTONS",
      buttons: [{ type: "QUICK_REPLY", text: "Ja, passt" }, { type: "QUICK_REPLY", text: "Bitte verschieben" }],
    });

    const local = await prisma.messageTemplate.findMany({ where: { customerId } });
    expect(local).toHaveLength(48);
    // Kopf und Knöpfe gespeichert (beim Senden: PDF-Link bzw. Knopf-Payloads)
    expect(local.find((t) => t.name === "pg_outreach_tkv_v4")).toMatchObject({ headerFormat: "DOCUMENT", buttons: ["Hund", "Katze"] });
    expect(local.find((t) => t.name === "pg_reminder_v4")?.headerFormat).toBeNull();
    expect(local.every((t) => t.auto && t.status === "pending" && t.submittedAt && t.language === "de")).toBe(true);
    const acc = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId } });
    expect(acc.templatesCheckedAt).not.toBeNull();
    // Kein Secret in Datenbank-Texten
    expect(JSON.stringify(local)).not.toContain(API_KEY);
  });

  it("mit Bestandskunden-Modul: zusätzlich 4 Kampagnen-Vorlagen mit Knopf „Keine Nachrichten mehr“", async () => {
    await prisma.customer.update({ where: { id: customerId }, data: { existingCustomersEnabled: true } });
    await connect();
    const s = await submitTemplatesForCustomer(customerId);
    // 14 Zwecke × 3 Fassungen + A/B (2 × 3) + 4 Kampagnen × 2 (nur gesiezt) + A/B Cross-Selling (2)
    expect(s.submitted).toHaveLength(58);
    expect(created.map((c) => c.name).sort()).toEqual(plannedNames(true).sort());
    const camp = created.find((c) => c.name === "pg_campaign_review_v4_sie")!;
    // Selbstbezeichnung nach Status laut Erstinformation, nie „Versicherungsberater“
    expect(camp.components[0].text).not.toContain("Versicherungsberater");
    expect(camp.components[0].text).not.toContain("[Rolle]");
    expect(camp.components[0].text).toMatch(/^Guten Tag \{\{1\}\}, hier ist Anid Brand( von der |, Ihr Versicherungs)/);
    expect(camp.components[0].text).not.toContain("STOPP");
    expect(camp.components[1]).toEqual({
      type: "BUTTONS",
      buttons: [{ type: "QUICK_REPLY", text: "Ja, gern" }, { type: "QUICK_REPLY", text: "Kein Bedarf" }, { type: "QUICK_REPLY", text: "Keine Nachrichten mehr" }],
    });
    expect(created.find((c) => c.name === "pg_campaign_review_v4_sie_ohne_name")!.components[1]).toEqual(camp.components[1]);
    expect(created.some((c) => c.name === "pg_campaign_review_v4")).toBe(false);
    expect(bodyText(created.find((c) => c.name === "pg_campaign_cross_sell_v4_sie")!)).toContain("eine Lücke, die erst im Schadenfall auffällt");
    expect(created.some((c) => c.name === "pg_campaign_cross_sell_v4_b_sie")).toBe(true);
  });

  it("zweiter Lauf reicht nichts doppelt ein; Freigabe → approved, Ablehnung → Aufgabe + Push", async () => {
    await connect();
    await submitTemplatesForCustomer(customerId);
    expect(created).toHaveLength(48);

    remote.find((t) => t.name === "pg_outreach_v4")!.status = "APPROVED";
    Object.assign(remote.find((t) => t.name === "pg_reminder_v4")!, { status: "REJECTED", rejected_reason: "INVALID_FORMAT" });
    const s = await submitTemplatesForCustomer(customerId);
    expect(created).toHaveLength(48);
    expect(s.approved).toEqual(["pg_outreach_v4"]);
    expect(s.rejected).toEqual(["pg_reminder_v4"]);

    const outreach = await prisma.messageTemplate.findFirstOrThrow({ where: { customerId, name: "pg_outreach_v4" } });
    expect(outreach.status).toBe("approved");
    const reminder = await prisma.messageTemplate.findFirstOrThrow({ where: { customerId, name: "pg_reminder_v4" } });
    expect(reminder.status).toBe("rejected");
    expect(reminder.rejectionReason).toBe("INVALID_FORMAT");
    const task = await prisma.salesTask.findFirst({ where: { title: "WhatsApp-Vorlage abgelehnt: Allianz Anid Brand" } });
    expect(task?.note).toContain("INVALID_FORMAT");
    expect(vi.mocked(sendToAdmins).mock.calls.some((c) => c[0].title.includes("Vorlage abgelehnt"))).toBe(true);

    // Erneuter Abgleich meldet die Ablehnung nicht noch einmal
    vi.mocked(sendToAdmins).mockClear();
    await submitTemplatesForCustomer(customerId);
    expect(await prisma.salesTask.count({ where: { title: "WhatsApp-Vorlage abgelehnt: Allianz Anid Brand" } })).toBe(1);
    expect(sendToAdmins).not.toHaveBeenCalled();

    // Neu einreichen → Revision mit neuem Namen
    const r = await resubmitTemplate(customerId, "reminder");
    expect(r).toMatchObject({ ok: true, name: "pg_reminder_v4_r2" });
    expect((await prisma.messageTemplate.findFirstOrThrow({ where: { customerId, name: "pg_reminder_v4_r2" } })).status).toBe("pending");
    // Einzelne Fassung gezielt neu einreichen
    expect(await resubmitTemplate(customerId, "reminder", new Date(), "sie")).toMatchObject({ ok: true, name: "pg_reminder_v4_sie_r2" });

    // Erstanschreiben mit PDF im Kopf abgelehnt → Revision ohne Kopf (PDF dann nach der ersten Antwort)
    Object.assign(remote.find((t) => t.name === "pg_outreach_tkv_v4")!, { status: "REJECTED", rejected_reason: "INVALID_FORMAT" });
    await submitTemplatesForCustomer(customerId);
    expect(await resubmitTemplate(customerId, "outreach_tkv")).toMatchObject({ ok: true, name: "pg_outreach_tkv_v4_r2" });
    const rev = created.find((c) => c.name === "pg_outreach_tkv_v4_r2")!;
    expect(rev.components.map((c) => c.type)).toEqual(["BODY", "BUTTONS"]);
    expect((await prisma.messageTemplate.findFirstOrThrow({ where: { customerId, name: "pg_outreach_tkv_v4_r2" } })).headerFormat).toBeNull();
  });

  it("vom Admin von Hand angelegte Vorlage bleibt unberührt", async () => {
    await connect();
    await prisma.messageTemplate.create({
      data: { customerId, name: "anid_erstkontakt", language: "de", purpose: "outreach", category: "marketing", status: "approved", body: "Hallo {{1}}" },
    });
    const s = await submitTemplatesForCustomer(customerId);
    expect(s.skipped).toEqual(["outreach"]);
    expect(created.map((c) => c.name).filter((n) => /^pg_outreach_v\d/.test(n))).toEqual([]);
    expect(created).toHaveLength(45);
  });

  it("Cron: gedrosselt, Liste nicht abrufbar → Fehler nur gemeldet", async () => {
    await connect();
    const now = new Date();
    expect((await syncTemplates(now)).checked).toBeGreaterThanOrEqual(1);
    const acc = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId } });
    expect(acc.templatesCheckedAt?.getTime()).toBe(now.getTime());
    // Innerhalb von 30 Minuten nicht erneut (dieses Konto)
    const before = created.length;
    await syncTemplates(new Date(now.getTime() + 60_000));
    expect(created.length).toBe(before);

    listFails = true;
    const s = await submitTemplatesForCustomer(customerId);
    expect(s.ok).toBe(false);
    expect(s.error).toContain("500");
    expect(s.error).not.toContain(API_KEY);
  });

  it("Go-live-Prüfung: Punkt „Vorlage fürs Erstanschreiben freigegeben“", async () => {
    await connect();
    await prisma.onboarding.create({ data: { customerId } });
    await submitTemplatesForCustomer(customerId);
    const item = async () => onboardingChecklist((await loadOnboarding({ customerId }))!, null).find((i) => i.key === "templates");
    expect((await item())?.done).toBe(false);
    expect((await item())?.label).toContain("noch nicht freigegeben");
    remote.find((t) => t.name === "pg_outreach_v4")!.status = "APPROVED";
    await submitTemplatesForCustomer(customerId);
    expect((await item())?.done).toBe(true);
  });

  it("Ansprache „Sie“: alle Fassungen eingereicht; Wahl je Kontakt, bis zur Freigabe die bisherige", async () => {
    await prisma.customer.update({ where: { id: customerId }, data: { leadAddress: "sie" } });
    await connect();
    await submitTemplatesForCustomer(customerId);
    const names = created.map((c) => c.name);
    // Beide Fassungen für jeden Kunden, damit ein Wechsel Sie/Du sofort greift
    expect(names).toContain("pg_outreach_v4");
    expect(names).toContain("pg_outreach_v4_sie");
    expect(names).toContain("pg_outreach_v4_sie_ohne_name");
    const sie = created.find((c) => c.name === "pg_outreach_v4_sie")!;
    expect(JSON.stringify(sie.components)).toContain("Guten Tag {{1}}, vielen Dank für Ihre Anfrage");
    expect(JSON.stringify(sie.components)).toContain("Frau Schneider");

    const { pickApprovedTemplate, sendWhatsAppNotice } = await import("@/lib/whatsapp/templates");
    const FRAU = { fullName: "Julia Schneider", salutation: "Frau" };
    const NUR_VORNAME = { fullName: "Julia" };
    // Nur die alte Du-Fassung freigegeben → sie geht weiter raus
    await prisma.messageTemplate.create({ data: { customerId, name: "pg_outreach_v1", language: "de", purpose: "outreach", category: "marketing", status: "approved", body: "Hallo {{1}}, du", auto: true } });
    expect((await pickApprovedTemplate(customerId, "outreach", FRAU))?.name).toBe("pg_outreach_v1");
    // Sie-Fassung mit Namen freigegeben → mit Nachnamen diese, ohne Nachnamen weiter die bisherige
    await prisma.messageTemplate.updateMany({ where: { customerId, name: "pg_outreach_v4_sie" }, data: { status: "approved" } });
    expect((await pickApprovedTemplate(customerId, "outreach", FRAU))?.name).toBe("pg_outreach_v4_sie");
    expect((await pickApprovedTemplate(customerId, "outreach", NUR_VORNAME))?.name).toBe("pg_outreach_v1");
    await prisma.messageTemplate.updateMany({ where: { customerId, name: "pg_outreach_v4_sie_ohne_name" }, data: { status: "approved" } });
    expect((await pickApprovedTemplate(customerId, "outreach", NUR_VORNAME))?.name).toBe("pg_outreach_v4_sie_ohne_name");

    // Senden außerhalb des 24-h-Fensters: Vorlage mit „Frau Schneider“ bzw. ohne Namensparameter, PDF im Kopf
    const document = { link: "https://app.example.de/erstinformation/abc123/pdf", filename: "Erstinformation.pdf" };
    await sendWhatsAppNotice({ customerId, to: "4917600000011", purpose: "outreach", params: ["Julia"], text: "x", contactName: "Julia Schneider", anrede: FRAU, document });
    await sendWhatsAppNotice({ customerId, to: "4917600000012", purpose: "outreach", params: ["Julia"], text: "x", contactName: "Julia", document });
    // Ohne PDF (Erstinformation unvollständig) keine Vorlage mit Kopf: die bisherige
    await sendWhatsAppNotice({ customerId, to: "4917600000013", purpose: "outreach", params: ["Julia"], legacyParams: ["Julia", "https://x.de/erstinformation/abc"], text: "x", contactName: "Julia Schneider", anrede: FRAU });
    type Comp = { type: string; parameters: { type: string; text?: string; document?: { link: string } }[] };
    const tpl = (i: number) => (sent[i] as { template: { name: string; components?: Comp[] } }).template;
    expect(tpl(0).name).toBe("pg_outreach_v4_sie");
    expect(tpl(0).components?.find((c) => c.type === "body")?.parameters.map((p) => p.text)).toEqual(["Frau Schneider"]);
    expect(tpl(0).components?.find((c) => c.type === "header")?.parameters[0].document?.link).toBe(document.link);
    expect(tpl(1).name).toBe("pg_outreach_v4_sie_ohne_name");
    expect(tpl(1).components?.map((c) => c.type)).toEqual(["header"]);
    expect(tpl(2).name).toBe("pg_outreach_v1");
    const bodies = await prisma.message.findMany({ where: { conversation: { customerId } }, orderBy: { createdAt: "asc" }, select: { body: true, purpose: true, variant: true } });
    expect(bodies[0].body?.startsWith("[Erstinformation als PDF]\nGuten Tag Frau Schneider, vielen Dank für Ihre Anfrage!")).toBe(true);
    expect(bodies[1].body?.startsWith("[Erstinformation als PDF]\nGuten Tag, vielen Dank für Ihre Anfrage!")).toBe(true);
    expect(bodies[2].body?.startsWith("[Erstinformation")).toBe(false);
    expect(bodies[0]).toMatchObject({ purpose: "outreach", variant: "a" });

    // Wieder „Du“ → Du-Fassung (bisherige, bis v3 freigegeben ist)
    await prisma.customer.update({ where: { id: customerId }, data: { leadAddress: "du" } });
    expect((await pickApprovedTemplate(customerId, "outreach", FRAU))?.name).toBe("pg_outreach_v1");
    await prisma.messageTemplate.updateMany({ where: { customerId, name: "pg_outreach_v4" }, data: { status: "approved" } });
    expect((await pickApprovedTemplate(customerId, "outreach", FRAU))?.name).toBe("pg_outreach_v4");
  });

  it("nicht verbunden → nichts eingereicht", async () => {
    const s = await submitTemplatesForCustomer(customerId);
    expect(s.ok).toBe(false);
    expect(created).toHaveLength(0);
  });
});

describe("Coexistence und Abmelde-Knopf", () => {
  it("Echo aus der Business-App → ausgehende Nachricht „App“, Assistent pausiert", async () => {
    const acc = await connect();
    await handleInboundPayload({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: acc.phoneNumberId }, message_echoes: [{ from: "4915112345678", to: "4917600000001", id: "wamid.echo1", type: "text", text: { body: "Hallo, hier direkt vom Handy" } }] } }] }],
    });
    const conv = await prisma.conversation.findFirstOrThrow({ where: { customerId, contactPhone: "4917600000001" }, include: { messages: true } });
    expect(conv.botActive).toBe(false);
    expect(conv.messages).toHaveLength(1);
    expect(conv.messages[0]).toMatchObject({ direction: "outbound", sentBy: "app", body: "Hallo, hier direkt vom Handy" });
    // Doppelt zugestellt → nicht doppelt gespeichert
    await handleInboundPayload({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: acc.phoneNumberId }, message_echoes: [{ from: "4915112345678", to: "4917600000001", id: "wamid.echo1", type: "text", text: { body: "Hallo, hier direkt vom Handy" } }] } }] }],
    });
    expect(await prisma.message.count({ where: { conversationId: conv.id } })).toBe(1);
  });

  it("Knopf „Keine Nachrichten mehr“ auf eine Kampagne → wie STOPP: gesperrt, Assistent schweigt", async () => {
    await prisma.customer.update({ where: { id: customerId }, data: { existingCustomersEnabled: true } });
    const acc = await connect();
    const phone = "4917600000002";
    const ec = await prisma.existingCustomer.create({ data: { customerId, firstName: "Erika", lastName: "Muster", phone, lines: ["KFZ"] } });
    const campaign = await prisma.customerCampaign.create({ data: { customerId, name: "Jahresgespräch", occasion: "review", segment: {}, status: "running" } });
    await prisma.campaignRecipient.create({ data: { campaignId: campaign.id, existingCustomerId: ec.id, status: "sent", sentAt: new Date() } });

    await handleInboundPayload({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: acc.phoneNumberId },
                contacts: [{ profile: { name: "Erika" } }],
                messages: [{ from: phone, id: "wamid.btn1", type: "button", button: { text: "Keine Nachrichten mehr", payload: "Keine Nachrichten mehr" } }],
              },
            },
          ],
        },
      ],
    });
    expect((await prisma.existingCustomer.findUniqueOrThrow({ where: { id: ec.id } })).optOutAt).not.toBeNull();
    const conv = await prisma.conversation.findFirstOrThrow({ where: { customerId, contactPhone: phone }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    expect(conv.botActive).toBe(false);
    expect(conv.messages[0]).toMatchObject({ direction: "inbound", kind: "button", body: "Keine Nachrichten mehr" });
    const rec = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id } });
    expect(rec).toMatchObject({ status: "replied", reason: "Stopp" });
  });
});

describe("Knopf-Antworten (v4)", () => {
  const press = (phoneNumberId: string | null, from: string, id: string, text: string, payload?: string) =>
    handleInboundPayload({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId ?? undefined }, messages: [{ from, id, type: "button", button: { text, payload: payload ?? text } }] } }] }],
    });

  it("„Ja, passt“ bestätigt den Termin, kurze Antwort, kein Assistent", async () => {
    const acc = await connect();
    const phone = "4917600000031";
    const lead = await prisma.lead.create({ data: { customerId, name: "Julia Schneider", phone, status: "In Beratung" } });
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: phone, leadId: lead.id } });
    const appt = await prisma.appointment.create({ data: { customerId, leadId: lead.id, conversationId: conv.id, mode: "phone", startsAt: new Date(Date.now() + 20 * 3600_000), status: "booked" } });
    await press(acc.phoneNumberId, phone, "wamid.k1", "Ja, passt");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).confirmedAt).not.toBeNull();
    const out = await prisma.message.findMany({ where: { conversationId: conv.id, direction: "outbound" } });
    expect(out).toHaveLength(1);
    expect(out[0].body).toMatch(/^Super, danke! Dann bis /);
    expect(await prisma.message.count({ where: { conversationId: conv.id, kind: "appointment_confirmed" } })).toBe(1);
  });

  it("„Nein, danke“ (letzte Nachricht) → Lead sauber verloren mit Grund „kein Bedarf“; getippt zählt es nicht", async () => {
    const acc = await connect();
    const phone = "4917600000032";
    const lead = await prisma.lead.create({ data: { customerId, name: "Julia Schneider", phone, status: "Im Gespräch" } });
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: phone, leadId: lead.id } });
    // Getippt „Nein, danke“ kann eine Antwort auf eine andere Frage sein: kein Verloren
    await handleInboundPayload({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: acc.phoneNumberId }, messages: [{ from: phone, id: "wamid.k2a", type: "text", text: { body: "Nein, danke" } }] } }] }],
    });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).not.toBe("Kein Interesse");
    await press(acc.phoneNumberId, phone, "wamid.k2", "Nein, danke");
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(l).toMatchObject({ status: "Kein Interesse", lostReason: "kein_interesse", reached: true });
    expect(l.lostNote).toContain("kein Bedarf");
    const out = await prisma.message.findMany({ where: { conversationId: conv.id, direction: "outbound" }, orderBy: { createdAt: "asc" } });
    expect(out.at(-1)?.body).toContain("danke für deine Rückmeldung");
  });

  it("Kampagne: „Kein Bedarf“ → beantwortet, kein Lead, keine Sperre", async () => {
    await prisma.customer.update({ where: { id: customerId }, data: { existingCustomersEnabled: true } });
    const acc = await connect();
    const phone = "4917600000033";
    const ec = await prisma.existingCustomer.create({ data: { customerId, firstName: "Erika", lastName: "Muster", phone, lines: ["KFZ"] } });
    const campaign = await prisma.customerCampaign.create({ data: { customerId, name: "Lücke Hausrat", occasion: "cross_sell", segment: {}, status: "running" } });
    await prisma.campaignRecipient.create({ data: { campaignId: campaign.id, existingCustomerId: ec.id, status: "sent", sentAt: new Date() } });
    await press(acc.phoneNumberId, phone, "wamid.k3", "Kein Bedarf");
    expect(await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id } })).toMatchObject({ status: "replied", reason: "Kein Bedarf", leadId: null });
    expect((await prisma.existingCustomer.findUniqueOrThrow({ where: { id: ec.id } })).optOutAt).toBeNull();
    expect(await prisma.lead.count({ where: { customerId, phone } })).toBe(0);
    const conv = await prisma.conversation.findFirstOrThrow({ where: { customerId, contactPhone: phone }, include: { messages: { where: { direction: "outbound" } } } });
    expect(conv.optedOutAt).toBeNull();
    expect(conv.messages[0]?.body).toContain("vielen Dank für Ihre Rückmeldung");
  });
});
