import { beforeEach, describe, expect, it, vi } from "vitest";

// Parkfrist für Pay-per-Lead (Ole, 20.11.2026): geparkte Leads nur bis 48 h ab Eingang verteilen, danach verwerfen.

type Pool = {
  id: string;
  productKey: string;
  status: string;
  reason: string | null;
  createdAt: Date;
  leadId: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  answers: unknown;
  plz: string | null;
  insurer: string | null;
  contribution: number | null;
  civilServant: boolean;
  smsVerified: boolean;
  score: number | null;
  adInfo: unknown;
  deliveredAt?: Date | null;
  areaId?: string | null;
};

const db = vi.hoisted(() => ({ pool: [] as Pool[], leads: [] as { id: string }[], revenue: [] as unknown[], audits: [] as unknown[] }));

type Where = { id?: string | { in: string[] }; status?: string; leadId?: null; productKey?: string; createdAt?: { gt?: Date; lte?: Date } };
const matches = (p: Pool, w: Where) =>
  (w.id === undefined || (typeof w.id === "string" ? p.id === w.id : w.id.in.includes(p.id))) &&
  (w.status === undefined || p.status === w.status) &&
  (w.leadId === undefined || p.leadId === w.leadId) &&
  (w.productKey === undefined || p.productKey === w.productKey) &&
  (!w.createdAt?.gt || p.createdAt > w.createdAt.gt) &&
  (!w.createdAt?.lte || p.createdAt <= w.createdAt.lte);

vi.mock("@/lib/prisma", () => {
  const poolLead = {
    findMany: async ({ where }: { where: Where }) => db.pool.filter((p) => matches(p, where)),
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const p = db.pool.find((x) => x.id === where.id);
      if (!p) throw new Error("nicht gefunden");
      return { ...p };
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Pool> }) => Object.assign(db.pool.find((x) => x.id === where.id)!, data),
    updateMany: async ({ where, data }: { where: Where; data: Partial<Pool> }) => {
      const hit = db.pool.filter((p) => matches(p, where));
      for (const p of hit) Object.assign(p, Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === "object" && v !== null && !(v instanceof Date) ? null : v])));
      return { count: hit.length };
    },
    count: async () => 0,
  };
  const sub = {
    id: "sub1",
    customerId: "c1",
    productKey: "PKV",
    active: true,
    startDate: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    status: "live",
    testQuantity: null,
    testDays: null,
    period: "once",
    goal: 100,
    price: 40,
    delivery: "app",
    plzRanges: null,
    weakThreshold: null,
    onlyWeak: false,
    acceptWeak: true,
    acceptCivilServants: true,
    scoreFloor: null,
    insurerInclude: [],
    insurerExclude: [],
    excludeRules: null,
    areas: [],
  };
  const client = {
    poolLead,
    leadSubscription: { findMany: async () => [sub] },
    lead: {
      count: async () => 0,
      create: async () => {
        const l = { id: `lead${db.leads.length + 1}` };
        db.leads.push(l);
        return l;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        db.leads = db.leads.filter((l) => l.id !== where.id);
      },
    },
    revenue: { create: async (a: unknown) => db.revenue.push(a) },
    auditLog: { create: async (a: unknown) => db.audits.push(a) },
  };
  const $transaction = async (fn: (tx: typeof client) => Promise<unknown>) => fn(client);
  return { prisma: { ...client, $transaction } };
});
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => {}) }));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/ppl/delivery", () => ({ sendDelivery: vi.fn(async () => ({ ok: true, channel: "app", label: "Kundenbereich", targets: [] })) }));
vi.mock("@/lib/ppl/slack", () => ({ notifyPplSlack: vi.fn(async () => {}) }));
vi.mock("@/lib/ppl/kontingent-voll", () => ({ pruefeKontingentVoll: vi.fn(async () => {}) }));
vi.mock("@/lib/audit", () => ({ audit: async (...a: unknown[]) => void db.audits.push(a) }));

import { assertDeliverable, deliver, expireParked, NotDeliverableError, redistributeParked } from "@/lib/ppl/engine";
import { parkDeadline, parkDeadlineHint, parkExpired, parkMaxHours } from "@/lib/ppl/parken";
import { rejectCategory } from "@/lib/ppl/auswertung";

const H = 3_600_000;
const now = new Date("2026-11-20T12:00:00Z");
const pool = (id: string, hoursAgo: number, extra: Partial<Pool> = {}): Pool => ({
  id,
  productKey: "PKV",
  status: "parked",
  reason: "alle Kontingente voll",
  createdAt: new Date(now.getTime() - hoursAgo * H),
  leadId: null,
  name: "Max Muster",
  phone: "4915112345678",
  email: "max@example.de",
  answers: [{ label: "Beitrag", value: "600" }],
  plz: "20095",
  insurer: "Allianz",
  contribution: 600,
  civilServant: false,
  smsVerified: false,
  score: null,
  adInfo: null,
  ...extra,
});

beforeEach(() => {
  db.pool = [];
  db.leads = [];
  db.revenue = [];
  db.audits = [];
});

describe("Parkfrist (Helfer)", () => {
  it("48 h Standard, per Env änderbar, ungültige Werte fallen auf 48 zurück", () => {
    expect(parkMaxHours(undefined)).toBe(48);
    expect(parkMaxHours("24")).toBe(24);
    expect(parkMaxHours("abc")).toBe(48);
    expect(parkMaxHours("0")).toBe(48);
  });
  it("47 h nicht abgelaufen, 48 h und 49 h abgelaufen", () => {
    expect(parkExpired(new Date(now.getTime() - 47 * H), now, 48)).toBe(false);
    expect(parkExpired(new Date(now.getTime() - 48 * H), now, 48)).toBe(true);
    expect(parkExpired(new Date(now.getTime() - 49 * H), now, 48)).toBe(true);
  });
  it("Hinweis nennt das Verfallsdatum in Berliner Zeit", () => {
    const created = new Date("2026-11-20T13:05:00Z");
    expect(parkDeadline(created, 48).toISOString()).toBe("2026-11-22T13:05:00.000Z");
    expect(parkDeadlineHint(created, 48)).toBe("wird am 22.11. um 14:05 Uhr verworfen, wenn kein Bezug frei wird");
  });
  it("Auswertung: verfallene Leads als eigene Kategorie", () => {
    expect(rejectCategory("expired", "verworfen (geparkt > 48 h)")).toBe("verfallen");
  });
});

describe("Neu verteilen nur innerhalb der Frist", () => {
  it("47 h alt wird verteilt, 49 h alt nicht", async () => {
    db.pool.push(pool("jung", 47), pool("alt", 49));
    const n = await redistributeParked(undefined, now);
    expect(n).toBe(1);
    expect(db.pool.find((p) => p.id === "jung")!.status).toBe("delivered");
    expect(db.pool.find((p) => p.id === "alt")!.status).toBe("parked");
    expect(db.leads).toHaveLength(1);
  });
});

describe("Verfallsjob", () => {
  it("setzt ab 48 h den Endstatus, entfernt Kontaktdaten und lässt jüngere geparkt", async () => {
    db.pool.push(pool("alt", 49), pool("jung", 47), pool("geliefert", 60, { status: "delivered", leadId: "x" }));
    expect(await expireParked(now)).toBe(1);
    const alt = db.pool.find((p) => p.id === "alt")!;
    expect(alt).toMatchObject({ status: "expired", reason: "verworfen (geparkt > 48 h)", name: null, phone: null, email: null, answers: null });
    expect(alt.plz).toBe("20095");
    expect(db.pool.find((p) => p.id === "jung")!.status).toBe("parked");
    expect(db.pool.find((p) => p.id === "geliefert")!.status).toBe("delivered");
    expect(db.audits).toHaveLength(1);
  });

  it("nach dem Verfall keine Auslieferung mehr (Neuverteilung und Admin-Auslieferung)", async () => {
    db.pool.push(pool("alt", 49));
    await expireParked(now);
    expect(await redistributeParked(undefined, new Date(now.getTime() + H))).toBe(0);
    const sub = { id: "sub1", customerId: "c1", price: 40, delivery: "app" } as unknown as Parameters<typeof deliver>[1];
    await expect(deliver("alt", sub, null, now)).rejects.toBeInstanceOf(NotDeliverableError);
    expect(db.leads).toHaveLength(0);
    expect(db.revenue).toHaveLength(0);
  });

  it("Sperre greift schon vor dem Verfallsjob, wenn die Frist abgelaufen ist", () => {
    expect(() => assertDeliverable({ status: "parked", createdAt: new Date(now.getTime() - 49 * H) }, now)).toThrow(NotDeliverableError);
    expect(() => assertDeliverable({ status: "expired", createdAt: new Date(now.getTime() - 49 * H) }, now)).toThrow(/verfallen/);
    expect(() => assertDeliverable({ status: "parked", createdAt: new Date(now.getTime() - 47 * H) }, now)).not.toThrow();
  });
});
