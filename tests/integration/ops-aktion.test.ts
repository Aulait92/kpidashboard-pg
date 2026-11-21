// Schreib-Schnittstelle für Claude (Ole, 21.11.2026)
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => {}), sendToUser: vi.fn(async () => {}), sendToBuyersOfCustomer: vi.fn(async () => {}) }));

import { prisma } from "@/lib/prisma";
import { GET, POST } from "@/app/api/ops/aktion/route";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const TOKEN = "a".repeat(40);
const req = (body?: unknown, token: string | null = TOKEN) =>
  new Request("http://x/api/ops/aktion", { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const ids: string[] = [];

describe("Ops-Aktionen", () => {
  beforeAll(() => {
    requireTestDb();
    process.env.OPS_ACTION_TOKEN = TOKEN;
    process.env.OPS_READ_TOKEN = "r".repeat(40);
  });
  afterAll(async () => {
    for (const id of ids) {
      await prisma.customerBudget.deleteMany({ where: { customerId: id } });
      await prisma.productBooking.deleteMany({ where: { customerId: id } });
      await cleanupCustomer(id);
    }
  });

  it("ohne, mit falschem oder mit dem Lese-Schlüssel: 403", async () => {
    expect((await GET(req(undefined, null))).status).toBe(403);
    expect((await POST(req({ aktion: "produkte_auflisten" }, "b".repeat(40)))).status).toBe(403);
    expect((await POST(req({ aktion: "produkte_auflisten" }, "r".repeat(40)))).status).toBe(403);
    const ok = await GET(req());
    expect(ok.status).toBe(200);
    expect(Object.keys((await ok.json()).aktionen)).toContain("produkt_anlegen");
  });

  it("unbekannte Aktion abgelehnt; Produkt anlegen, auflisten, starten; Audit mit Claude", async () => {
    expect((await POST(req({ aktion: "kunde_loeschen", customerId: "x" }))).status).toBe(400);
    const c = await makeCustomer();
    ids.push(c.id);
    const r = await POST(req({ aktion: "produkt_anlegen", customerId: c.id, product: "KFZ", dailyBudget: 40 }));
    expect(r.status).toBe(200);
    const liste = await (await POST(req({ aktion: "produkte_auflisten", customerId: c.id }))).json();
    expect(liste.daten[0]).toMatchObject({ product: "KFZ", status: "setup", dailyBudget: 40 });
    expect((await POST(req({ aktion: "produkt_starten", bookingId: liste.daten[0].id }))).status).toBe(200);
    expect(await prisma.customerBudget.count({ where: { customerId: c.id, product: "KFZ" } })).toBe(1);
    const log = await prisma.auditLog.findFirst({ where: { entityId: liste.daten[0].id, action: "produkt.admin_anlegen" } });
    expect(log?.actorEmail).toBe("ops-aktion (Claude)");
  });
});
