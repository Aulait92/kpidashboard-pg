// „Verbindung prüfen“ (Ole, 15.11.2026): Rücksprung von 360dialog ausgeblieben → Nummer über die Partner-API
// finden (partner_payload = Kunden-ID, sonst Kontakt-E-Mail), Key holen, verbinden; Admin ordnet freie Nummern zu.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async () => {}),
  sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
}));
vi.mock("@/lib/whatsapp/template-submit", async (orig) => ({ ...(await orig<typeof import("@/lib/whatsapp/template-submit")>()), submitTemplatesForCustomer: vi.fn(async () => ({ ok: true, submitted: [], approved: [], rejected: [], pending: [], skipped: [] })) }));

import { prisma } from "@/lib/prisma";
import { onboardingLink, partnerConfig } from "@/lib/whatsapp/dialog360-partner";
import { assignChannel, autoMatchChannels, checkConnection, freePartnerChannels, matchChannelsForCustomer } from "@/lib/whatsapp/dialog360-match";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const ENV = { ...process.env };
let channels: unknown[] = [];
let keyStatus = 200;
function fake360(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("/api_keys")) {
    if (keyStatus === 409) return Promise.resolve(new Response("{}", { status: 409, headers: { "Retry-After": "15" } }));
    return Promise.resolve(new Response(JSON.stringify({ api_key: "d360-key", address: "https://waba-v2.360dialog.io" }), { status: 200 }));
  }
  if (url.includes("/channels")) {
    const u = new URL(url);
    const f = u.searchParams.get("filters");
    const id = f ? (JSON.parse(f) as { id?: string }).id : undefined;
    const list = id ? channels.filter((c) => (c as { id: string }).id === id) : channels;
    return Promise.resolve(new Response(JSON.stringify({ partner_channels: list }), { status: 200 }));
  }
  if (url.includes("/v1/configs/webhook")) return Promise.resolve(new Response("{}", { status: init?.method ? 200 : 200 }));
  return Promise.resolve(new Response("not found", { status: 404 }));
}
const ch = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  client_id: `cl-${id}`,
  availability_status: "ready",
  created_at: "2026-11-15T14:00:00Z",
  setup_info: { phone_number: "16182024132", phone_name: "Ole Agentur" },
  client: { id: `cl-${id}`, name: "Ole Agentur", partner_payload: null, contact_info: { email: null } },
  ...extra,
});

const ids: string[] = [];
beforeAll(() => requireTestDb());
beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-123456";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.DIALOG360_PARTNER_ID = "PaRtNeR1";
  process.env.DIALOG360_PARTNER_API_KEY = "partner-key";
  process.env.APP_URL = "https://app.example.de";
  process.env.WHATSAPP_WEBHOOK_SECRET = "wh-secret";
  keyStatus = 200;
  vi.stubGlobal("fetch", vi.fn(fake360));
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  for (const id of ids) await cleanupCustomer(id);
  process.env = { ...ENV };
});

describe("Verbindung prüfen", () => {
  it("Link gibt die Kunden-ID als partner mit, ohne plan_selection", () => {
    const link = new URL(onboardingLink(partnerConfig()!, { redirectUrl: "https://x/cb", state: "s", customerId: "cust123" }));
    expect(link.searchParams.get("partner")).toBe("cust123");
    expect(link.searchParams.get("plan_selection")).toBeNull();
  });

  it("findet die Nummer über die Kunden-ID und verbindet", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    channels = [ch("chX", { client: { id: "clX", name: "X", partner_payload: c.id, contact_info: { email: null } } }), ch("chOther")];
    expect(await checkConnection(c.id)).toEqual({ status: "connected", phone: "16182024132" });
    const acc = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId: c.id } });
    expect(acc).toMatchObject({ status: "connected", dialog360ChannelId: "chX" });
    // Schon verbunden: kein zweiter Abruf
    expect((await checkConnection(c.id)).status).toBe("connected");
  });

  it("findet die Nummer über die Login-E-Mail; noch in Freischaltung → wartend", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    const u = await makeBuyer(c.id, "owner");
    keyStatus = 409;
    channels = [ch("chMail", { availability_status: "pending_activation", client: { id: "clM", name: "OL", partner_payload: null, contact_info: { email: u.email.toUpperCase() } } })];
    expect(await checkConnection(c.id)).toMatchObject({ status: "pending", activation: true });
    expect((await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId: c.id } })).status).toBe("pending");
  });

  it("nichts gefunden bzw. Admin ordnet eine freie Nummer zu; vergebene Nummern sind tabu", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    channels = [ch("chFree"), ch("chX")];
    expect(await checkConnection(c.id)).toEqual({ status: "not_found" });
    const free = await freePartnerChannels();
    expect(free.map((f) => f.id)).toContain("chFree");
    expect(free.map((f) => f.id)).not.toContain("chX"); // gehört schon dem Kunden aus dem ersten Test
    expect((await assignChannel(c.id, "chFree", null)).status).toBe("connected");
    expect((await assignChannel(c.id, "chX", null)).status).toBe("error");
  });

  it("Partner-Webhook bzw. Cron: ordnet Nummern mit Kunden-ID selbst zu", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    channels = [ch("chAuto", { client: { id: "clA", name: "A", partner_payload: c.id, contact_info: { email: null } } })];
    expect(await autoMatchChannels()).toEqual({ connected: 1 });
    expect((await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId: c.id } })).dialog360ChannelId).toBe("chAuto");
  });

  it("Zuordnung: Kunden-ID vor E-Mail, gekündigte Nummern nie", () => {
    const base = { clientId: null, clientName: null, phone: null, name: null, createdAt: null };
    const list = [
      { ...base, id: "a", partnerPayload: null, contactEmail: "x@y.de", availability: "ready" },
      { ...base, id: "b", partnerPayload: "c1", contactEmail: null, availability: "ready" },
      { ...base, id: "c", partnerPayload: null, contactEmail: "x@y.de", availability: "cancelled" },
    ];
    expect(matchChannelsForCustomer(list, { id: "c1", emails: ["x@y.de"] }, new Set()).map((m) => m.id)).toEqual(["b"]);
    expect(matchChannelsForCustomer(list, { id: "c2", emails: ["X@y.de"] }, new Set()).map((m) => m.id)).toEqual(["a"]);
  });
});
