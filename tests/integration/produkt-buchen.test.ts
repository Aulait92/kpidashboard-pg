// Weiteres Produkt selbst buchen: Einrichtung genau einmal auf der nächsten Rechnung,
// Monatspreis erst beim Start (Stripe gemockt), Stufenwechsel erkannt, individuelle
// Konditionen → Aufgabe, Ablehnung nimmt die Einrichtung zurück, ausgeschaltete
// Produkte sind nicht buchbar, Beenden nur als Anfrage.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Item = { id: string; quantity: number; current_period_end?: number; price: { product: string; unit_amount: number; recurring: { interval: string } } };
const stripeState = vi.hoisted(() => ({
  sub: null as null | { id: string; status: string; schedule: null; items: { data: Item[] } },
  calls: [] as { method: string; args: unknown[] }[],
  invoiceItems: new Map<string, { id: string; invoice: string | null; key: string }>(),
}));

vi.mock("stripe", () => {
  const s = stripeState;
  class FakeStripe {
    products = {
      search: async () => ({ data: [] }),
      create: async (p: { metadata: { pg_key: string } }) => ({ id: `prod_${p.metadata.pg_key}` }),
    };
    tax = { registrations: { list: async () => ({ data: [{ id: "taxreg_1" }] }) } };
    subscriptions = { list: async () => ({ data: s.sub ? [s.sub] : [] }) };
    invoices = { retrieve: async (id: string) => ({ id, status: "paid" }) };
    invoiceItems = {
      create: async (p: unknown, opts: { idempotencyKey: string }) => {
        s.calls.push({ method: "invoiceItem.create", args: [p, opts] });
        // Idempotenz wie bei Stripe: gleicher Schlüssel → gleiche Position
        const found = [...s.invoiceItems.values()].find((i) => i.key === opts.idempotencyKey);
        if (found) return { id: found.id };
        const id = `ii_${s.invoiceItems.size + 1}`;
        s.invoiceItems.set(id, { id, invoice: null, key: opts.idempotencyKey });
        return { id };
      },
      retrieve: async (id: string) => {
        const it = s.invoiceItems.get(id);
        if (!it) throw Object.assign(new Error("missing"), { code: "resource_missing" });
        return it;
      },
      del: async (id: string) => {
        s.calls.push({ method: "invoiceItem.del", args: [id] });
        s.invoiceItems.delete(id);
        return { id, deleted: true };
      },
    };
    subscriptionItems = {
      create: async (...args: unknown[]) => {
        s.calls.push({ method: "create", args });
        return {};
      },
      update: async (id: string, p: { price_data: { unit_amount: number } }, opts: unknown) => {
        s.calls.push({ method: "update", args: [id, p, opts] });
        const it = s.sub?.items.data.find((i) => i.id === id);
        if (it) it.price.unit_amount = p.price_data.unit_amount;
        return {};
      },
      del: async (...args: unknown[]) => {
        s.calls.push({ method: "del", args });
        return {};
      },
    };
  }
  return { default: FakeStripe };
});

import { prisma } from "@/lib/prisma";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { currentBudgets } from "@/lib/budget";
import { bookProduct, productOverview, rejectProduct, requestProductEnd, saveCatalogItem, startProduct } from "@/lib/produkt-buchen";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const [t1, t2] = PRICE_LIST.tiers;
const periodEnd = Math.floor(new Date("2026-12-01T00:00:00Z").getTime() / 1000);
const NOW = new Date("2026-11-12T10:00:00Z");
const TKV = "Katzenversicherung (TKV)";

async function setup(extra: { retainer?: number; interval?: string; daily?: number; stripe?: boolean } = {}) {
  const n = uid();
  const c = await makeCustomer({
    plan: "software",
    retainerMonthly: extra.retainer ?? t1.monthly,
    billingInterval: extra.interval ?? "month",
    stripeCustomerId: extra.stripe === false ? null : `cus_p_${n}`,
  });
  await makeBuyer(c.id, "owner");
  const offer = await prisma.offer.create({
    data: {
      number: `PB-${n}`,
      token: `pb-${n}`,
      contactName: "Produkt Test",
      term: "12m",
      products: [{ name: TKV, dailyBudget: extra.daily ?? 30 }],
      status: "accepted",
      setupFee: 990,
      monthlyFee: extra.retainer ?? t1.monthly,
      softwareFee: 349,
      validUntil: new Date("2026-12-31"),
    },
  });
  await prisma.onboarding.create({ data: { customerId: c.id, offerId: offer.id } });
  return { customerId: c.id, offerId: offer.id };
}

describe("Weiteres Produkt buchen", () => {
  const customers: string[] = [];
  const offers: string[] = [];
  const track = (r: { customerId: string; offerId: string }) => (customers.push(r.customerId), offers.push(r.offerId), r);

  beforeAll(async () => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    // Die Stripe-Pfade der Einrichtung mit einer Gebühr testen (live ist sie 0 €, siehe Test unten)
    (PRICE_LIST as { extraProductSetupSelfService: number }).extraProductSetupSelfService = PRICE_LIST.extraProductSetup;
    await saveCatalogItem("privatschutz", { enabled: true, proven: false, benefit: "Test" });
    await saveCatalogItem("unfall", { enabled: false, proven: false, benefit: "Test" });
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    (PRICE_LIST as { extraProductSetupSelfService: number }).extraProductSetupSelfService = 0;
    await prisma.productCatalogItem.deleteMany({ where: { key: { in: ["privatschutz", "unfall"] } } });
    for (const id of customers) {
      const name = (await prisma.customer.findUnique({ where: { id }, select: { name: true } }))?.name;
      if (name) await prisma.salesTask.deleteMany({ where: { title: { contains: name } } });
      await cleanupCustomer(id);
    }
    await prisma.offer.deleteMany({ where: { id: { in: offers } } });
  });
  beforeEach(() => {
    stripeState.calls = [];
    stripeState.invoiceItems.clear();
    stripeState.sub = {
      id: "sub_1",
      status: "active",
      schedule: null,
      items: {
        data: [
          { id: "si_sw", quantity: 1, current_period_end: periodEnd, price: { product: "prod_software", unit_amount: 34900, recurring: { interval: "month" } } },
          { id: "si_sv", quantity: 1, current_period_end: periodEnd, price: { product: "prod_service", unit_amount: (t1.monthly - 349) * 100, recurring: { interval: "month" } } },
        ],
      },
    };
  });

  it("zeigt gebuchte und buchbare Produkte (Katze schon gebucht, Unfall ausgeschaltet)", async () => {
    const { customerId } = track(await setup());
    const o = await productOverview(customerId, NOW);
    expect(o.booked.map((b) => b.name)).toEqual([TKV]);
    const keys = o.bookable.map((b) => b.key);
    expect(keys).toContain("privatschutz");
    expect(keys).not.toContain("tkv-katze");
    expect(keys).not.toContain("unfall");
  });

  it("Einrichtung kostenlos (0 €): keine Stripe-Position, keine Aufgabe „Preis prüfen“", async () => {
    const P = PRICE_LIST as { extraProductSetupSelfService: number };
    const before = P.extraProductSetupSelfService;
    P.extraProductSetupSelfService = 0;
    try {
      const { customerId } = track(await setup());
      const r = await bookProduct({ customerId, userId: null, catalogKey: "privatschutz", dailyBudget: 30, startDate: null, acknowledged: true }, NOW);
      expect(r).toMatchObject({ ok: true, status: "setup" });
      expect(stripeState.calls.filter((c) => c.method === "invoiceItem.create")).toHaveLength(0);
      const name = (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).name;
      expect(await prisma.salesTask.count({ where: { title: { startsWith: "Preis prüfen" }, AND: { title: { contains: name } } } })).toBe(0);
    } finally {
      P.extraProductSetupSelfService = before;
    }
  });

  it("ausgeschaltetes Produkt ist nicht buchbar", async () => {
    const { customerId } = track(await setup());
    const r = await bookProduct({ customerId, userId: null, catalogKey: "unfall", dailyBudget: 30, startDate: null, acknowledged: true }, NOW);
    expect(r.ok).toBe(false);
    expect(await prisma.productBooking.count({ where: { customerId } })).toBe(0);
  });

  it("Buchung: Einrichtung genau einmal, Monatspreis erst beim Start, Aufgaben + Push", async () => {
    const { customerId } = track(await setup());
    const r = await bookProduct({ customerId, userId: null, catalogKey: "privatschutz", dailyBudget: 30, startDate: null, acknowledged: true }, NOW);
    expect(r).toMatchObject({ ok: true, status: "setup" });
    // Doppelklick: zweite Buchung desselben Produkts wird abgelehnt
    const again = await bookProduct({ customerId, userId: null, catalogKey: "privatschutz", dailyBudget: 30, startDate: null, acknowledged: true }, NOW);
    expect(again.ok).toBe(false);
    const setups = stripeState.calls.filter((c) => c.method === "invoiceItem.create");
    expect(setups).toHaveLength(1);
    expect((setups[0].args[0] as { price_data: { unit_amount: number } }).price_data.unit_amount).toBe(PRICE_LIST.extraProductSetup * 100);
    expect(stripeState.calls.filter((c) => c.method === "update" || c.method === "create")).toHaveLength(0);
    const b = await prisma.productBooking.findFirstOrThrow({ where: { customerId } });
    expect(b).toMatchObject({ status: "setup", setupStatus: "added", feeStatus: "pending", pricing: "list" });
    expect(Number(b.feeTo)).toBe(t1.monthly + PRICE_LIST.extraProductMonthly);
    // Budget zählt noch nicht
    expect((await currentBudgets(customerId, NOW)).lines.map((l) => l.product)).toEqual([TKV]);
    const name = (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).name;
    // Kampagnen-Automatik (Standard an): Agenten-Team ist vorgemerkt; fehlende Voraussetzungen → eine Aufgabe
    expect(await prisma.campaignWish.count({ where: { customerId, product: "Privatschutz", source: "produkt" } })).toBe(1);
    expect(await prisma.salesTask.count({ where: { title: { startsWith: "Kampagne Privatschutz für" }, AND: { title: { contains: name } } } })).toBe(1);
    expect(await prisma.salesTask.count({ where: { title: { startsWith: "Kampagne für Privatschutz" }, AND: { title: { contains: name } } } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "produkt.book", customerId } })).toBe(1);

    // Start: Budget gilt, Monatspreis ins Abo (Stufe + weiteres Produkt), idempotent
    const s = await startProduct(b.id, undefined, NOW);
    expect(s.ok).toBe(true);
    expect((await startProduct(b.id, undefined, NOW)).ok).toBe(false);
    const after = await prisma.productBooking.findUniqueOrThrow({ where: { id: b.id } });
    expect(after).toMatchObject({ status: "live", feeStatus: "done" });
    const lines = (await currentBudgets(customerId, new Date(NOW.getTime() + 1000))).lines;
    expect(lines).toContainEqual({ product: "Privatschutz", dailyBudget: 30 });
    const upd = stripeState.calls.filter((c) => c.method === "update");
    expect(upd).toHaveLength(1);
    expect((upd[0].args[1] as { price_data: { unit_amount: number } }).price_data.unit_amount).toBe((t1.monthly + PRICE_LIST.extraProductMonthly - 349) * 100);
    expect(Number((await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).retainerMonthly)).toBe(t1.monthly + PRICE_LIST.extraProductMonthly);
  });

  it("erkennt den Stufenwechsel", async () => {
    const { customerId } = track(await setup({ daily: 90 }));
    const r = await bookProduct({ customerId, userId: null, catalogKey: "privatschutz", dailyBudget: 20, startDate: null, acknowledged: true }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview.tierChange).toBe(true);
    expect(r.preview.tierTo?.monthly).toBe(t2.monthly);
    expect(r.preview.feeTo).toBe(t2.monthly + PRICE_LIST.extraProductMonthly);
  });

  it("individuelle Konditionen: gebucht, kein Stripe, Aufgabe „Preis prüfen“", async () => {
    const { customerId } = track(await setup({ retainer: 850 }));
    const r = await bookProduct({ customerId, userId: null, catalogKey: "privatschutz", dailyBudget: 30, startDate: null, acknowledged: true }, NOW);
    expect(r).toMatchObject({ ok: true, status: "setup" });
    expect(stripeState.calls).toHaveLength(0);
    const b = await prisma.productBooking.findFirstOrThrow({ where: { customerId } });
    expect(b).toMatchObject({ pricing: "individual", setupStatus: "manual", feeStatus: "manual", reason: "individual_terms" });
    const name = (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).name;
    expect(await prisma.salesTask.count({ where: { title: `Preis prüfen ${name}: Privatschutz dazugebucht` } })).toBe(1);
  });

  it("Ablehnung nimmt die Einrichtung in Stripe zurück", async () => {
    const { customerId } = track(await setup());
    const r = await bookProduct({ customerId, userId: null, catalogKey: "privatschutz", dailyBudget: 30, startDate: null, acknowledged: true }, NOW);
    expect(r.ok).toBe(true);
    const b = await prisma.productBooking.findFirstOrThrow({ where: { customerId } });
    const res = await rejectProduct(b.id, "Bitte erst Katze ausbauen.", undefined, NOW);
    expect(res.ok).toBe(true);
    expect(stripeState.calls.filter((c) => c.method === "invoiceItem.del")).toHaveLength(1);
    const after = await prisma.productBooking.findUniqueOrThrow({ where: { id: b.id } });
    expect(after).toMatchObject({ status: "rejected", setupStatus: "removed", feeStatus: "none" });
    expect((await rejectProduct(b.id, null, undefined, NOW)).ok).toBe(false);
    // Danach wieder buchbar
    expect((await productOverview(customerId, NOW)).bookable.map((x) => x.key)).toContain("privatschutz");
  });

  it("über individualFrom nur Anfrage, ohne Stripe", async () => {
    const { customerId } = track(await setup({ daily: 300 }));
    const r = await bookProduct({ customerId, userId: null, catalogKey: "privatschutz", dailyBudget: 100, startDate: null, acknowledged: true }, NOW);
    expect(r).toMatchObject({ ok: true, status: "requested" });
    expect(stripeState.calls).toHaveLength(0);
  });

  it("Beenden: nur Anfrage, einmal", async () => {
    const { customerId } = track(await setup());
    expect((await requestProductEnd(customerId, TKV, null, undefined, NOW)).ok).toBe(true);
    expect((await requestProductEnd(customerId, TKV, null, undefined, NOW)).ok).toBe(false);
    const o = await productOverview(customerId, NOW);
    expect(o.booked.find((b) => b.name === TKV)?.endRequestedAt).not.toBeNull();
    // Budget läuft unverändert weiter
    expect((await currentBudgets(customerId, NOW)).lines).toEqual([{ product: TKV, dailyBudget: 30 }]);
  });
});
