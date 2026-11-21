// /api/ops/kampagne (Ole, 21.11.2026): ohne Schlüssel verweigert, mit Schlüssel startet der Lauf (Fake) im Hintergrund,
// läuft schon einer: „läuft schon“ (nichts abbrechen).
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  start: vi.fn(),
  process: vi.fn(),
  after: vi.fn(),
  aktiv: null as null | { id: string; product: string; status: string },
}));

vi.mock("next/server", () => ({ after: (fn: () => unknown) => h.after(fn) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/kampagnen/run", () => ({ startCampaignRun: h.start, processCampaignRun: h.process }));
vi.mock("@/lib/budget", () => ({
  currentBudgets: async () => ({ lines: [{ product: "Kfz-Versicherung", dailyBudget: 20 }, { product: "Privatschutz", dailyBudget: 15 }], upcoming: [] }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === "cust1" ? { id: "cust1", name: "Agentur Muster" } : null),
      findMany: async () => [],
    },
    product: { findMany: async () => [] },
    campaignRun: {
      findFirst: async () => h.aktiv,
      findMany: async () => [],
    },
  },
}));

import { GET, POST } from "@/app/api/ops/kampagne/route";

const TOKEN = "t".repeat(40);
const req = (method: string, url: string, body?: unknown, token: string | null = TOKEN) =>
  new Request(`https://app.example.de${url}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { "x-ops-token": token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

beforeEach(() => {
  process.env.OPS_UPLOAD_TOKEN = TOKEN;
  h.start.mockReset();
  h.process.mockReset();
  h.after.mockReset();
  h.aktiv = null;
});

describe("/api/ops/kampagne", () => {
  it("verweigert ohne oder mit falschem Schlüssel", async () => {
    expect((await POST(req("POST", "/api/ops/kampagne", { kunde: "cust1", produkt: "kfz" }, null))).status).toBe(403);
    expect((await POST(req("POST", "/api/ops/kampagne", { kunde: "cust1", produkt: "kfz" }, "x".repeat(40)))).status).toBe(403);
    expect((await GET(req("GET", "/api/ops/kampagne?kunde=cust1", undefined, null))).status).toBe(403);
    expect(h.start).not.toHaveBeenCalled();
  });

  it("startet mit Schlüssel: Produkt aufgelöst, ops als Auslöser, Lauf im Hintergrund", async () => {
    h.start.mockResolvedValue({ ok: true, runId: "run1" });
    const res = await POST(req("POST", "/api/ops/kampagne", { kunde: "cust1", produkt: "kfz", wunsch: "Fokus Wechsler" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, runId: "run1", product: "Kfz-Versicherung" });
    expect(h.start).toHaveBeenCalledWith(expect.objectContaining({ customerId: "cust1", product: "Kfz-Versicherung", wish: "Fokus Wechsler", autoBuild: true, createdBy: "ops", trigger: "manuell", dailyBudgetEur: null }));
    expect(h.after).toHaveBeenCalledTimes(1);
    h.process.mockResolvedValue("built");
    await h.after.mock.calls[0][0]();
    expect(h.process).toHaveBeenCalledWith("run1");
  });

  it("Query-Parameter, autoBuild=false und Budget", async () => {
    h.start.mockResolvedValue({ ok: true, runId: "run2" });
    const res = await POST(req("POST", "/api/ops/kampagne?kunde=cust1&produkt=Privatschutz&autoBuild=false&budget=12,5"));
    expect(res.status).toBe(200);
    expect(h.start).toHaveBeenCalledWith(expect.objectContaining({ product: "Privatschutz", autoBuild: false, dailyBudgetEur: 12.5 }));
  });

  it("läuft schon ein Lauf: 409 „läuft schon“, kein neuer Start", async () => {
    h.aktiv = { id: "run0", product: "Privatschutz", status: "running" };
    const res = await POST(req("POST", "/api/ops/kampagne", { kunde: "cust1", produkt: "kfz" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "läuft schon", runId: "run0" });
    expect(h.start).not.toHaveBeenCalled();
  });

  it("fehlende Voraussetzungen kommen als problems zurück", async () => {
    h.start.mockResolvedValue({ ok: false, problems: [{ key: "booking", message: "Kalender nicht verbunden." }] });
    const res = await POST(req("POST", "/api/ops/kampagne", { kunde: "cust1", produkt: "privatschutz" }));
    expect(res.status).toBe(422);
    expect((await res.json()).problems[0].key).toBe("booking");
    expect(h.after).not.toHaveBeenCalled();
  });

  it("GET: Produkte mit Formular-Art und Läufe", async () => {
    const res = await GET(req("GET", "/api/ops/kampagne?kunde=cust1"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.produkte).toEqual([
      { product: "Kfz-Versicherung", dailyBudget: 20, formular: "kfz" },
      { product: "Privatschutz", dailyBudget: 15, formular: "privatschutz" },
    ]);
    expect(j.laeufe).toEqual([]);
  });
});
