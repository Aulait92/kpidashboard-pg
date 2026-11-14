// WhatsApp-Vorlagen beim Buchen bzw. Freischalten der Module sofort einreichen (Ole, 14.11.2026),
// nicht erst im Cron. 360dialog ist nachgebildet (keine externen Aufrufe).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async () => {}),
  sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
}));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { setBestandModule, setEmpfehlungModule } from "@/lib/billing";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const API_KEY = "d360-modul-key";
let created: string[] = [];
const remote: { name: string; language: string; status: string; category: string }[] = [];

function fake360(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  const res = (b: unknown, s = 200) => Promise.resolve(new Response(JSON.stringify(b), { status: s }));
  if (url.includes("/v1/configs/templates")) {
    if ((init?.method ?? "GET") === "GET") return res({ count: remote.length, waba_templates: remote });
    const body = JSON.parse(String(init?.body));
    created.push(body.name);
    remote.push({ name: body.name, language: body.language, status: "submitted", category: body.category });
    return res({ id: `t${created.length}`, name: body.name, language: body.language, status: "submitted", category: body.category });
  }
  return Promise.resolve(new Response("not found", { status: 404 }));
}

describe("Vorlagen beim Freischalten der Module", () => {
  const ids: string[] = [];
  beforeAll(() => requireTestDb());
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    created = [];
    remote.length = 0;
    vi.stubGlobal("fetch", vi.fn(fake360));
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    for (const id of ids) await cleanupCustomer(id);
  });

  it("Bestandskunden-Modul freischalten: Kampagnen-Vorlagen gehen sofort raus (verbundene Nummer)", async () => {
    const c = await makeCustomer({ name: "Agentur Vorlagen Test" });
    ids.push(c.id);
    await prisma.whatsAppAccount.create({ data: { customerId: c.id, provider: "360dialog", status: "connected", apiKeyEnc: encryptSecret(API_KEY) } });
    expect((await setBestandModule(c.id, "free")).ok).toBe(true);
    expect(created.some((n) => n.startsWith("pg_campaign_review"))).toBe(true);
    expect(await prisma.messageTemplate.count({ where: { customerId: c.id, purpose: "campaign_renewal", status: "pending" } })).toBeGreaterThan(0);
  });

  it("Empfehlungs-Modul freischalten: Empfehlungs-Vorlagen gehen sofort raus", async () => {
    const c = await makeCustomer({ name: "Agentur Empfehlung Test" });
    ids.push(c.id);
    await prisma.whatsAppAccount.create({ data: { customerId: c.id, provider: "360dialog", status: "connected", apiKeyEnc: encryptSecret(API_KEY) } });
    expect((await setEmpfehlungModule(c.id, "free")).ok).toBe(true);
    expect(created.some((n) => n.startsWith("pg_referral_request"))).toBe(true);
  });

  it("Ohne verbundene Nummer: nichts eingereicht, Freischalten klappt trotzdem (Verbinden reicht später ein)", async () => {
    const c = await makeCustomer({ name: "Agentur Ohne Nummer" });
    ids.push(c.id);
    expect((await setBestandModule(c.id, "free")).ok).toBe(true);
    expect(created).toHaveLength(0);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).existingCustomersEnabled).toBe(true);
  });
});
