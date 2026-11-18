// Abrechnungstag im Angebot (Ole, 18.11.2026): Angebot anlegen, Stripe-Zeitplan (gemockt, kein Netz) und Kundenkonto.
// Geprüft: Start in der Zukunft mit Abrechnung am 15. und kostenlosem Start (Abo beginnt erst am Abrechnungstag,
// keine Testphase), anteilige Positionen ohne Haken (mit Zeitraum, centgenau), Abrechnungstag gleich Starttag
// (wie bisher), Überweisung und Lastschrift mit demselben Anker, Übernahme ins Kundenkonto.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ schedules: [] as Record<string, unknown>[], updates: [] as Record<string, unknown>[] }));

vi.mock("stripe", () => {
  class FakeStripe {
    products = {
      search: async () => ({ data: [] }),
      create: async (p: { metadata: { pg_key: string } }) => ({ id: `prod_${p.metadata.pg_key}` }),
    };
    tax = { registrations: { list: async () => ({ data: [] }) } };
    taxRates = { list: async () => ({ data: [{ id: "txr_19", metadata: { pg_key: "ust19" } }] }) };
    accounts = { retrieveCurrent: async () => ({ settings: { invoices: { default_account_tax_ids: [] } } }) };
    taxIds = { list: async () => ({ data: [] }) };
    customers = { update: async () => ({}) };
    setupIntents = { retrieve: async (id: string) => ({ id, payment_method: "pm_sepa" }) };
    subscriptionSchedules = {
      create: async (params: Record<string, unknown>) => {
        s.schedules.push(params);
        return { id: `sub_sched_${s.schedules.length}_${Math.random().toString(36).slice(2, 8)}`, subscription: null };
      },
    };
  }
  return { default: FakeStripe };
});
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })), sendToCustomer: vi.fn(async () => ({ sent: 0 })) }));

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { createOffer } from "@/lib/offers";
import { createScheduleForOffer, keptInvoiceItems } from "@/lib/billing";
import { startOnboarding } from "@/lib/onboarding";
import { contractCancelInfo } from "@/lib/vertrag-kuendigung";
import { abrechnungsplan, anteilCent } from "@/lib/abrechnungstag";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

type Item = { quantity: number; price_data: { product: string; unit_amount: number; recurring?: { interval: string } }; tax_rates?: string[] };
type AddItem = Item & { period: { start: { type: string; timestamp: number }; end: { type: string; timestamp: number } }; metadata: Record<string, string> };
type Phase = { items: Item[]; add_invoice_items?: AddItem[]; trial?: boolean; trial_end?: number; duration?: unknown; metadata?: Record<string, string> };
type Params = {
  start_date: number | "now";
  billing_mode: { type: string };
  metadata: Record<string, string>;
  default_settings: { collection_method: string; default_payment_method?: string; invoice_settings?: { days_until_due?: number } };
  phases: Phase[];
};

const uid = () => Math.random().toString(36).slice(2, 8);
const noon = (iso: string) => Math.floor(new Date(`${iso}T12:00:00Z`).getTime() / 1000);
/** Erster des übernächsten Monats: sicher in der Zukunft, Abrechnungstag 15 liegt danach. */
function zukunftErster(): string {
  const [y, m] = addDaysIso(berlinTodayIso(), 40).split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

const contacts: string[] = [];
const offers: string[] = [];
const customers: string[] = [];

async function angebot(extra: Partial<Parameters<typeof createOffer>[1]> = {}) {
  const tag = uid();
  const contact = await prisma.salesContact.create({ data: { name: `Abrechnung ${tag}`, email: `abr-${tag}@example.test` } });
  contacts.push(contact.id);
  const offer = await createOffer(
    { salesContactId: contact.id },
    {
      contactName: "Anna Abrechnung",
      company: `Agentur ${tag}`,
      email: `anna-${tag}@example.test`,
      term: "12m",
      products: [{ name: "TKV-Katze", dailyBudget: 30 }],
      startDate: zukunftErster(),
      customerChoice: false,
      abschlussBonus: 0,
      ...extra,
    },
    null,
  );
  offers.push(offer.id);
  // Annahme und Zahlung wie nach dem Checkout (Kunde in Stripe vorhanden)
  return prisma.offer.update({ where: { id: offer.id }, data: { status: "accepted", acceptedAt: new Date(), stripeCustomerId: `cus_${tag}` } });
}

const checkout = (id: string) => ({ id: `cs_${id}`, mode: "setup", setup_intent: "seti_1", customer: null }) as unknown as Stripe.Checkout.Session;
const letzterZeitplan = () => s.schedules[s.schedules.length - 1] as unknown as Params;

describe("Abrechnungstag: Angebot → Stripe-Zeitplan → Kundenkonto", () => {
  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await prisma.onboarding.deleteMany({ where: { offerId: { in: offers } } }).catch(() => {});
    for (const id of customers) await cleanupCustomer(id);
    await prisma.offer.deleteMany({ where: { id: { in: offers } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } });
  });
  beforeEach(() => {
    s.schedules = [];
  });

  it("speichert Abrechnungstag und kostenlosen Start am Angebot, prüft 1 bis 28", async () => {
    const o = await angebot({ billingDay: 15, billingFreeStart: true });
    expect(o).toMatchObject({ billingDay: 15, billingFreeStart: true });
    const ohne = await angebot({ billingDay: null, billingFreeStart: true });
    expect(ohne).toMatchObject({ billingDay: null, billingFreeStart: false });
    await expect(angebot({ billingDay: 31 })).rejects.toThrow(/zwischen 1 und 28/);
  });

  it("Start in der Zukunft, Abrechnung am 15., gratis: Abo beginnt am 15., keine Testphase, keine anteilige Rechnung", async () => {
    const o = await angebot({ billingDay: 15, billingFreeStart: true });
    await createScheduleForOffer(o.id, checkout(o.id));
    const p = letzterZeitplan();
    const start = o.startDate!.toISOString().slice(0, 10);
    const first = `${start.slice(0, 8)}15`;
    expect(p.start_date).toBe(noon(first));
    expect(p.billing_mode).toEqual({ type: "flexible" });
    expect(p.metadata).toMatchObject({ pg_billing_day: "15", pg_first_billing: first, pg_free_start: "1" });
    expect(p.default_settings).toMatchObject({ collection_method: "charge_automatically", default_payment_method: "pm_sepa" });
    for (const ph of p.phases) {
      expect(ph.add_invoice_items).toBeUndefined();
      expect(ph.trial).toBeUndefined();
      expect(ph.trial_end).toBeUndefined();
    }
    expect(JSON.stringify(p)).not.toMatch(/trial|test/i);
  });

  it("ohne Haken: anteilige Positionen bis zum Abrechnungstag auf der ersten Rechnung, mit Zeitraum und Steuer", async () => {
    const o = await angebot({ billingDay: 15, billingFreeStart: false });
    await createScheduleForOffer(o.id, checkout(o.id));
    const p = letzterZeitplan();
    const start = o.startDate!.toISOString().slice(0, 10);
    const first = `${start.slice(0, 8)}15`;
    expect(p.start_date).toBe(noon(first));
    expect(p.metadata.pg_free_start).toBe("0");
    const add = p.phases[0].add_invoice_items!;
    expect(add.map((a) => a.price_data.product)).toEqual(p.phases[0].items.map((i) => i.price_data.product));
    const total = p.phases[0].items.reduce((sum, i) => sum + i.price_data.unit_amount * i.quantity, 0);
    const plan = abrechnungsplan({ startIso: start, billingDay: 15 })!;
    expect(add.reduce((sum, a) => sum + a.price_data.unit_amount, 0)).toBe(anteilCent(total, plan));
    for (const a of add) {
      expect(a.quantity).toBe(1);
      expect(a.price_data.recurring).toBeUndefined();
      expect(a.tax_rates).toEqual(["txr_19"]);
      expect(a.period).toEqual({ start: { type: "timestamp", timestamp: noon(start) }, end: { type: "timestamp", timestamp: noon(`${start.slice(0, 8)}14`) } });
      expect(a.metadata.pg_kind).toBe("anteil_bis_abrechnungstag");
    }
    // Folgephasen ohne einmalige Positionen
    expect(p.phases.slice(1).every((ph) => !ph.add_invoice_items)).toBe(true);
  });

  it("mit Startpreis: Anteil nach dem Startpreis, Startpreis-Monate ab dem Abrechnungstag", async () => {
    const o = await angebot({ billingDay: 15, introMonthlyFee: 500, introMonths: 3 });
    await createScheduleForOffer(o.id, checkout(o.id));
    const p = letzterZeitplan();
    expect(p.phases).toHaveLength(2);
    expect(p.phases[0].duration).toEqual({ interval: "month", interval_count: 3 });
    const introTotal = p.phases[0].items.reduce((sum, i) => sum + i.price_data.unit_amount * i.quantity, 0);
    expect(introTotal).toBe(500 * 100);
    const plan = abrechnungsplan({ startIso: o.startDate!.toISOString().slice(0, 10), billingDay: 15 })!;
    expect(p.phases[0].add_invoice_items!.reduce((sum, a) => sum + a.price_data.unit_amount, 0)).toBe(anteilCent(introTotal, plan));
  });

  it("Abrechnungstag gleich Starttag: Zeitplan wie bisher (ohne Abrechnungstag)", async () => {
    const gleich = await angebot({ billingDay: 1, billingFreeStart: true });
    await createScheduleForOffer(gleich.id, checkout(gleich.id));
    const mitTag = letzterZeitplan();
    const ohne = await angebot({ billingDay: null });
    await createScheduleForOffer(ohne.id, checkout(ohne.id));
    const bisher = letzterZeitplan();
    expect(mitTag.start_date).toBe(Math.floor(gleich.startDate!.getTime() / 1000));
    expect(mitTag.metadata.pg_billing_day).toBeUndefined();
    expect(mitTag.phases.every((ph) => !ph.add_invoice_items)).toBe(true);
    const ohneIds = (p: Params) => ({ ...p, customer: "", metadata: { ...p.metadata, offer_id: "", offer_number: "", sales_contact_id: "" }, phases: p.phases.map((ph) => ({ ...ph, metadata: {} })), default_settings: { ...p.default_settings, description: "" } });
    expect(ohneIds(mitTag)).toEqual(ohneIds(bisher));
  });

  it("Überweisung (customer_balance): gleicher Anker, Rechnung mit Zahlungsziel, Anteil auf der ersten Rechnung", async () => {
    const o = await angebot({ billingDay: 15, billingFreeStart: false, allowBankTransfer: true });
    await prisma.offer.update({ where: { id: o.id }, data: { zahlweise: "ueberweisung" } });
    await createScheduleForOffer(o.id, null, { ueberweisung: { days: 14 } });
    const p = letzterZeitplan();
    const start = o.startDate!.toISOString().slice(0, 10);
    expect(p.start_date).toBe(noon(`${start.slice(0, 8)}15`));
    expect(p.default_settings).toMatchObject({ collection_method: "send_invoice", invoice_settings: { days_until_due: 14 } });
    expect(p.default_settings.default_payment_method).toBeUndefined();
    expect(p.phases[0].add_invoice_items?.length).toBeGreaterThan(0);
  });

  it("Neuschreiben des Zeitplans (Zusatzmodul vor dem Start, Vertragsende) behält die anteiligen Positionen", () => {
    const kept = keptInvoiceItems({
      add_invoice_items: [
        {
          price: { id: "price_anteil" } as Stripe.Price,
          quantity: 1,
          tax_rates: [{ id: "txr_19" } as Stripe.TaxRate],
          period: { start: { type: "timestamp", timestamp: 100 }, end: { type: "timestamp", timestamp: 200 } },
          metadata: { pg_kind: "anteil_bis_abrechnungstag" },
          discountable: true,
          discounts: [],
        },
      ],
    });
    expect(kept).toEqual({
      add_invoice_items: [
        {
          price: "price_anteil",
          quantity: 1,
          tax_rates: ["txr_19"],
          period: { start: { type: "timestamp", timestamp: 100 }, end: { type: "timestamp", timestamp: 200 } },
          metadata: { pg_kind: "anteil_bis_abrechnungstag" },
        },
      ],
    });
    expect(keptInvoiceItems({ add_invoice_items: [] })).toEqual({});
  });

  it("Annahme übernimmt Abrechnungstag und ersten Abrechnungstag ins Kundenkonto, Leads starten am Start", async () => {
    const o = await angebot({ billingDay: 15, billingFreeStart: true });
    await prisma.offer.update({ where: { id: o.id }, data: { stripeCustomerId: null } });
    const c = await makeCustomer();
    customers.push(c.id);
    const r = await startOnboarding(o.id, { customerId: c.id });
    expect(r.ok).toBe(true);
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    const start = o.startDate!.toISOString().slice(0, 10);
    expect(after.billingDay).toBe(15);
    expect(after.billingStart?.toISOString().slice(0, 10)).toBe(`${start.slice(0, 8)}15`);
    // Betreuung, Leads und Kampagne laufen ab dem Start, nicht ab dem Abrechnungstag
    expect(after.retainerStart?.toISOString().slice(0, 10)).toBe(start);
    const ob = await prisma.onboarding.findUniqueOrThrow({ where: { customerId: c.id } });
    expect(ob.startDate?.toISOString().slice(0, 10)).toBe(start);
  });
  it("Kündigung zum Ende des Abrechnungsmonats richtet sich nach dem Abrechnungstag", async () => {
    const d = (iso: string) => new Date(`${iso}T12:00:00Z`);
    const mit = await makeCustomer({ retainerStart: d("2027-01-01"), billingDay: 15, billingStart: d("2027-01-15") });
    const ohne = await makeCustomer({ retainerStart: d("2027-01-01") });
    customers.push(mit.id, ohne.id);
    const heute = d("2027-03-20");
    const a = await contractCancelInfo(mit.id, heute);
    const b = await contractCancelInfo(ohne.id, heute);
    expect(a?.next).toMatchObject({ effectiveIso: "2027-04-14", reason: "abrechnungsmonat" });
    expect(a?.startIso).toBe("2027-01-01");
    expect(b?.next).toMatchObject({ effectiveIso: "2027-03-31", reason: "abrechnungsmonat" });
  });
});
