// Diagnose-API: nur mit eigenem Lese-Schlüssel, nur feste Abfragen (Ole, 14.11.2026).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/ops/diagnose/route";
import { requireTestDb } from "./db";

const TOKEN = "test-read-token-0123456789-0123456789-abcdef";
const req = (q: string, token?: string) => new Request(`https://app.test/api/ops/diagnose?q=${q}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("Diagnose-API", () => {
  const before = process.env.OPS_READ_TOKEN;
  beforeAll(() => {
    requireTestDb();
    process.env.OPS_READ_TOKEN = TOKEN;
  });
  afterAll(() => {
    process.env.OPS_READ_TOKEN = before;
  });

  it("ohne oder mit falschem Schlüssel: 401", async () => {
    expect((await GET(req("uebersicht"))).status).toBe(401);
    expect((await GET(req("uebersicht", "falsch"))).status).toBe(401);
  });

  it("feste Abfragen liefern Daten, unbekannte nicht", async () => {
    const r = await GET(req("uebersicht", TOKEN));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { data: { abfragen: string[] } };
    expect(j.data.abfragen).toContain("stripe");
    expect((await GET(req("stripe", TOKEN))).status).toBe(200);
    expect((await GET(req("drop table", TOKEN))).status).toBe(400);
  });

  it("verrät keine Schlüsselwerte, nur live/test", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_abc";
    const j = (await (await GET(req("stripe", TOKEN))).json()) as { data: Record<string, unknown> };
    expect(j.data.schluessel).toBe("test");
    expect(JSON.stringify(j)).not.toContain("sk_test_abc");
  });
});
