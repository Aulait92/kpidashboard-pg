// „3 aktive Verkäufer inklusive“ (Ole, 14.11.2026) und Seat-Billing-Fehler:
// Zählung (bekommt Leads / heute Leads bekommen), Stripe-Menge tagesgenau, geplanter Abo-Start,
// Admin-Aufgabe „Platz von Hand abrechnen“ ohne Duplikate, nie mehr als nach der alten Regel.
// Stripe ist gemockt (kein Netz).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Item = { id: string; quantity: number; price: { product: string; unit_amount: number; recurring: { interval: string } } };
type Phase = { start_date: number; end_date: number; items: { price: unknown; quantity: number }[]; metadata?: Record<string, string> };
const stripeState = vi.hoisted(() => ({
  sub: null as null | { id: string; status: string; schedule: null; items: { data: Item[] } },
  schedule: null as null | { id: string; status: string; phases: Phase[] },
  scheduleUpdates: [] as { phases: { items: { quantity: number; price?: string; price_data?: { product: string; unit_amount: number } }[] }[]; proration_behavior: string }[],
  calls: [] as { method: string; args: unknown[] }[],
}));

vi.mock("stripe", () => {
  const s = stripeState;
  const log = (method: string) => (...args: unknown[]) => {
    s.calls.push({ method, args });
  };
  class FakeStripe {
    products = {
      search: async () => ({ data: [] }),
      create: async (p: { metadata: { pg_key: string } }) => ({ id: `prod_${p.metadata.pg_key}` }),
    };
    tax = { registrations: { list: async () => ({ data: [{ id: "taxreg_1" }] }) } };
    subscriptionSchedules = {
      list: async () => ({ data: s.schedule ? [s.schedule] : [] }),
      retrieve: async () => s.schedule,
      update: async (_id: string, p: (typeof s.scheduleUpdates)[number]) => {
        s.scheduleUpdates.push(p);
        return {};
      },
    };
    subscriptions = { list: async () => ({ data: s.sub ? [s.sub] : [] }) };
    subscriptionItems = {
      create: async (p: { quantity: number; price_data: { product: string; unit_amount: number; recurring: { interval: string } } }) => {
        log("subscriptionItems.create")(p);
        s.sub?.items.data.push({ id: `si_${s.sub.items.data.length + 1}`, quantity: p.quantity, price: { ...p.price_data } });
        return {};
      },
      update: async (id: string, p: { quantity: number }) => {
        log("subscriptionItems.update")(id, p);
        const it = s.sub?.items.data.find((i) => i.id === id);
        if (it) it.quantity = p.quantity;
        return {};
      },
      del: async (id: string) => {
        log("subscriptionItems.del")(id);
        return {};
      },
    };
  }
  return { default: FakeStripe };
});
vi.mock("@/lib/push", () => ({ sendToAdmins: async () => ({}), sendToUser: async () => ({}), sendToBuyersOfCustomer: async () => ({}) }));

import { prisma } from "@/lib/prisma";
import { syncSeatBilling } from "@/lib/billing";
import { markLeadReceived, MANUAL_SEAT_TASK, seatUsage } from "@/lib/seats-server";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const activeSub = () => ({
  id: `sub_${uid()}`,
  status: "active",
  schedule: null,
  items: { data: [{ id: "si_sw", quantity: 1, price: { product: "prod_software", unit_amount: 34900, recurring: { interval: "month" } } }] as Item[] },
});
const seatQty = () => stripeState.sub?.items.data.find((i) => i.price.product === "prod_seat")?.quantity ?? 0;
const tasksOf = (customerId: string) => prisma.salesTask.findMany({ where: { title: { startsWith: MANUAL_SEAT_TASK }, note: { contains: `Kunden-ID ${customerId}` } } });

describe("Plätze: 3 aktive Verkäufer inklusive", () => {
  const customers: string[] = [];
  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    for (const id of customers) {
      await prisma.salesTask.deleteMany({ where: { note: { contains: `Kunden-ID ${id}` } } });
      await prisma.user.deleteMany({ where: { customerId: id } });
      await cleanupCustomer(id);
    }
  });
  beforeEach(() => {
    stripeState.sub = null;
    stripeState.schedule = null;
    stripeState.scheduleUpdates = [];
    stripeState.calls = [];
  });
  const customer = async (extra: Record<string, unknown> = {}) => {
    const c = await makeCustomer({ stripeCustomerId: `cus_${uid()}`, seatsIncluded: 3, seatMonthly: 49, seatsBilled: 0, ...extra });
    customers.push(c.id);
    return c;
  };

  it("Oles Fall: Inhaber ohne Leads + 3 Berater mit Leads = 3 aktive, kein Aufpreis", async () => {
    const c = await customer();
    stripeState.sub = activeSub();
    await makeBuyer(c.id, "owner", false);
    for (let i = 0; i < 3; i++) await makeBuyer(c.id, "advisor");
    expect(await seatUsage(c.id)).toEqual({ logins: 4, active: 3 });
    expect(await syncSeatBilling(c.id)).toEqual({ ok: true, changed: false });
    expect(stripeState.calls).toHaveLength(0);
  });

  it("4. aktiver Verkäufer → Menge 1 (tagesgenau), Ausschalten ohne Lead heute → 0, mit Lead heute bleibt 1", async () => {
    const c = await customer();
    stripeState.sub = activeSub();
    await makeBuyer(c.id, "owner");
    await makeBuyer(c.id, "advisor");
    await makeBuyer(c.id, "advisor");
    const fourth = await makeBuyer(c.id, "advisor");
    expect(await syncSeatBilling(c.id)).toEqual({ ok: true, changed: true });
    const created = stripeState.calls.find((x) => x.method === "subscriptionItems.create")!.args[0];
    expect(created).toMatchObject({ quantity: 1, proration_behavior: "create_prorations", price_data: { product: "prod_seat", unit_amount: 4900 } });

    // Heute schon einen Lead bekommen: zählt beim Ausschalten bis zum Tagesende weiter
    await markLeadReceived(fourth.id);
    await prisma.user.update({ where: { id: fourth.id }, data: { receivesLeads: false } });
    expect(await syncSeatBilling(c.id)).toEqual({ ok: true, changed: false });
    expect(seatQty()).toBe(1);

    // Nächster Tag (täglicher Abgleich): ohne Lead heute → Menge 0
    const tomorrow = new Date(Date.now() + 36 * 3600_000);
    await syncSeatBilling(c.id, { now: tomorrow });
    expect(seatQty()).toBe(0);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).seatsBilled).toBe(0);
  });

  it("Zuteilen von Hand an ein Mitglied mit „aus“ macht es heute aktiv", async () => {
    const c = await customer();
    stripeState.sub = activeSub();
    for (let i = 0; i < 3; i++) await makeBuyer(c.id, i ? "advisor" : "owner");
    const assistant = await makeBuyer(c.id, "advisor", false);
    expect((await seatUsage(c.id)).active).toBe(3);
    await markLeadReceived(assistant.id);
    expect((await seatUsage(c.id)).active).toBe(4);
    await syncSeatBilling(c.id);
    expect(seatQty()).toBe(1);
  });

  it("Geplanter Abo-Start: Plätze kommen in alle Phasen des Zeitplans (Fehler vom 14.11.)", async () => {
    const c = await customer();
    const start = Math.floor(Date.now() / 1000) + 10 * 86400;
    stripeState.schedule = {
      id: "sub_sched_1",
      status: "not_started",
      phases: [
        { start_date: start, end_date: start + 30 * 86400, items: [{ price: { id: "price_intro", product: "prod_software", recurring: { interval: "month" } }, quantity: 1 }] },
        { start_date: start + 30 * 86400, end_date: start + 365 * 86400, items: [{ price: { id: "price_sw", product: "prod_software", recurring: { interval: "month" } }, quantity: 1 }] },
      ],
    };
    for (let i = 0; i < 4; i++) await makeBuyer(c.id, i ? "advisor" : "owner");
    const r = await syncSeatBilling(c.id);
    expect(r).toMatchObject({ ok: true, changed: true });
    expect(r.ok && r.note).toMatch(/Berechnet ab Abo-Start am/);
    const upd = stripeState.scheduleUpdates[0];
    expect(upd.proration_behavior).toBe("none");
    for (const ph of upd.phases) {
      expect(ph.items.find((i) => i.price_data?.product === "prod_seat")).toMatchObject({ quantity: 1, price_data: { unit_amount: 4900 } });
    }
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).seatsBilled).toBe(1);
    expect(await tasksOf(c.id)).toHaveLength(0);
  });

  it("Kein Abo und kein geplanter Start: Admin-Aufgabe statt still nichts, keine Duplikate", async () => {
    const c = await customer();
    for (let i = 0; i < 4; i++) await makeBuyer(c.id, i ? "advisor" : "owner");
    const r = await syncSeatBilling(c.id);
    expect(r).toMatchObject({ ok: true, changed: false });
    expect(r.ok && r.note).toMatch(/Platz von Hand abrechnen/);
    // Menge bleibt offen, der tägliche Abgleich versucht es weiter, ohne zweite Aufgabe
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).seatsBilled).toBe(0);
    await syncSeatBilling(c.id);
    await syncSeatBilling(c.id, { now: new Date(Date.now() + 86400_000) });
    const tasks = await tasksOf(c.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toMatch(/\(1 weiterer Verkäufer\)$/);
    expect(tasks[0].note).toMatch(/bisher 0, jetzt 1/);
    // 5. aktiver Verkäufer: dieselbe offene Aufgabe wird aktualisiert
    await makeBuyer(c.id, "advisor");
    await syncSeatBilling(c.id);
    const again = await tasksOf(c.id);
    expect(again).toHaveLength(1);
    expect(again[0].title).toMatch(/\(2 weitere Verkäufer\)$/);
  });

  it("Ohne Stripe-Kunde: Menge in der Datenbank und Aufgabe „Platz von Hand abrechnen“", async () => {
    const c = await customer({ stripeCustomerId: null });
    for (let i = 0; i < 4; i++) await makeBuyer(c.id, i ? "advisor" : "owner");
    const r = await syncSeatBilling(c.id);
    expect(r).toMatchObject({ ok: true, changed: true });
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).seatsBilled).toBe(1);
    expect(await tasksOf(c.id)).toHaveLength(1);
    // unverändert → keine weitere Aufgabe
    expect(await syncSeatBilling(c.id)).toEqual({ ok: true, changed: false });
    expect(await tasksOf(c.id)).toHaveLength(1);
  });

  it("Täglicher Abgleich erhöht nie über die alte Regel und senkt ab sofort", async () => {
    // Altbestand: 5 Logins, alle berechnet (2), davon 2 ohne Leads → neu 0
    const c = await customer({ seatsBilled: 2 });
    stripeState.sub = activeSub();
    stripeState.sub.items.data.push({ id: "si_seat", quantity: 2, price: { product: "prod_seat", unit_amount: 4900, recurring: { interval: "month" } } });
    await makeBuyer(c.id, "owner", false);
    await makeBuyer(c.id, "advisor", false);
    for (let i = 0; i < 3; i++) await makeBuyer(c.id, "advisor");
    // wie der tägliche Abgleich (reconcileSeatBilling ruft syncSeatBilling je Kunde)
    await syncSeatBilling(c.id);
    expect(seatQty()).toBe(0);
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.seatsBilled).toBe(0);
    const log = await prisma.auditLog.findFirst({ where: { customerId: c.id, action: "billing.seats" }, orderBy: { at: "desc" } });
    expect(log?.details).toMatchObject({ from: 2, to: 0, logins: 5, active: 3 });
  });
});
