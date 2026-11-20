import { beforeEach, describe, expect, it, vi } from "vitest";

// Löschfrist für verworfene Pay-per-Lead-Leads (Ole, 20.11.2026): Kontaktdaten 30 Tage nach Eingang löschen,
// Auswertungsfelder bleiben, ausgelieferte Leads nie.

type Pool = {
  id: string;
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
  productKey: string;
};

const db = vi.hoisted(() => ({ pool: [] as Pool[], audits: [] as unknown[][] }));

type Field = "name" | "phone" | "email" | "answers";
type Where = {
  id?: { in: string[] };
  status?: { in: string[] };
  leadId?: null;
  createdAt?: { lte: Date };
  OR?: Partial<Record<Field, { not: unknown }>>[];
};
const filled = (v: unknown) => v !== null && v !== undefined;
const matches = (p: Pool, w: Where) =>
  (!w.id || w.id.in.includes(p.id)) &&
  (!w.status || w.status.in.includes(p.status)) &&
  (w.leadId === undefined || p.leadId === w.leadId) &&
  (!w.createdAt || p.createdAt <= w.createdAt.lte) &&
  (!w.OR || w.OR.some((c) => Object.keys(c).some((k) => filled(p[k as Field]))));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    poolLead: {
      findMany: async ({ where }: { where: Where }) => db.pool.filter((p) => matches(p, where)).map((p) => ({ id: p.id })),
      updateMany: async ({ where, data }: { where: Where; data: Partial<Pool> }) => {
        const hit = db.pool.filter((p) => matches(p, where));
        for (const p of hit) Object.assign(p, Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === "object" && v !== null ? null : v])));
        return { count: hit.length };
      },
    },
  },
}));
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => {}) }));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: async (...a: unknown[]) => void db.audits.push(a) }));

import { DUPLICATE_DAYS, expireDiscarded } from "@/lib/ppl/engine";
import { discardDeleteDays, discardDue } from "@/lib/ppl/loeschfrist";

const D = 86_400_000;
const now = new Date("2026-11-20T12:00:00Z");
const pool = (id: string, daysAgo: number, extra: Partial<Pool> = {}): Pool => ({
  id,
  status: "invalid",
  reason: "Telefonnummer: ungültige Rufnummer",
  createdAt: new Date(now.getTime() - daysAgo * D),
  leadId: null,
  name: "Max Muster",
  phone: "4915112345678",
  email: "max@example.de",
  answers: [{ label: "Beitrag", value: "600" }],
  plz: "20095",
  insurer: "Allianz",
  contribution: 600,
  productKey: "PKV",
  ...extra,
});
const get = (id: string) => db.pool.find((p) => p.id === id)!;

beforeEach(() => {
  db.pool = [];
  db.audits = [];
});

describe("Löschfrist (Helfer)", () => {
  it("30 Tage Standard, per Env änderbar, ungültige Werte fallen auf 30 zurück", () => {
    expect(discardDeleteDays(undefined)).toBe(30);
    expect(discardDeleteDays("45")).toBe(45);
    expect(discardDeleteDays("abc")).toBe(30);
    expect(discardDeleteDays("0")).toBe(30);
  });
  it("Standard nicht kürzer als das Dubletten-Fenster", () => {
    expect(discardDeleteDays(undefined)).toBeGreaterThanOrEqual(DUPLICATE_DAYS);
  });
  it("29 Tage bleibt, 31 Tage fällig, ausgeliefert und geparkt nie", () => {
    const at = (d: number) => new Date(now.getTime() - d * D);
    expect(discardDue({ status: "invalid", leadId: null, createdAt: at(29) }, now, 30)).toBe(false);
    expect(discardDue({ status: "invalid", leadId: null, createdAt: at(31) }, now, 30)).toBe(true);
    expect(discardDue({ status: "duplicate", leadId: null, createdAt: at(31) }, now, 30)).toBe(true);
    expect(discardDue({ status: "delivered", leadId: "l1", createdAt: at(400) }, now, 30)).toBe(false);
    expect(discardDue({ status: "delivered", leadId: null, createdAt: at(400) }, now, 30)).toBe(false);
    expect(discardDue({ status: "parked", leadId: null, createdAt: at(31) }, now, 30)).toBe(false);
  });
});

describe("Löschjob expireDiscarded", () => {
  it("29 Tage bleibt, 31 Tage gelöscht (ungültig, Dublette, von Hand verworfen), Auswertungsfelder bleiben", async () => {
    db.pool.push(
      pool("jung", 29),
      pool("alt", 31),
      pool("dublette", 31, { status: "duplicate", reason: "schon am 12.10.2026" }),
      pool("admin", 31, { reason: "verworfen (Admin)" }),
    );
    expect(await expireDiscarded(now)).toBe(3);
    expect(get("jung")).toMatchObject({ name: "Max Muster", phone: "4915112345678", email: "max@example.de" });
    for (const id of ["alt", "dublette", "admin"]) {
      expect(get(id)).toMatchObject({ name: null, phone: null, email: null, answers: null, plz: "20095", insurer: "Allianz", contribution: 600, productKey: "PKV" });
    }
    expect(get("dublette")).toMatchObject({ status: "duplicate", reason: "schon am 12.10.2026" });
    expect(get("admin")).toMatchObject({ status: "invalid", reason: "verworfen (Admin)" });
    expect(db.audits).toHaveLength(1);
    const [action, opts] = db.audits[0] as [string, { details: Record<string, unknown> }];
    expect(action).toBe("ppl.discarded_erased");
    expect(Object.keys(opts.details).sort()).toEqual(["count", "ids", "tage"]);
    expect(JSON.stringify(opts)).not.toMatch(/Muster|4915|example/);
  });

  it("ausgelieferte und geparkte Leads nie betroffen, auch sehr alte", async () => {
    db.pool.push(
      pool("geliefert", 400, { status: "delivered", leadId: "l1", reason: null }),
      pool("airtable", 400, { status: "delivered" }),
      pool("geparkt", 31, { status: "parked" }),
    );
    expect(await expireDiscarded(now)).toBe(0);
    for (const id of ["geliefert", "airtable", "geparkt"]) expect(get(id).phone).toBe("4915112345678");
    expect(db.audits).toHaveLength(0);
  });

  it("schon gelöschte Zeilen werden übersprungen (kein zweiter Audit-Eintrag)", async () => {
    db.pool.push(pool("alt", 31));
    expect(await expireDiscarded(now)).toBe(1);
    expect(await expireDiscarded(new Date(now.getTime() + D))).toBe(0);
    expect(db.audits).toHaveLength(1);
  });
});
