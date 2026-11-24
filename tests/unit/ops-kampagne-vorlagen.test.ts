// /api/ops/kampagne mit vorlagenVon (Ole, 24.11.2026, gemeinsames Anzeigenlernen): Ein unbekannter Vorlagen-Kunde führt
// nicht mehr stillschweigend zu eigenen Vorlagen, sondern zu einer klaren Meldung. Hat der Kunde oder der Vorlagen-Kunde
// widersprochen, wird nichts gestartet.
import { beforeEach, describe, expect, it, vi } from "vitest";

const KUNDEN = [
  { id: "cust1", name: "Agentur Schwarzkopf" },
  { id: "cust2", name: "Allianz Agentur Lohmann" },
  { id: "cust3", name: "Lohmann & Söhne Finanz" },
];

const h = vi.hoisted(() => ({
  start: vi.fn(),
  process: vi.fn(),
  after: vi.fn(),
  audit: vi.fn(async () => undefined),
  gesperrt: [] as string[],
  sperreGefragt: [] as string[][],
}));

vi.mock("next/server", () => ({ after: (fn: () => unknown) => h.after(fn) }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/kampagnen/run", () => ({ startCampaignRun: h.start, processCampaignRun: h.process, buildCampaignRun: vi.fn() }));
vi.mock("@/lib/budget", () => ({ currentBudgets: async () => ({ lines: [{ product: "Kfz-Versicherung", dailyBudget: 20 }], upcoming: [] }) }));
vi.mock("@/lib/kampagnen/lern-sperre", async (original) => ({
  ...(await original<typeof import("@/lib/kampagnen/lern-sperre")>()),
  ausgenommeneUnter: async (ids: string[]) => {
    h.sperreGefragt.push(ids);
    return new Set(ids.filter((id) => h.gesperrt.includes(id)));
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: {
      findUnique: async ({ where }: { where: { id: string } }) => KUNDEN.find((k) => k.id === where.id) ?? null,
      findMany: async ({ where }: { where: { name: { contains: string } } }) => KUNDEN.filter((k) => k.name.toLowerCase().includes(where.name.contains.toLowerCase())),
    },
    product: { findMany: async () => [] },
    campaignRun: { findFirst: async () => null, findMany: async () => [] },
  },
}));

import { POST } from "@/app/api/ops/kampagne/route";

const TOKEN = "t".repeat(40);
const post = (body: unknown) =>
  POST(new Request("https://app.example.de/api/ops/kampagne", { method: "POST", headers: { "content-type": "application/json", "x-ops-token": TOKEN }, body: JSON.stringify(body) }));

beforeEach(() => {
  process.env.OPS_UPLOAD_TOKEN = TOKEN;
  h.start.mockReset();
  h.start.mockResolvedValue({ ok: true, runId: "run1" });
  h.process.mockReset();
  h.after.mockReset();
  h.audit.mockClear();
  h.gesperrt = [];
  h.sperreGefragt = [];
});

describe("/api/ops/kampagne: vorlagenVon", () => {
  it("unbekannter Vorlagen-Kunde: klare Meldung, nichts wird gestartet", async () => {
    const res = await post({ kunde: "cust1", produkt: "kfz", vorlagenVon: "gibt-es-nicht" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "vorlagenVon: Kunde nicht gefunden. Es wurde nichts gestartet." });
    expect(h.start).not.toHaveBeenCalled();
    expect(h.after).not.toHaveBeenCalled();
  });

  it("mehrdeutiger Name: klare Meldung mit den Treffern, nichts wird gestartet", async () => {
    const res = await post({ kunde: "cust1", produkt: "kfz", vorlagenVon: "Lohmann" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/^vorlagenVon: Mehrere Kunden passen: Allianz Agentur Lohmann \(cust2\), Lohmann & Söhne Finanz \(cust3\)\. Es wurde nichts gestartet\.$/);
    expect(h.start).not.toHaveBeenCalled();
  });

  it("gefundener Vorlagen-Kunde (ID oder eindeutiger Name): Start mit seiner Kunden-ID, Quelle im Audit-Log", async () => {
    const res = await post({ kunde: "cust1", produkt: "kfz", vorlagenVon: "cust2" });
    expect(res.status).toBe(200);
    expect(h.start).toHaveBeenCalledWith(expect.objectContaining({ customerId: "cust1", product: "Kfz-Versicherung", vorlagenVon: "cust2" }));
    expect(h.sperreGefragt).toEqual([["cust1", "cust2"]]);
    expect(h.audit).toHaveBeenCalledWith("kampagne.ops-start", expect.objectContaining({ entityId: "run1", customerId: "cust1", details: { product: "Kfz-Versicherung", via: "ops", vorlagenVon: "cust2" } }));
    // Die Antwort nennt den Vorlagen-Kunden nicht
    expect(JSON.stringify(await res.json())).not.toMatch(/Lohmann|cust2/);

    h.start.mockClear();
    await post({ kunde: "cust1", produkt: "kfz", vorlagenVon: "Söhne" });
    expect(h.start).toHaveBeenCalledWith(expect.objectContaining({ vorlagenVon: "cust3" }));
  });

  it("ohne vorlagenVon bzw. mit dem Kunden selbst: eigene Vorlagen wie bisher, keine Abfrage der Sperre", async () => {
    await post({ kunde: "cust1", produkt: "kfz" });
    expect(h.start).toHaveBeenCalledWith(expect.objectContaining({ vorlagenVon: null }));
    await post({ kunde: "cust1", produkt: "kfz", vorlagenVon: "cust1" });
    expect(h.start).toHaveBeenLastCalledWith(expect.objectContaining({ vorlagenVon: null }));
    await post({ kunde: "cust1", produkt: "kfz", vorlagenVon: "  " });
    expect(h.start).toHaveBeenCalledTimes(3);
    expect(h.sperreGefragt).toEqual([]);
    expect(h.audit).toHaveBeenLastCalledWith("kampagne.ops-start", expect.objectContaining({ details: { product: "Kfz-Versicherung", via: "ops" } }));
  });

  const WIDERSPRUCH: [string, string[], RegExp][] = [
    ["der Vorlagen-Kunde", ["cust2"], /Der Kunde, dessen Anzeigen als Muster dienen sollen, ist vom gemeinsamen Anzeigenlernen ausgenommen/],
    ["der Kunde selbst", ["cust1"], /Dieser Kunde ist vom gemeinsamen Anzeigenlernen ausgenommen/],
    ["beide", ["cust1", "cust2"], /Beide Kunden sind vom gemeinsamen Anzeigenlernen ausgenommen/],
  ];
  it.each(WIDERSPRUCH)("Widerspruch (%s): abgelehnt mit klarer Meldung, nichts wird gestartet", async (_wer, gesperrt, meldung) => {
    h.gesperrt = gesperrt;
    const res = await post({ kunde: "cust1", produkt: "kfz", vorlagenVon: "cust2" });
    expect(res.status).toBe(422);
    const j = await res.json();
    expect(j.ok).toBe(false);
    expect(j.error).toMatch(meldung);
    expect(j.error).toMatch(/Bitte ohne vorlagenVon starten\.$/);
    expect(j.problems).toEqual([{ key: "lernSperre", message: j.error }]);
    expect(h.start).not.toHaveBeenCalled();
    expect(h.after).not.toHaveBeenCalled();
  });
});
