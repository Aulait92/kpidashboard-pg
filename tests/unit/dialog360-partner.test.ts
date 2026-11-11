import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STATE_TTL_MS,
  createChannelApiKey,
  onboardingLink,
  parseChannels,
  partnerConfig,
  selfConnectEnabled,
  signState,
  verifyState,
} from "@/lib/whatsapp/dialog360-partner";

const ENV = { ...process.env };

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-123456";
  process.env.DIALOG360_PARTNER_ID = "PaRtNeR1";
  process.env.DIALOG360_PARTNER_API_KEY = "partner-key";
  delete process.env.DIALOG360_HUB_URL;
  delete process.env.DIALOG360_ONBOARDING_URL;
});
afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllGlobals();
});

describe("360dialog Partner: Konfiguration", () => {
  it("nur sichtbar, wenn Partner-ID und Partner-API-Key gesetzt sind", () => {
    expect(selfConnectEnabled()).toBe(true);
    delete process.env.DIALOG360_PARTNER_API_KEY;
    expect(selfConnectEnabled()).toBe(false);
    expect(partnerConfig()).toBeNull();
  });
});

describe("360dialog Partner: signierter state", () => {
  it("prüft Kunde, Nutzer und Ablauf", () => {
    const now = Date.now();
    const s = signState("cust1", "user1", now);
    expect(verifyState(s, now + 1000)).toEqual({ customerId: "cust1", userId: "user1" });
    expect(verifyState(s, now + STATE_TTL_MS + 1)).toBeNull();
  });

  it("lehnt veränderte oder fremde states ab", () => {
    const s = signState("cust1", null);
    const [payload, sig] = s.split(".");
    const other = Buffer.from(JSON.stringify({ c: "cust2", u: null, e: Date.now() + 60_000 })).toString("base64url");
    expect(verifyState(`${other}.${sig}`)).toBeNull();
    expect(verifyState(`${payload}.x${sig.slice(1)}`)).toBeNull();
    expect(verifyState("")).toBeNull();
    expect(verifyState("abc")).toBeNull();
    process.env.AUTH_SECRET = "anderes-secret-anderes-secret-anderes-1234";
    expect(verifyState(s)).toBeNull();
  });
});

describe("360dialog Partner: Link und Redirect", () => {
  it("baut den Onboarding-Link mit redirect_url, state und Sprache", () => {
    const link = new URL(onboardingLink(partnerConfig()!, { redirectUrl: "https://app.example.de/api/whatsapp/360dialog/callback", state: "st", email: "a@b.de", name: "Agentur X" }));
    expect(link.origin + link.pathname).toBe("https://app.360dialog.com/dashboard/app/PaRtNeR1/permissions");
    expect(link.searchParams.get("redirect_url")).toBe("https://app.example.de/api/whatsapp/360dialog/callback");
    expect(link.searchParams.get("state")).toBe("st");
    expect(link.searchParams.get("lang")).toBe("de");
    expect(link.searchParams.get("plan_selection")).toBe("regular");
    expect(link.searchParams.get("email")).toBe("a@b.de");
  });

  it("liest channels in allen Schreibweisen", () => {
    expect(parseChannels("[y9MiLoCH]")).toEqual(["y9MiLoCH"]);
    expect(parseChannels("[a1,b2]")).toEqual(["a1", "b2"]);
    expect(parseChannels('["a1","b2"]')).toEqual(["a1", "b2"]);
    expect(parseChannels("a1, b2")).toEqual(["a1", "b2"]);
    expect(parseChannels("[<script>]")).toEqual([]);
    expect(parseChannels(null)).toEqual([]);
  });
});

describe("360dialog Partner: API-Key erzeugen", () => {
  it("POST an /api/v2/partners/<id>/channels/<ch>/api_keys mit X-API-Key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "k1", api_key: "secret-key", address: "https://waba-v2.360dialog.io" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await createChannelApiKey(partnerConfig()!, "ch1");
    expect(res).toEqual({ kind: "ok", apiKey: "secret-key", address: "https://waba-v2.360dialog.io" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hub.360dialog.io/api/v2/partners/PaRtNeR1/channels/ch1/api_keys");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("partner-key");
  });

  it("409 (Channel wird noch eingerichtet) → später erneut, mit Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 409, headers: { "Retry-After": "20" } })));
    expect(await createChannelApiKey(partnerConfig()!, "ch1")).toEqual({ kind: "retry", afterSeconds: 20, status: 409 });
  });

  it("403 → Fehler mit Meldung von 360dialog", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ meta: { developer_message: "No permission", http_code: 403, success: false } }), { status: 403 })));
    expect(await createChannelApiKey(partnerConfig()!, "ch1")).toEqual({ kind: "error", status: 403, message: "No permission" });
  });
});
