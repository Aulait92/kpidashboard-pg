// Budget ändern: Änderung → sofort übernommen, Stufenwechsel → Abo-Preis ab nächstem
// Abrechnungsmonat (Stripe gemockt), individuelle Konditionen → Aufgabe „Preis prüfen“,
// über individualFrom → Anfrage, Admin übernimmt/lehnt ab.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Item = { id: string; quantity: number; current_period_end?: number; price: { product: string; unit_amount: number; recurring: { interval: string } } };
const stripeState = vi.hoisted(() => ({
  sub: null as null | { id: string; status: string; schedule: null; items: { data: Item[] } },
  calls: [] as { method: string; args: unknown[] }[],
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
import { applyBudgetFee, budgetState, changeBudget, currentBudgets, decideBudgetRequest, processDueBudgetFees } from "@/lib/budget";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const [t1, t2] = PRICE_LIST.tiers;
const periodEnd = Math.floor(new Date("2026-12-01T00:00:00Z").getTime() / 1000);

async function setup(extra: { retainer?: number; interval?: string; plan?: string; daily?: number; stripe?: boolean } = {}) {
  const n = uid();
  const c = await makeCustomer({
    plan: extra.plan ?? "software",
    retainerMonthly: extra.retainer ?? t1.monthly,
    billingInterval: extra.interval ?? "month",
    stripeCustomerId: extra.stripe === false ? null : `cus_b_${n}`,
  });
  await makeBuyer(c.id, "owner");
  const offer = await prisma.offer.create({
    data: {
      number: `BU-${n}`,
      token: `bu-${n}`,
      contactName: "Budget Test",
      term: "12m",
      products: [{ name: "Katzenversicherung (TKV)", dailyBudget: extra.daily ?? 100 }],
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

const tkv = (daily: number) => [{ product: "Katzenversicherung (TKV)", dailyBudget: daily }];
const NOW = new Date("2026-11-11T10:00:00Z");

describe("Budget ändern (Kundenbereich)", () => {
  const customers: string[] = [];
  const offers: string[] = [];
  const track = (r: { customerId: string; offerId: string }) => (customers.push(r.customerId), offers.push(r.offerId), r);

  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const ids = await prisma.salesTask.findMany({ where: { title: { contains: "Test " } }, select: { id: true } });
    await prisma.salesTask.deleteMany({ where: { id: { in: ids.map((i) => i.id) } } });
    for (const id of customers) await cleanupCustomer(id);
    await prisma.offer.deleteMany({ where: { id: { in: offers } } });
  });
  beforeEach(() => {
    stripeState.calls = [];
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

  it("liest das Budget aus dem Angebot", async () => {
    const { customerId } = track(await setup());
    const s = await budgetState(customerId, NOW);
    expect(s.lines).toEqual(tkv(100));
    expect(s.ctx.cplSource).toBe("standard");
  });

  it("Erhöhung ohne Stufenwechsel: sofort übernommen, kein Preiswechsel, Meta-Aufgabe", async () => {
    const { customerId } = track(await setup());
    const r = await changeBudget({ customerId, userId: null, next: tkv(90), effectiveDate: null, acknowledged: false }, NOW);
    expect(r).toMatchObject({ ok: true, status: "applied", price: "none" });
    expect((await currentBudgets(customerId, new Date(NOW.getTime() + 1000))).lines).toEqual(tkv(90));
    expect(stripeState.calls).toHaveLength(0);
    const ch = await prisma.budgetChange.findFirstOrThrow({ where: { customerId } });
    expect(ch.stripeStatus).toBe("none");
    const name = (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).name;
    expect(await prisma.salesTask.count({ where: { title: { startsWith: `Meta-Budget ${name}` } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "budget.change", customerId } })).toBe(1);
  });

  it("Stufenwechsel ohne Bestätigung wird abgelehnt", async () => {
    const { customerId } = track(await setup());
    const r = await changeBudget({ customerId, userId: null, next: tkv(110), effectiveDate: null, acknowledged: false }, NOW);
    expect(r).toMatchObject({ ok: false });
  });

  it("Stufenwechsel sofort: Abo-Preis ohne anteilige Verrechnung (ab nächstem Abrechnungsmonat), idempotent", async () => {
    const { customerId } = track(await setup());
    const r = await changeBudget({ customerId, userId: null, next: tkv(110), effectiveDate: null, acknowledged: true }, NOW);
    expect(r).toMatchObject({ ok: true, status: "applied", price: "auto" });
    const upd = stripeState.calls.filter((c) => c.method === "update");
    expect(upd).toHaveLength(1);
    const [id, params] = upd[0].args as [string, { proration_behavior: string; price_data: { unit_amount: number } }];
    expect(id).toBe("si_sv");
    expect(params.proration_behavior).toBe("none");
    expect(params.price_data.unit_amount).toBe((t2.monthly - 349) * 100);
    const ch = await prisma.budgetChange.findFirstOrThrow({ where: { customerId } });
    expect(ch.stripeStatus).toBe("done");
    expect(Number((await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).retainerMonthly)).toBe(t2.monthly);
    // zweiter Lauf ändert nichts
    expect(await applyBudgetFee(ch.id, NOW)).toBe("skipped");
    expect(stripeState.calls.filter((c) => c.method === "update")).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: "budget.fee", customerId } })).toBe(1);
  });

  it("Senkung mit Stufenwechsel zum Datum: geplant, der Cron passt den Preis am Stichtag an", async () => {
    const { customerId } = track(await setup({ daily: 110, retainer: t2.monthly }));
    stripeState.sub!.items.data[1].price.unit_amount = (t2.monthly - 349) * 100;
    const r = await changeBudget({ customerId, userId: null, next: tkv(60), effectiveDate: "2026-11-20", acknowledged: true }, NOW);
    expect(r).toMatchObject({ ok: true, status: "applied", price: "auto" });
    expect(stripeState.calls).toHaveLength(0);
    // vor dem Stichtag gilt noch das alte Budget
    expect((await currentBudgets(customerId, NOW)).lines).toEqual(tkv(110));
    expect((await currentBudgets(customerId, NOW)).upcoming).toHaveLength(1);
    expect(await processDueBudgetFees(new Date("2026-11-15T10:00:00Z"))).toBe(0);
    expect(await processDueBudgetFees(new Date("2026-11-20T08:00:00Z"))).toBeGreaterThanOrEqual(1);
    const upd = stripeState.calls.filter((c) => c.method === "update");
    expect((upd[0].args[1] as { price_data: { unit_amount: number } }).price_data.unit_amount).toBe((t1.monthly - 349) * 100);
    expect((await currentBudgets(customerId, new Date("2026-11-20T08:00:00Z"))).lines).toEqual(tkv(60));
  });

  it("individuelle Konditionen: Budget sofort, Stripe unverändert, Aufgabe „Preis prüfen“", async () => {
    const { customerId } = track(await setup({ retainer: 800 }));
    const r = await changeBudget({ customerId, userId: null, next: tkv(110), effectiveDate: null, acknowledged: true }, NOW);
    expect(r).toMatchObject({ ok: true, status: "applied", price: "manual" });
    expect(stripeState.calls).toHaveLength(0);
    const name = (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).name;
    expect(await prisma.salesTask.count({ where: { title: { startsWith: `Preis prüfen ${name}` } } })).toBe(1);
    expect((await prisma.budgetChange.findFirstOrThrow({ where: { customerId } })).stripeStatus).toBe("manual");
  });

  it("ohne Stripe-Abo: Preiswechsel wird zur Admin-Aufgabe", async () => {
    const { customerId } = track(await setup({ stripe: false }));
    const r = await changeBudget({ customerId, userId: null, next: tkv(110), effectiveDate: null, acknowledged: true }, NOW);
    expect(r).toMatchObject({ ok: true, price: "auto" });
    const ch = await prisma.budgetChange.findFirstOrThrow({ where: { customerId } });
    expect(ch.stripeStatus).toBe("manual");
    const name = (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).name;
    expect(await prisma.salesTask.count({ where: { title: { startsWith: `Preis anpassen ${name}` } } })).toBe(1);
  });

  it("über individualFrom: Anfrage, Admin übernimmt", async () => {
    const { customerId } = track(await setup());
    const big = Math.ceil(PRICE_LIST.individualFrom / PRICE_LIST.daysPerMonth / 5) * 5 + 5;
    const r = await changeBudget({ customerId, userId: null, next: tkv(big), effectiveDate: null, acknowledged: false }, NOW);
    expect(r).toMatchObject({ ok: true, status: "pending" });
    expect((await currentBudgets(customerId, NOW)).lines).toEqual(tkv(100));
    // zweite Anfrage solange offen nicht möglich
    expect(await changeBudget({ customerId, userId: null, next: tkv(big + 5), effectiveDate: null, acknowledged: false }, NOW)).toMatchObject({ ok: false });
    const ch = await prisma.budgetChange.findFirstOrThrow({ where: { customerId, status: "pending" } });
    expect(await decideBudgetRequest(ch.id, true, "Angebot folgt", { role: "ADMIN" }, NOW)).toEqual({ ok: true });
    expect(await decideBudgetRequest(ch.id, false, null, { role: "ADMIN" }, NOW)).toMatchObject({ ok: false });
    expect((await currentBudgets(customerId, new Date(NOW.getTime() + 1000))).lines).toEqual(tkv(big));
    expect(stripeState.calls).toHaveLength(0);
  });

  it("über individualFrom: Admin lehnt ab, Budget bleibt", async () => {
    const { customerId } = track(await setup());
    await changeBudget({ customerId, userId: null, next: tkv(400), effectiveDate: null, acknowledged: false }, NOW);
    const ch = await prisma.budgetChange.findFirstOrThrow({ where: { customerId, status: "pending" } });
    expect(await decideBudgetRequest(ch.id, false, "Bitte erst Gespräch", { role: "ADMIN" }, NOW)).toEqual({ ok: true });
    expect((await prisma.budgetChange.findUniqueOrThrow({ where: { id: ch.id } })).status).toBe("rejected");
    expect((await currentBudgets(customerId, new Date(NOW.getTime() + 1000))).lines).toEqual(tkv(100));
  });

  it("Prüfungen: unverändert, Datum in der Vergangenheit, falsches Produkt", async () => {
    const { customerId } = track(await setup());
    expect(await changeBudget({ customerId, userId: null, next: tkv(100), effectiveDate: null, acknowledged: false }, NOW)).toMatchObject({ ok: false });
    expect(await changeBudget({ customerId, userId: null, next: tkv(90), effectiveDate: "2026-11-01", acknowledged: false }, NOW)).toMatchObject({ ok: false });
    expect(await changeBudget({ customerId, userId: null, next: [{ product: "Fremd", dailyBudget: 50 }], effectiveDate: null, acknowledged: false }, NOW)).toMatchObject({ ok: false });
  });
});

describe("Budget ändern ohne Angebot (ältere Kunden): Startwert aus den Werbeausgaben", () => {
  const ids: string[] = [];
  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    for (const id of ids) await cleanupCustomer(id);
  });

  it("ohne Ausgaben und Leads: kein Budget; mit Ausgaben + Leads: Ø je Tag, verteilt auf die Produkte", async () => {
    const c = await makeCustomer({ plan: "software", retainerMonthly: 700 });
    ids.push(c.id);
    expect((await currentBudgets(c.id, NOW)).lines).toEqual([]);
    const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
    // 10 Tage à 60 € → Ø 60 €/Tag; Leads TKV (3) und Hund (1) → je 30 €
    await prisma.customerAdSpend.createMany({ data: Array.from({ length: 10 }, (_, i) => ({ customerId: c.id, date: day(i + 1), amount: 60, accountId: `act_${c.id}` })) });
    await prisma.lead.createMany({
      data: [
        ...Array.from({ length: 3 }, (_, i) => ({ customerId: c.id, name: `K${i}`, source: "TKV Katze", createdAt: day(2) })),
        { customerId: c.id, name: "H", source: "TKV Hund", createdAt: day(3) },
      ],
    });
    const b = await currentBudgets(c.id, NOW);
    expect(b.estimated).toBe(true);
    expect(b.lines).toEqual([
      { product: "TKV Katze", dailyBudget: 30 },
      { product: "TKV Hund", dailyBudget: 30 },
    ]);
  });

  it("erste Änderung speichert auch die unveränderten Zeilen", async () => {
    const c = await makeCustomer({ plan: "software", retainerMonthly: 700, stripeCustomerId: `cus_e_${uid()}` });
    ids.push(c.id);
    const u = await makeBuyer(c.id, "owner");
    await prisma.customerAdSpend.create({ data: { customerId: c.id, date: new Date(NOW.getTime() - 86_400_000), amount: 80, accountId: `act_${c.id}` } });
    await prisma.lead.createMany({
      data: [
        { customerId: c.id, name: "A", source: "TKV Katze", createdAt: new Date(NOW.getTime() - 2 * 86_400_000) },
        { customerId: c.id, name: "B", source: "TKV Hund", createdAt: new Date(NOW.getTime() - 2 * 86_400_000) },
      ],
    });
    const res = await changeBudget(
      { customerId: c.id, userId: u.id, next: [{ product: "TKV Katze", dailyBudget: 60 }, { product: "TKV Hund", dailyBudget: 40 }], effectiveDate: null, acknowledged: true },
      NOW,
    );
    expect(res).toMatchObject({ ok: true, status: "applied" });
    const after = await currentBudgets(c.id, new Date(NOW.getTime() + 1000));
    expect(after.estimated).toBeFalsy();
    expect(after.lines.sort((a, b) => a.product.localeCompare(b.product))).toEqual([
      { product: "TKV Hund", dailyBudget: 40 },
      { product: "TKV Katze", dailyBudget: 60 },
    ]);
  });
});
