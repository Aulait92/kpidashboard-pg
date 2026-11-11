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
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ENV = { ...process.env };

/** 360dialog nachgebildet: Vorlagen (Liste/Einreichen), Partner-API, Webhook, Senden. */
type Remote = { name: string; language: string; status: string; category: string; rejected_reason?: string };
let remote: Remote[] = [];
let created: Array<{ name: string; category: string; components: Array<{ type: string; text?: string; buttons?: unknown[] }> }> = [];
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
  customerId = (await makeCustomer({ name: "Allianz Anid Brand" })).id;
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
  it("nach dem Selbst-Verbinden: 8 Vorlagen eingereicht, lokal „in Prüfung“, Beratername eingesetzt", async () => {
    const res = await completeSelfConnect({ customerId, userId: null, clientId: "cl1", channels: ["chV1"] });
    expect(res.status).toBe("connected");
    expect(created.map((c) => c.name).sort()).toEqual(
      ["outreach", "booking_confirmation", "reminder", "reschedule", "followup", "followup_offer", "followup_noshow", "followup_last"].map((p) => `pg_${p}_v1`).sort(),
    );
    const outreach = created.find((c) => c.name === "pg_outreach_v1")!;
    expect(outreach.category).toBe("MARKETING");
    expect(outreach.components[0].text).toContain("Anid Brand");
    expect(outreach.components[0].text).not.toContain("[Berater]");
    expect(created.find((c) => c.name === "pg_reminder_v1")!.category).toBe("UTILITY");
    expect(created.find((c) => c.name === "pg_reschedule_v1")!.category).toBe("UTILITY");

    const local = await prisma.messageTemplate.findMany({ where: { customerId } });
    expect(local).toHaveLength(8);
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
    expect(s.submitted).toHaveLength(12);
    const camp = created.find((c) => c.name === "pg_campaign_review_v1")!;
    expect(camp.components[0].text).toContain("Ihr Versicherungsberater");
    expect(camp.components[0].text).not.toContain("STOPP");
    expect(camp.components[1]).toEqual({ type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Keine Nachrichten mehr" }] });
    expect(created.find((c) => c.name === "pg_outreach_v1")!.components).toHaveLength(1);
  });

  it("zweiter Lauf reicht nichts doppelt ein; Freigabe → approved, Ablehnung → Aufgabe + Push", async () => {
    await connect();
    await submitTemplatesForCustomer(customerId);
    expect(created).toHaveLength(8);

    remote.find((t) => t.name === "pg_outreach_v1")!.status = "APPROVED";
    Object.assign(remote.find((t) => t.name === "pg_reminder_v1")!, { status: "REJECTED", rejected_reason: "INVALID_FORMAT" });
    const s = await submitTemplatesForCustomer(customerId);
    expect(created).toHaveLength(8);
    expect(s.approved).toEqual(["pg_outreach_v1"]);
    expect(s.rejected).toEqual(["pg_reminder_v1"]);

    const outreach = await prisma.messageTemplate.findFirstOrThrow({ where: { customerId, name: "pg_outreach_v1" } });
    expect(outreach.status).toBe("approved");
    const reminder = await prisma.messageTemplate.findFirstOrThrow({ where: { customerId, name: "pg_reminder_v1" } });
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
    expect(r).toMatchObject({ ok: true, name: "pg_reminder_v1_r2" });
    expect((await prisma.messageTemplate.findFirstOrThrow({ where: { customerId, name: "pg_reminder_v1_r2" } })).status).toBe("pending");
  });

  it("vom Admin von Hand angelegte Vorlage bleibt unberührt", async () => {
    await connect();
    await prisma.messageTemplate.create({
      data: { customerId, name: "anid_erstkontakt", language: "de", purpose: "outreach", category: "marketing", status: "approved", body: "Hallo {{1}}" },
    });
    const s = await submitTemplatesForCustomer(customerId);
    expect(s.skipped).toEqual(["outreach"]);
    expect(created.map((c) => c.name)).not.toContain("pg_outreach_v1");
    expect(created).toHaveLength(7);
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
    remote.find((t) => t.name === "pg_outreach_v1")!.status = "APPROVED";
    await submitTemplatesForCustomer(customerId);
    expect((await item())?.done).toBe(true);
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
