import http from "node:http";
import https from "node:https";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// App-Demo: In einer Demo-Anfrage geht nichts nach außen (fetch, http/https), alle anderen Anfragen unverändert.

const zustand = vi.hoisted(() => ({ demo: false }));
vi.mock("@/lib/app-demo/anfrage", () => ({ istDemoAnfrage: () => zustand.demo }));

import { sperreAusgangInDerDemo } from "@/lib/app-demo/ausgang";

const fetchVorher = globalThis.fetch;
const aufrufe: string[] = [];

beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    aufrufe.push(String(input));
    return new Response("ok");
  }) as typeof fetch;
  sperreAusgangInDerDemo();
});
afterAll(() => {
  globalThis.fetch = fetchVorher;
});

describe("App-Demo: Ausgang gesperrt", () => {
  it("Demo-Anfrage: fetch und http(s).request scheitern, ohne dass etwas gesendet wird", async () => {
    zustand.demo = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(fetch("https://waba.360dialog.io/messages")).rejects.toThrow(/App-Demo/);
    await expect(fetch(new URL("https://api.anthropic.com/v1/messages"))).rejects.toThrow(/App-Demo/);
    expect(() => https.request("https://api.stripe.com/v1/customers")).toThrow(/App-Demo/);
    expect(() => http.get({ hostname: "example.com", path: "/" })).toThrow(/App-Demo/);
    expect(aufrufe).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("normale Anfrage: unverändert", async () => {
    zustand.demo = false;
    const r = await fetch("https://example.com/x");
    expect(await r.text()).toBe("ok");
    expect(aufrufe).toEqual(["https://example.com/x"]);
  });
});
