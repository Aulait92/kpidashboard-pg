// Preise 11.11.2026: Logins, Jahreszahlung, Bestandskunden-Modul, WhatsApp inklusive.
// Stripe ist gemockt (kein Netz); geprüft werden die Abo-Positionen, die die App schickt.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Item = { id: string; quantity: number; price: { product: string; unit_amount: number; recurring: { interval: string } } };
const stripeState = vi.hoisted(() => ({
  scheduleParams: [] as unknown[],
  sub: null as null | { id: string; status: string; schedule: null; items: { data: Item[] } },
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
    customers = { update: async () => ({}) };
    subscriptionSchedules = {
      create: async (params: unknown) => {
        s.scheduleParams.push(params);
        const n = s.scheduleParams.length + Math.random().toString(36).slice(2, 8);
        return { id: `sub_sched_${n}`, subscription: `sub_${n}` };
      },
    };
    subscriptions = {
      list: async () => ({ data: s.sub ? [s.sub] : [] }),
      update: async (...args: unknown[]) => log("subscriptions.update")(...args),
    };
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
        if (s.sub) s.sub.items.data = s.sub.items.data.filter((i) => i.id !== id);
        return {};
      },
    };
  }
  return { default: FakeStripe };
});

import { prisma } from "@/lib/prisma";
import { createScheduleForOffer, setBestandModule, syncSeatBilling } from "@/lib/billing";
import { startOnboarding } from "@/lib/onboarding";
import { createOffer } from "@/lib/offers";
import { createCampaign } from "@/lib/bestand/campaigns";
import { QUOTA_REACHED, bestandQuota } from "@/lib/bestand/quota";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { chargeWhatsAppFees, feeChargeDue, monthlyFeeCosts } from "@/lib/whatsapp/fees";
import { retainerRows } from "@/lib/revenue-ledger";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const d = (s: string) => new Date(`${s}T10:00:00Z`);

async function makeOffer(extra: Record<string, unknown> = {}) {
  const n = uid();
  return prisma.offer.create({
    data: {
      number: `PT-${n}`,
      token: `pt-${n}`,
      contactName: "Preis Test",
      term: "12m",
      products: [{ name: "Privatschutz", dailyBudget: 50 }],
      status: "accepted",
      acceptedAt: new Date(),
      setupFee: 990,
      monthlyFee: 1000,
      softwareFee: 349,
      validUntil: d("2026-12-31"),
      seats: 5,
      seatsIncluded: 3,
      seatMonthly: 49,
      bestandMonthly: 149,
      annualPrepay: true,
      annualFreeMonths: 2,
      stripeCustomerId: `cus_${n}`,
      ...extra,
    },
  });
}

describe("Preise: Annahme → Abo-Positionen und Kundenkonto", () => {
  const customers: string[] = [];
  const offers: string[] = [];
  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    for (const id of customers) await cleanupCustomer(id);
    await prisma.offer.deleteMany({ where: { id: { in: offers } } });
  });
  beforeEach(() => {
    stripeState.scheduleParams = [];
    stripeState.calls = [];
    stripeState.sub = null;
  });

  it("Jahresabo mit 5 Logins und Modul: Positionen mit Intervall Jahr, Logins als Menge", async () => {
    const offer = await makeOffer();
    offers.push(offer.id);
    await createScheduleForOffer(offer.id, { customer: offer.stripeCustomerId, mode: "subscription" } as never);
    expect(stripeState.scheduleParams).toHaveLength(1);
    const params = stripeState.scheduleParams[0] as { phases: { items: { quantity: number; price_data: { product: string; unit_amount: number; recurring: { interval: string } } }[] }[] };
    const items = params.phases[0].items.map((i) => ({ product: i.price_data.product, qty: i.quantity, cents: i.price_data.unit_amount, interval: i.price_data.recurring.interval }));
    expect(items).toEqual([
      { product: "prod_software", qty: 1, cents: 349 * 10 * 100, interval: "year" },
      { product: "prod_service", qty: 1, cents: 651 * 10 * 100, interval: "year" },
      { product: "prod_seat", qty: 2, cents: 49 * 10 * 100, interval: "year" },
      { product: "prod_bestand", qty: 1, cents: 149 * 10 * 100, interval: "year" },
    ]);
  });

  it("Angebot mit 3 Monaten Laufzeit: Setup 1.990 €, Laufzeit gespeichert, keine Jahreszahlung", async () => {
    const contact = await prisma.salesContact.create({ data: { name: "Laufzeit Test", email: `lz3-${uid()}@example.test` } });
    const base = { contactName: "Laufzeit Test", term: "3m" as const, products: [{ name: "Katzenversicherung", dailyBudget: 40 }], startDate: "2026-12-01" };
    const offer = await createOffer({ salesContactId: contact.id }, base, null);
    offers.push(offer.id);
    expect(offer.term).toBe("3m");
    expect(Number(offer.setupFee)).toBe(1990);
    expect(Number(offer.monthlyFee)).toBe(1000);
    await expect(createOffer({ salesContactId: contact.id }, { ...base, annual: true }, null)).rejects.toThrow(/12 Monaten/);
    // Monatsabo wie bei 12 Monaten
    const accepted = await makeOffer({ term: "3m", setupFee: 1990, seats: 3, bestandMonthly: null, annualPrepay: false, annualFreeMonths: null });
    offers.push(accepted.id);
    await createScheduleForOffer(accepted.id, { customer: accepted.stripeCustomerId, mode: "subscription" } as never);
    const params = stripeState.scheduleParams[0] as { phases: { items: { price_data: { product: string; recurring: { interval: string } } }[] }[] };
    expect(params.phases[0].items.map((i) => [i.price_data.product, i.price_data.recurring.interval])).toEqual([
      ["prod_software", "month"],
      ["prod_service", "month"],
    ]);
    await prisma.offer.deleteMany({ where: { salesContactId: contact.id } });
    await prisma.salesContact.delete({ where: { id: contact.id } }).catch(() => {});
  });

  it("Monatsabo ohne Zusätze: nur Software + Betreuung, Intervall Monat", async () => {
    const offer = await makeOffer({ seats: 3, bestandMonthly: null, annualPrepay: false, annualFreeMonths: null });
    offers.push(offer.id);
    await createScheduleForOffer(offer.id, { customer: offer.stripeCustomerId, mode: "subscription" } as never);
    const params = stripeState.scheduleParams[0] as { phases: { items: { price_data: { product: string; recurring: { interval: string } } }[] }[] };
    expect(params.phases[0].items.map((i) => [i.price_data.product, i.price_data.recurring.interval])).toEqual([
      ["prod_software", "month"],
      ["prod_service", "month"],
    ]);
  });

  it("Annahme übernimmt Logins, Zahlweise und Modul ins Kundenkonto", async () => {
    const offer = await makeOffer({ stripeCustomerId: null });
    offers.push(offer.id);
    const c = await makeCustomer();
    customers.push(c.id);
    const r = await startOnboarding(offer.id, { customerId: c.id });
    expect(r.ok).toBe(true);
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(after).toMatchObject({ seatsIncluded: 3, seatsBilled: 2, billingInterval: "year", existingCustomersEnabled: true, bestandGrandfathered: false });
    expect(Number(after.seatMonthly)).toBe(49);
    expect(Number(after.bestandMonthly)).toBe(149);
  });

  it("Makler-Angebot: Modul kostet 149 € wie bei Vertretern, Annahme setzt Kunde auf Makler", async () => {
    const offer = await makeOffer({ vermittlerTyp: "makler", bestandMonthly: 149, annualPrepay: false, annualFreeMonths: null });
    offers.push(offer.id);
    await createScheduleForOffer(offer.id, { customer: offer.stripeCustomerId, mode: "subscription" } as never);
    const params = stripeState.scheduleParams[0] as { phases: { items: { price_data: { product: string } }[] }[] };
    expect(params.phases[0].items.map((i) => i.price_data.product)).toContain("prod_bestand");

    const angenommen = await makeOffer({ vermittlerTyp: "makler", bestandMonthly: 149, stripeCustomerId: null });
    offers.push(angenommen.id);
    const c = await makeCustomer();
    customers.push(c.id);
    expect((await startOnboarding(angenommen.id, { customerId: c.id })).ok).toBe(true);
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(after).toMatchObject({ vermittlerTyp: "makler", existingCustomersEnabled: true });
    expect(Number(after.bestandMonthly)).toBe(149);
  });

  it("Makler bucht das Modul nachträglich: 149 €, auch wenn bisher 0 € hinterlegt war", async () => {
    const c = await makeCustomer({ stripeCustomerId: `cus_${uid()}`, vermittlerTyp: "makler", existingCustomersEnabled: true, bestandMonthly: 0 });
    customers.push(c.id);
    stripeState.sub = { id: "sub_m", status: "active", schedule: null, items: { data: [] } };
    expect(await setBestandModule(c.id, "book")).toEqual({ ok: true, changed: true });
    expect(stripeState.sub!.items.data.map((i) => i.price.product)).toContain("prod_bestand");
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.existingCustomersEnabled).toBe(true);
    expect(Number(after.bestandMonthly)).toBe(149);
  });

  it("Berater hinzufügen/entfernen ändert die Menge im Abo (anteilig)", async () => {
    const c = await makeCustomer({ stripeCustomerId: `cus_${uid()}`, seatsIncluded: 3, seatMonthly: 49, seatsBilled: 0 });
    customers.push(c.id);
    stripeState.sub = {
      id: "sub_1",
      status: "active",
      schedule: null,
      items: { data: [{ id: "si_sw", quantity: 1, price: { product: "prod_software", unit_amount: 34900, recurring: { interval: "month" } } }] },
    };
    await makeBuyer(c.id, "owner");
    await makeBuyer(c.id, "advisor");
    await makeBuyer(c.id, "advisor");
    // 3 Logins = inklusive → nichts zu tun
    expect(await syncSeatBilling(c.id)).toEqual({ ok: true, changed: false });
    expect(stripeState.calls).toHaveLength(0);

    // 4. Login → neue Position „Weiterer Berater-Login“ mit Menge 1
    const fourth = await makeBuyer(c.id, "advisor");
    expect(await syncSeatBilling(c.id)).toEqual({ ok: true, changed: true });
    const created = stripeState.calls.find((x) => x.method === "subscriptionItems.create")!.args[0] as { quantity: number; proration_behavior: string; price_data: { product: string; unit_amount: number } };
    expect(created).toMatchObject({ quantity: 1, proration_behavior: "create_prorations", price_data: { product: "prod_seat", unit_amount: 4900 } });

    // 5. Login → Menge 2
    const fifth = await makeBuyer(c.id, "advisor");
    await syncSeatBilling(c.id);
    expect(stripeState.sub.items.data.find((i) => i.price.product === "prod_seat")!.quantity).toBe(2);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).seatsBilled).toBe(2);

    // zwei entfernen → Menge 0
    await prisma.user.deleteMany({ where: { id: { in: [fourth.id, fifth.id] } } });
    await syncSeatBilling(c.id);
    expect(stripeState.sub.items.data.find((i) => i.price.product === "prod_seat")!.quantity).toBe(0);
    expect(await prisma.auditLog.count({ where: { customerId: c.id, action: "billing.seats" } })).toBe(3);
  });

  it("Modul buchen und abbestellen: eigene Position, Zugang folgt", async () => {
    const c = await makeCustomer({ stripeCustomerId: `cus_${uid()}` });
    customers.push(c.id);
    stripeState.sub = { id: "sub_2", status: "active", schedule: null, items: { data: [] } };
    expect(await setBestandModule(c.id, "book")).toEqual({ ok: true, changed: true });
    expect(stripeState.sub.items.data.map((i) => [i.price.product, i.price.unit_amount])).toEqual([["prod_bestand", 14900]]);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).existingCustomersEnabled).toBe(true);
    await setBestandModule(c.id, "cancel");
    expect(stripeState.sub.items.data).toHaveLength(0);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).existingCustomersEnabled).toBe(false);
  });
});

describe("Bestandskunden-Modul: Sperre, Bestandsschutz, Kontingent", () => {
  let customerId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ existingCustomersEnabled: true, bestandGrandfathered: true, bestandMessageQuota: 2 })).id;
  });
  afterAll(() => cleanupCustomer(customerId));

  it("Bestandsschutz-Migration: freigeschaltete Kunden behalten den Zugang", async () => {
    // Migration setzt bestandGrandfathered für alle mit existingCustomersEnabled – Zugang hängt weiter am Flag
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(c.existingCustomersEnabled).toBe(true);
    expect(c.bestandGrandfathered).toBe(true);
    expect(c.bestandMonthly).toBeNull();
  });

  it("Kontingent erreicht → neue Kampagne wird vor dem Start gesperrt", async () => {
    const now = new Date();
    const ec = await prisma.existingCustomer.create({ data: { customerId, firstName: "Erika", lastName: "Muster", phone: "4915100000001", lines: ["KFZ"] } });
    const first = await createCampaign({ customerId, occasion: "review", segment: {}, topic: null, dailyLimit: 50, now });
    const rec = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: first.id } });
    await prisma.campaignRecipient.update({ where: { id: rec.id }, data: { status: "sent", sentAt: now } });
    const ec2 = await prisma.existingCustomer.create({ data: { customerId, firstName: "Max", lastName: "Probe", phone: "4915100000002", lines: ["KFZ"] } });
    await prisma.campaignRecipient.create({ data: { campaignId: first.id, existingCustomerId: ec2.id, status: "sent", sentAt: now } });
    expect(await bestandQuota(customerId, now)).toEqual({ limit: 2, used: 2, remaining: 0 });
    await expect(createCampaign({ customerId, occasion: "review", segment: {}, topic: null, dailyLimit: 50, now })).rejects.toThrow(QUOTA_REACHED);
    // Admin erhöht das Kontingent → wieder möglich
    await prisma.customer.update({ where: { id: customerId }, data: { bestandMessageQuota: null } });
    expect((await bestandQuota(customerId, now)).limit).toBe(PRICE_LIST.bestandIncludedMessages);
    expect(ec.id).toBeTruthy();
  });
});

describe("WhatsApp-Gebühren im Preis enthalten", () => {
  let customerId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected" } });
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: "4915199990077" } });
    await prisma.message.create({ data: { conversationId: conv.id, direction: "outbound", createdAt: d("2026-09-15"), kind: "template", pricingCategory: "marketing", billable: true } });
  });
  afterAll(() => cleanupCustomer(customerId));

  it("Schalter steht auf „inklusive“ → Cron rechnet nicht weiter ab", () => {
    expect(PRICE_LIST.whatsappIncluded).toBe(true);
    expect(feeChargeDue(1)).toBe(false);
    // nur mit ausgeschaltetem Schalter wieder fällig (Code bleibt erhalten)
    expect(feeChargeDue(1, false)).toBe(true);
    expect(feeChargeDue(5, false)).toBe(false);
  });

  it("Gebühren werden weiter erfasst (Kosten je Monat), aber nicht berechnet, solange der Cron sie nicht anstößt", async () => {
    const costs = await monthlyFeeCosts(d("2026-09-01"));
    expect(costs.get("2026-09")).toBeGreaterThan(0);
    expect(await prisma.whatsAppFeeCharge.count({ where: { customerId } })).toBe(0);
    // Der Code für die Weiterberechnung bleibt (nur aktiv, wenn whatsappIncluded = false)
    expect(typeof chargeWhatsAppFees).toBe("function");
  });

  it("Jahresabo im Umsatzbuch: MRR = Jahresbetrag / 12", () => {
    const rows = retainerRows(
      { customerId: "c", monthly: 1000, start: d("2026-09-01"), end: null, softwareShare: 349, extras: 98 + 149, annualFactor: 10 / 12, pauses: [{ from: d("2026-09-10"), to: d("2026-09-20") }] },
      ["2026-10"],
      "2026-11",
    );
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo((1247 * 10) / 12, 1);
  });
});
