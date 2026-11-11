import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async () => {}),
  sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
}));

import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/encryption";
import { sendToAdmins } from "@/lib/push";
import { signState } from "@/lib/whatsapp/dialog360-partner";
import { completeSelfConnect, retryPendingSelfConnect } from "@/lib/whatsapp/self-connect";
import { GET as callback } from "@/app/api/whatsapp/360dialog/callback/route";
import { POST as partnerWebhook } from "@/app/api/whatsapp/360dialog/partner-webhook/route";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ENV = { ...process.env };

/** 360dialog nachgebildet: Partner-API (Key, Channel-Info) und Messaging-API (Webhook). */
type Plan = { key: "ok" | "409" | "403"; webhook?: "ok" | "fail" };
let plan: Plan = { key: "ok" };
const calls: string[] = [];
function fake360(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  calls.push(`${init?.method ?? "GET"} ${url}`);
  if (url.includes("/api_keys")) {
    if (plan.key === "409") return Promise.resolve(new Response("{}", { status: 409, headers: { "Retry-After": "15" } }));
    if (plan.key === "403") return Promise.resolve(new Response(JSON.stringify({ meta: { developer_message: "Permission revoked", http_code: 403, success: false } }), { status: 403 }));
    return Promise.resolve(new Response(JSON.stringify({ id: "k1", api_key: "d360-secret-key", address: "https://waba-v2.360dialog.io" }), { status: 200 }));
  }
  if (url.includes("/channels?")) {
    return Promise.resolve(new Response(JSON.stringify({ partner_channels: [{ id: "chAAA1", setup_info: { phone_number: "4915112345678", phone_name: "Agentur Test" } }] }), { status: 200 }));
  }
  if (url.includes("/v1/configs/webhook")) {
    return Promise.resolve(new Response("{}", { status: plan.webhook === "fail" ? 400 : 200 }));
  }
  return Promise.resolve(new Response("not found", { status: 404 }));
}

let customerId = "";

beforeAll(() => requireTestDb());
beforeEach(async () => {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-123456";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.DIALOG360_PARTNER_ID = "PaRtNeR1";
  process.env.DIALOG360_PARTNER_API_KEY = "partner-key";
  process.env.APP_URL = "https://app.example.de";
  process.env.WHATSAPP_WEBHOOK_SECRET = "wh-secret";
  plan = { key: "ok" };
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(fake360));
  vi.mocked(sendToAdmins).mockClear();
  customerId = (await makeCustomer()).id;
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanupCustomer(customerId);
});
afterAll(() => {
  process.env = { ...ENV };
});

describe("WhatsApp selbst verbinden (360dialog Integrated Onboarding)", () => {
  it("Redirect mit gültigem state → Key erzeugt, verschlüsselt gespeichert, Webhook gesetzt, verbunden", async () => {
    const state = signState(customerId, null);
    const res = await callback(new Request(`https://app.example.de/api/whatsapp/360dialog/callback?client=cl1&channels=[chAAA1]&state=${encodeURIComponent(state)}`));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/buyer/einrichtung?wa=ok");

    const acc = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId } });
    expect(acc.status).toBe("connected");
    expect(acc.dialog360ChannelId).toBe("chAAA1");
    expect(acc.dialog360ClientId).toBe("cl1");
    expect(acc.phoneNumber).toBe("4915112345678");
    expect(acc.displayName).toBe("Agentur Test");
    expect(acc.apiKeyEnc).not.toContain("d360-secret-key");
    expect(decryptSecret(acc.apiKeyEnc!)).toBe("d360-secret-key");
    expect(calls.some((c) => c === "POST https://hub.360dialog.io/api/v2/partners/PaRtNeR1/channels/chAAA1/api_keys")).toBe(true);
    expect(calls.some((c) => c.startsWith("POST https://waba-v2.360dialog.io/v1/configs/webhook"))).toBe(true);

    const log = await prisma.auditLog.findFirst({ where: { customerId, action: "whatsapp.self_connect" } });
    expect(log?.details).toMatchObject({ result: "connected", channelId: "chAAA1" });
    expect(JSON.stringify(log?.details)).not.toContain("d360-secret-key");
    expect(vi.mocked(sendToAdmins).mock.calls[0][0].title).toContain("WhatsApp verbunden");
  });

  it("falscher state → abgelehnt, nichts gespeichert, kein Aufruf bei 360dialog", async () => {
    const res = await callback(new Request(`https://app.example.de/api/whatsapp/360dialog/callback?client=cl1&channels=[chAAA1]&state=gefaelscht.abc`));
    expect(res.headers.get("location")).toContain("wa=state");
    expect(await prisma.whatsAppAccount.findUnique({ where: { customerId } })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("Channel noch in Einrichtung (409) → wartend, der Cron holt den Key nach", async () => {
    plan = { key: "409" };
    const res = await completeSelfConnect({ customerId, userId: null, clientId: "cl1", channels: ["chAAA1"] });
    expect(res.status).toBe("pending");
    let acc = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId } });
    expect(acc.status).toBe("pending");
    expect(acc.apiKeyEnc).toBeNull();

    // 30-s-Grenze: direkt danach kein neuer Versuch
    expect((await retryPendingSelfConnect(new Date())).tried).toBe(0);
    plan = { key: "ok" };
    const later = new Date(Date.now() + 60_000);
    const r = await retryPendingSelfConnect(later);
    expect(r).toMatchObject({ tried: 1, connected: 1 });
    acc = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId } });
    expect(acc.status).toBe("connected");
    expect(decryptSecret(acc.apiKeyEnc!)).toBe("d360-secret-key");
  });

  it("Partner-API verweigert (403) → Fehler, Admin-Aufgabe und Push, Kunde sieht „Wir melden uns“", async () => {
    plan = { key: "403" };
    const state = signState(customerId, null);
    const res = await callback(new Request(`https://app.example.de/api/whatsapp/360dialog/callback?client=cl1&channels=[chAAA1]&state=${encodeURIComponent(state)}`));
    expect(res.headers.get("location")).toContain("wa=error");
    const acc = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId } });
    expect(acc.status).toBe("error");
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    const task = await prisma.salesTask.findFirst({ where: { title: `WhatsApp-Verbindung prüfen: ${customer.name}` } });
    expect(task?.note).toContain("Permission revoked");
    expect(vi.mocked(sendToAdmins)).toHaveBeenCalled();
    await prisma.salesTask.deleteMany({ where: { id: task!.id } });
    // Kein weiterer automatischer Versuch nach hartem Fehler
    expect((await retryPendingSelfConnect(new Date(Date.now() + 60_000))).tried).toBe(0);
  });

  it("Webhook lässt sich nicht setzen → Fehler mit Admin-Aufgabe", async () => {
    plan = { key: "ok", webhook: "fail" };
    const res = await completeSelfConnect({ customerId, userId: null, clientId: null, channels: ["chAAA1"] });
    expect(res.status).toBe("error");
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    const task = await prisma.salesTask.findFirst({ where: { title: `WhatsApp-Verbindung prüfen: ${customer.name}` } });
    expect(task).not.toBeNull();
    await prisma.salesTask.deleteMany({ where: { id: task!.id } });
  });

  it("Partner-Webhook channel_running holt den Key sofort (nur mit Token)", async () => {
    plan = { key: "409" };
    await completeSelfConnect({ customerId, userId: null, clientId: "cl1", channels: ["chAAA1"] });
    const body = JSON.stringify({ type: "channel_running", payload: { channel: "chAAA1" } });
    const denied = await partnerWebhook(new Request("https://app.example.de/api/whatsapp/360dialog/partner-webhook?token=falsch", { method: "POST", body }));
    expect(denied.status).toBe(401);
    plan = { key: "ok" };
    const ok = await partnerWebhook(new Request("https://app.example.de/api/whatsapp/360dialog/partner-webhook?token=wh-secret", { method: "POST", body }));
    expect(ok.status).toBe(200);
    const acc = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId } });
    expect(acc.status).toBe("connected");
  });

  it("ohne freigegebene Nummer → Fehler, Admin-Aufgabe", async () => {
    const res = await completeSelfConnect({ customerId, userId: null, clientId: "cl1", channels: [] });
    expect(res.status).toBe("error");
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    await prisma.salesTask.deleteMany({ where: { title: `WhatsApp-Verbindung prüfen: ${customer.name}` } });
  });
});
