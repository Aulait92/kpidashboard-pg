// Umsatzsteuer beim Leadverkauf und „Ihre erste Woche“ (Ole, 20.11.2026), ganzer Weg ohne echte Stripe-API:
// Angebot Pay-per-Lead + Software mit erster Woche → Annahme mit Anzahl und Registernummer → Bezahlseite → Webhook →
// Bezug und wartende Bestellung, keine Abbuchung vor der Registerprüfung → nach der Prüfung Abbuchung mit dem richtigen
// Steuersatz (steuerfrei § 4 Nr. 11 mit Rechnungshinweis bzw. 19 %), Abbuchung = Anzeige, Leads auf eigener Rechnung.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Params = Record<string, unknown> & { metadata: Record<string, string> };
type FakeSession = { id: string; url: string; status: "open" | "complete" | "expired"; expires_at: number; metadata: Record<string, string>; params: Params };
type Item = { invoice: string; description: string; price_data: { unit_amount: number; product: string }; tax_rates?: string[] };
type Inv = { id: string; params: Record<string, unknown> & { metadata: Record<string, string>; footer?: string }; items: Item[] };
const s = vi.hoisted(() => ({
  sessions: new Map<string, FakeSession>(),
  created: 0,
  run: "a",
  schedules: [] as { params: Record<string, unknown>; key: string; id: string }[],
  pm: new Map<string, string>(),
  invoices: [] as Inv[],
  rates: [{ id: "txr_19", percentage: 19, metadata: { pg_key: "ust19" } }] as { id: string; percentage: number; metadata: Record<string, string>; description?: string }[],
}));

vi.mock("stripe", () => {
  class FakeStripe {
    products = {
      search: async () => ({ data: [] }),
      create: async (p: { metadata: { pg_key: string } }) => ({ id: `prod_${p.metadata.pg_key}` }),
    };
    tax = { registrations: { list: async () => ({ data: [] }) } };
    taxRates = {
      list: async () => ({ data: s.rates }),
      create: async (p: { percentage: number; metadata: Record<string, string>; description: string }) => {
        const r = { id: `txr_${p.metadata.pg_key}`, percentage: p.percentage, metadata: p.metadata, description: p.description };
        s.rates.push(r);
        return r;
      },
    };
    accounts = { retrieveCurrent: async () => ({ settings: { invoices: { default_account_tax_ids: [] } } }) };
    taxIds = { list: async () => ({ data: [] }) };
    customers = {
      create: async () => ({ id: `cus_${s.run}` }),
      retrieve: async (id: string) => ({ id, invoice_settings: { default_payment_method: s.pm.get(id) ?? null } }),
      update: async (id: string, p: { invoice_settings?: { default_payment_method?: string } }) => {
        if (p.invoice_settings?.default_payment_method) s.pm.set(id, p.invoice_settings.default_payment_method);
        return {};
      },
    };
    paymentIntents = { retrieve: async (id: string) => ({ id, payment_method: "pm_sepa" }) };
    setupIntents = { retrieve: async (id: string) => ({ id, payment_method: "pm_setup" }) };
    subscriptionSchedules = {
      create: async (params: Record<string, unknown>, opts: { idempotencyKey: string }) => {
        const id = `sub_sched_${s.run}_${s.schedules.length + 1}`;
        s.schedules.push({ params, key: opts.idempotencyKey, id });
        return { id, subscription: null };
      },
      retrieve: async (id: string) => ({ id, status: "not_started" }),
      cancel: async (id: string) => ({ id, status: "canceled" }),
    };
    invoices = {
      create: async (params: Inv["params"]) => {
        const inv: Inv = { id: `in_${s.run}_${s.invoices.length + 1}`, params, items: [] };
        s.invoices.push(inv);
        return { id: inv.id };
      },
      // Wie Stripe: Steuer je Position (Satz der Position), auf Cent gerundet
      finalizeInvoice: async (id: string) => {
        const inv = s.invoices.find((i) => i.id === id)!;
        const total = inv.items.reduce((n, it) => {
          const rate = s.rates.find((r) => r.id === it.tax_rates?.[0])?.percentage ?? 0;
          const a = it.price_data.unit_amount;
          return n + a + Math.sign(a) * Math.round((Math.abs(a) * rate) / 100);
        }, 0);
        return { id, status: "open", total };
      },
      pay: async (id: string) => ({ id, status: "paid" }),
    };
    invoiceItems = {
      create: async (p: Item) => {
        s.invoices.find((i) => i.id === p.invoice)!.items.push(p);
        return { id: `ii_${Math.random()}` };
      },
    };
    checkout = {
      sessions: {
        create: async (params: Params) => {
          s.created++;
          const id = `cs_${s.run}_${s.created}`;
          const sess: FakeSession = { id, url: `https://checkout.stripe.test/${id}`, status: "open", expires_at: Math.floor(Date.now() / 1000) + 24 * 3600, metadata: params.metadata, params };
          s.sessions.set(id, sess);
          return sess;
        },
        retrieve: async (id: string) => s.sessions.get(id),
        expire: async (id: string) => s.sessions.get(id),
      },
    };
  }
  return { default: FakeStripe };
});
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })), sendToCustomer: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/lib/mail-guard", () => ({
  wasBlocked: () => false,
  MAIL_BLOCKED_TEXT: "gesperrt",
  mailClient: () => ({ emails: { send: async () => ({ error: null }) } }),
}));

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { acceptOffer, createOffer } from "@/lib/offers";
import { createCheckoutForOffer } from "@/lib/billing";
import { handleStripeEvent } from "@/lib/billing-webhook";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { placeOrder } from "@/lib/ppl/orders";
import { registerGeprueft } from "@/lib/ppl/erste-woche";
import { ersteWocheBetrag } from "@/lib/ppl/erste-woche-shared";
import { bestellBetrag } from "@/lib/ppl/steuer";
import { requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const contacts: string[] = [];
const offers: string[] = [];
const customers: string[] = [];

describe("Erste Woche und Umsatzsteuer beim Leadverkauf", () => {
  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
    process.env.RESEND_API_KEY = "re_test";
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const ob = await prisma.onboarding.findMany({ where: { offerId: { in: offers } }, select: { customerId: true } });
    customers.push(...ob.map((o) => o.customerId));
    await prisma.onboarding.deleteMany({ where: { offerId: { in: offers } } }).catch(() => {});
    await prisma.salesTask.deleteMany({ where: { contactId: { in: contacts } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { customerId: { in: customers } } }).catch(() => {});
    await prisma.customer.deleteMany({ where: { id: { in: customers } } }).catch(() => {});
    await prisma.offer.deleteMany({ where: { id: { in: offers } } }).catch(() => {});
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
  });
  beforeEach(() => {
    s.created = 0;
    s.run = uid();
    s.sessions.clear();
    s.schedules = [];
    s.invoices = [];
  });

  it("Angebot → Annahme → Bezug und Bestellung; Abbuchung erst nach Registerprüfung, steuerfrei mit Hinweis", async () => {
    const tag = uid();
    const product = `PKV-Tarifoptimierung ${tag}`;
    const contact = await prisma.salesContact.create({ data: { name: `PPL ${tag}`, email: `ppl-${tag}@example.test` } });
    contacts.push(contact.id);
    const input = {
      contactName: "Paula Pay",
      company: `Agentur Pay ${tag}`,
      email: `paula-${tag}@example.test`,
      package: "ppl_software",
      term: "none",
      products: [],
      startDate: addDaysIso(berlinTodayIso(), 10),
      ersteWoche: { productKey: product, label: null, price: 17, quantity: 20 },
    } as Parameters<typeof createOffer>[1];
    await expect(createOffer({ salesContactId: contact.id }, { ...input, ersteWoche: { productKey: product, price: 17, quantity: 4 } }, null)).rejects.toThrow(/mindestens 5/);
    const offer = await createOffer({ salesContactId: contact.id }, input, null);
    offers.push(offer.id);
    expect([offer.pplProductKey, Number(offer.pplPrice), offer.pplQuantity, offer.pplAutoRenew]).toEqual([product, 17, 20, true]);

    // Annahme: Registernummer Pflicht (Format), Anzahl ab 5
    const business = { company: `Agentur Pay ${tag}`, vatId: null, confirmed: true };
    const base = { name: "Paula Pay", ip: null, agent: "vitest", termsAccepted: true, business };
    expect(await acceptOffer(offer.token, { ...base, ersteWoche: { quantity: 25, autoRenew: false, registerNr: "" } })).toMatchObject({ ok: false, error: expect.stringMatching(/Registernummer/) });
    expect(await acceptOffer(offer.token, { ...base, ersteWoche: { quantity: 25, autoRenew: false, registerNr: "D-123" } })).toMatchObject({ ok: false });
    expect(await acceptOffer(offer.token, { ...base, ersteWoche: { quantity: 3, autoRenew: false, registerNr: "D-ABCD-12345-67" } })).toMatchObject({ ok: false, error: expect.stringMatching(/mindestens 5/) });
    expect(await acceptOffer(offer.token, { ...base, ersteWoche: { quantity: 25, autoRenew: false, registerNr: "d abcd 12345 67" } })).toEqual({ ok: true });
    const acc = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect([acc.pplQuantity, acc.pplAutoRenew, acc.pplRegisterNr]).toEqual([25, false, "D-ABCD-12345-67"]);

    // Bezahlseite (Zahlungsart) und Webhook → Onboarding legt Bezug und wartende Bestellung an
    await createCheckoutForOffer(offer.id, "sepa");
    const sess = s.sessions.get(`cs_${s.run}_1`)!;
    await handleStripeEvent({
      id: `evt_${uid()}`,
      type: "checkout.session.completed",
      data: { object: { id: sess.id, object: "checkout.session", mode: "setup", client_reference_id: offer.id, payment_status: "no_payment_required", amount_total: 0, customer: `cus_${s.run}`, subscription: null, payment_intent: null, setup_intent: "seti_x", metadata: sess.metadata, customer_details: { email: null } } },
    } as unknown as Stripe.Event);
    // Software als eigenes Abo (nur Position Software), Leads nicht darin
    expect(s.schedules).toHaveLength(1);
    const products = (s.schedules[0].params as { phases: { items: { price_data: { product: string } }[] }[] }).phases.flatMap((p) => p.items.map((i) => i.price_data.product));
    expect(products).not.toContain("prod_leads");

    const ob = await prisma.onboarding.findUniqueOrThrow({ where: { offerId: offer.id } });
    const sub = await prisma.leadSubscription.findFirstOrThrow({ where: { customerId: ob.customerId }, include: { orders: true } });
    expect([sub.productKey, sub.period, sub.delivery, Number(sub.price), sub.active]).toEqual([product, "week", "app", 17, true]);
    expect(sub.orders).toHaveLength(1);
    expect([sub.orders[0].status, sub.orders[0].quantity, sub.orders[0].autoRenew]).toEqual(["wartet", 25, false]);
    const kunde = await prisma.customer.findUniqueOrThrow({ where: { id: ob.customerId } });
    expect([kunde.vermittlerRegisterNr, kunde.vermittlerRegisterStatus, kunde.vermittlerGeprueftAt]).toEqual(["D-ABCD-12345-67", null, null]);
    expect(s.pm.get(`cus_${s.run}`)).toBe("pm_setup"); // Zahlungsart ist da …
    expect(s.invoices).toHaveLength(0); // … aber keine Abbuchung vor der Registerprüfung

    // Aufgabe „Registernummer prüfen“ mit Link statt „Bezug einrichten“
    const tasks = await prisma.salesTask.findMany({ where: { contactId: contact.id } });
    const reg = tasks.find((t) => /Registernummer prüfen/.test(t.title));
    expect(reg?.note).toContain(`/admin/neu/leads/ppl/bezug/${sub.id}`);
    expect(tasks.map((t) => t.title).join("|")).not.toMatch(/Bezug einrichten/);

    // Kunde bestellt selbst, solange geprüft wird: nur vorgemerkt, keine Abbuchung
    const vor = await placeOrder({ subscriptionId: sub.id, weekOffset: sub.orders[0].periodStart.getTime() > Date.now() ? 1 : 0, quantity: 25, autoRenew: false });
    expect(vor).toMatchObject({ ok: true });
    expect(s.invoices).toHaveLength(0);

    // Registerprüfung (Makler) → Abbuchung steuerfrei mit Hinweis, Betrag = Anzeige
    await prisma.customer.update({ where: { id: kunde.id }, data: { vermittlerRegisterStatus: "makler", vermittlerGeprueftAt: new Date(), vermittlerGeprueftVon: "ole@test" } });
    const fr = await registerGeprueft(kunde.id);
    expect(fr).toMatchObject({ released: 1, failed: 0 });
    expect(s.invoices).toHaveLength(1);
    const inv = s.invoices[0];
    expect(inv.params.metadata).toMatchObject({ kind: "ppl_order", steuer: "steuerfrei_4_11" });
    expect(inv.params.pending_invoice_items_behavior).toBe("exclude");
    expect(String(inv.params.footer)).toMatch(/^Steuerfreie Leistung nach § 4 Nr\. 11 UStG\.\n/);
    expect(inv.params.automatic_tax).toBeUndefined();
    expect(inv.items.map((i) => [i.price_data.product, i.price_data.unit_amount, i.tax_rates])).toEqual([["prod_leads", 42500, ["txr_ust0_4_11"]]]);
    expect(s.rates.find((r) => r.id === "txr_ust0_4_11")).toMatchObject({ percentage: 0, description: "Steuerfreie Leistung nach § 4 Nr. 11 UStG" });
    const order = await prisma.leadOrder.findUniqueOrThrow({ where: { id: sub.orders[0].id } });
    expect([order.status, order.steuer, Number(order.amount)]).toEqual(["paid", "steuerfrei_4_11", 425]);
    expect(ersteWocheBetrag({ productKey: product, price: 17 }, 25).brutto).toBe(425);
  });

  it("ohne geprüften Vermittlerstatus (z. B. Händler) und Kindersparplan: 19 %, Abbuchung = Anzeige", async () => {
    const stripeId = `cus_x_${uid()}`;
    s.pm.set(stripeId, "pm_card");
    const c = await prisma.customer.create({ data: { name: `Händler ${uid()}`, stripeCustomerId: stripeId, vermittlerRegisterStatus: "keiner", vermittlerGeprueftAt: new Date() } });
    customers.push(c.id);
    const tkv = await prisma.leadSubscription.create({ data: { customerId: c.id, productKey: `TKV-Katze ${uid()}`, price: 17, period: "week", delivery: "app" } });
    const r1 = await placeOrder({ subscriptionId: tkv.id, weekOffset: 1, quantity: 7, autoRenew: false });
    expect(r1.ok).toBe(true);
    expect(s.invoices.at(-1)!.items[0].tax_rates).toEqual(["txr_19"]);
    expect(s.invoices.at(-1)!.params.metadata.steuer).toBe("steuerpflichtig");
    expect(String(s.invoices.at(-1)!.params.footer ?? "")).not.toMatch(/§ 4 Nr\. 11/);
    expect((await prisma.leadOrder.findFirstOrThrow({ where: { subscriptionId: tkv.id } })).steuer).toBe("steuerpflichtig");

    // Kindersparplan: auch beim geprüften Makler und mit „steuerfrei“ am Bezug immer 19 %; 65 € brutto = 54,62 € netto
    const m = await prisma.customer.create({ data: { name: `Makler ${uid()}`, stripeCustomerId: `cus_m_${uid()}`, vermittlerRegisterNr: "D-ABCD-12345-67", vermittlerRegisterStatus: "makler", vermittlerGeprueftAt: new Date() } });
    customers.push(m.id);
    s.pm.set(m.stripeCustomerId!, "pm_card");
    const ksp = await prisma.leadSubscription.create({ data: { customerId: m.id, productKey: "Kindersparplan", steuer: "steuerfrei_4_11", price: 54.62, period: "week", delivery: "app" } });
    const before = s.invoices.length;
    expect((await placeOrder({ subscriptionId: ksp.id, weekOffset: 1, quantity: 20, autoRenew: false })).ok).toBe(true);
    const inv = s.invoices[before];
    expect(inv.items[0].tax_rates).toEqual(["txr_19"]);
    const total = inv.items.reduce((n, it) => n + it.price_data.unit_amount + Math.round(it.price_data.unit_amount * 0.19), 0) / 100;
    expect(total).toBe(bestellBetrag({ price: 54.62, quantity: 20, credit: 0, steuer: "steuerpflichtig" }).brutto);
    expect(total).toBe(1299.96);
  });
});
