// WhatsApp verbinden mit Einladung (Ole, 15.11.2026): Wir legen das 360dialog-Konto unter unserem Partner an,
// 360dialog lädt ein; danach geht es angemeldet über den Partner-Link weiter. Konto vorhanden → direkt anmelden.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ customerId: "", userId: "", email: "inhaber@example.test" }));
vi.mock("@/lib/buyer-context", () => ({
  getBuyerContext: async () => ({ customerId: st.customerId, userId: st.userId, email: st.email, preview: false, teamRole: "owner" }),
}));

import { prisma } from "@/lib/prisma";
import { GET } from "@/app/buyer/whatsapp-verbinden/route";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ENV = { ...process.env };
let createStatus = 201;
const calls: { method: string; url: string; body: string }[] = [];
function fake(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  calls.push({ method: init?.method ?? "GET", url, body: String(init?.body ?? "") });
  if (url.endsWith("/account_sharing/clients")) {
    if (createStatus === 409) return Promise.resolve(new Response(JSON.stringify({ meta: { developer_message: "User already exists" } }), { status: 409 }));
    return Promise.resolve(new Response(JSON.stringify({ id: "clNEW" }), { status: 201 }));
  }
  if (url.includes("/clients/clNEW")) return Promise.resolve(new Response("{}", { status: 200 }));
  return Promise.resolve(new Response("not found", { status: 404 }));
}

beforeAll(() => requireTestDb());
beforeEach(async () => {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-123456";
  process.env.DIALOG360_PARTNER_ID = "PaRtNeR1";
  process.env.DIALOG360_PARTNER_API_KEY = "partner-key";
  process.env.APP_URL = "https://app.example.de";
  createStatus = 201;
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(fake));
  st.customerId = (await makeCustomer({ name: "Agentur Muster" })).id;
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanupCustomer(st.customerId);
});
afterAll(() => {
  process.env = { ...ENV };
});

describe("WhatsApp verbinden mit Einladung", () => {
  it("legt das Konto unter dem Partner an, merkt es und zeigt den nächsten Schritt", async () => {
    const res = await GET(new Request("https://app.example.de/buyer/whatsapp-verbinden"));
    expect(res.headers.get("location")).toContain("/buyer/einrichtung?wa=invited");
    const create = calls.find((c) => c.url.endsWith("/account_sharing/clients"))!;
    expect(create.method).toBe("POST");
    expect(JSON.parse(create.body)).toMatchObject({ email: "inhaber@example.test", name: "Agentur Muster", send_client_email: true });
    expect(calls.some((c) => c.method === "PATCH" && c.body.includes(st.customerId))).toBe(true);
    const acc = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId: st.customerId } });
    expect(acc).toMatchObject({ status: "invited", dialog360ClientId: "clNEW" });
    // Zweiter Klick („Weiter“): angemeldet zum Partner-Link, kein neues Konto
    const next = await GET(new Request("https://app.example.de/buyer/whatsapp-verbinden?weiter=1"));
    const loc = new URL(next.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://app.360dialog.com/onboarding/PaRtNeR1");
    expect(loc.searchParams.get("next")).toBe("login");
    expect(loc.searchParams.get("partner")).toBe(st.customerId);
    expect(calls.filter((c) => c.url.endsWith("/account_sharing/clients"))).toHaveLength(1);
  });

  it("E-Mail hat schon ein 360dialog-Konto: direkt zur Anmeldung", async () => {
    createStatus = 409;
    const res = await GET(new Request("https://app.example.de/buyer/whatsapp-verbinden"));
    const loc = new URL(res.headers.get("location")!);
    expect(loc.hostname).toBe("app.360dialog.com");
    expect(loc.searchParams.get("next")).toBe("login");
    expect(await prisma.whatsAppAccount.findUnique({ where: { customerId: st.customerId } })).toBeNull();
  });
});
