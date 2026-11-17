// Angebot mit 1 € Setup (Live-Kauf 18.11.2026): ganzer Weg Angebot → Bezahlseite → Webhook → Onboarding,
// ohne echte Stripe-API. Geprüft: Positionen und Steuer, Gutschein/Abschlussbonus (Bonus deckt 1 € ab →
// nur Zahlungsart hinterlegen, sonst fragte Checkout keine Zahlungsart ab und die Monatsgebühr ließe sich
// nicht einziehen), Karte und SEPA, doppelte Webhooks, Webhook vor/nach der Rückkehr und geplatzte Lastschrift.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Params = Record<string, unknown> & { metadata: Record<string, string> };
type FakeSession = { id: string; url: string; status: "open" | "complete" | "expired"; expires_at: number; metadata: Record<string, string>; params: Params };
const s = vi.hoisted(() => ({
  sessions: new Map<string, FakeSession>(),
  created: 0,
  run: "a",
  coupons: [] as Record<string, unknown>[],
  schedules: [] as { params: Record<string, unknown>; key: string; id: string }[],
  canceled: [] as string[],
  defaultPm: [] as string[],
  mails: [] as { to: string | string[] }[],
}));

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
    customers = {
      create: async () => ({ id: "cus_euro" }),
      update: async (_id: string, p: { invoice_settings?: { default_payment_method?: string } }) => {
        if (p.invoice_settings?.default_payment_method) s.defaultPm.push(p.invoice_settings.default_payment_method);
        return {};
      },
    };
    coupons = {
      create: async (p: Record<string, unknown>) => {
        s.coupons.push(p);
        return { id: `co_${s.coupons.length}` };
      },
    };
    paymentIntents = { retrieve: async (id: string) => ({ id, payment_method: id.includes("sepa") ? "pm_sepa" : "pm_card" }) };
    setupIntents = { retrieve: async (id: string) => ({ id, payment_method: "pm_setup" }) };
    subscriptionSchedules = {
      create: async (params: Record<string, unknown>, opts: { idempotencyKey: string }) => {
        const hit = s.schedules.find((x) => x.key === opts.idempotencyKey);
        if (hit) return { id: hit.id, subscription: null };
        const id = `sub_sched_${s.run}_${s.schedules.length + 1}`;
        s.schedules.push({ params, key: opts.idempotencyKey, id });
        return { id, subscription: null };
      },
      retrieve: async (id: string) => ({ id, status: "not_started" }),
      cancel: async (id: string) => (s.canceled.push(id), { id, status: "canceled" }),
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
        retrieve: async (id: string) => {
          const sess = s.sessions.get(id);
          if (!sess) throw Object.assign(new Error("No such checkout.session"), { type: "StripeInvalidRequestError", code: "resource_missing" });
          return sess;
        },
        expire: async (id: string) => {
          const sess = s.sessions.get(id)!;
          sess.status = "expired";
          return sess;
        },
      },
    };
  }
  return { default: FakeStripe };
});
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })), sendToCustomer: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/lib/mail-guard", () => ({
  wasBlocked: () => false,
  MAIL_BLOCKED_TEXT: "gesperrt",
  mailClient: () => ({ emails: { send: async (m: { to: string | string[] }) => (s.mails.push(m), { error: null }) } }),
}));

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { acceptOffer, createOffer } from "@/lib/offers";
import { createCheckoutForOffer } from "@/lib/billing";
import { handleStripeEvent } from "@/lib/billing-webhook";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const contacts: string[] = [];
const offers: string[] = [];

/** Angebot wie im Admin: Setup abweichend 1 €, Abschlussbonus wie im Formular (Standard an, 300 €) oder aus. */
async function einEuroAngebot(opts: { bonus: number }) {
  const tag = uid();
  const contact = await prisma.salesContact.create({ data: { name: `Euro ${tag}`, email: `euro-${tag}@example.test` } });
  contacts.push(contact.id);
  const offer = await createOffer(
    { salesContactId: contact.id },
    {
      contactName: "Erik Euro",
      company: `Agentur Euro ${tag}`,
      email: `erik-${tag}@example.test`,
      term: "12m",
      products: [{ name: "TKV-Katze", dailyBudget: 30 }],
      startDate: addDaysIso(berlinTodayIso(), 20),
      setupOverride: 1,
      abschlussBonus: opts.bonus,
      abschlussBonusBis: opts.bonus ? addDaysIso(berlinTodayIso(), 1) : null,
    } as Parameters<typeof createOffer>[1],
    null,
  );
  offers.push(offer.id);
  expect(
    await acceptOffer(offer.token, { name: "Erik Euro", ip: null, agent: "vitest", termsAccepted: true, business: { company: `Agentur Euro ${tag}`, vatId: "DE123456789", confirmed: true } }),
  ).toEqual({ ok: true });
  const fresh = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
  expect(Number(fresh.setupFee)).toBe(1);
  return fresh;
}

let evt = 0;
function sessionEvent(
  type: "checkout.session.completed" | "checkout.session.async_payment_succeeded" | "checkout.session.async_payment_failed",
  sessionId: string,
  offerId: string,
  o: { mode: "payment" | "setup"; payment_status: "paid" | "unpaid" | "no_payment_required"; amount_total: number; pi?: string; id?: string },
): Stripe.Event {
  return {
    id: o.id ?? `evt_euro_${++evt}_${uid()}`,
    type,
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        mode: o.mode,
        client_reference_id: offerId,
        payment_status: o.payment_status,
        amount_total: o.amount_total,
        customer: "cus_euro",
        subscription: null,
        payment_intent: o.mode === "payment" ? (o.pi ?? "pi_card") : null,
        setup_intent: o.mode === "setup" ? "seti_euro" : null,
        metadata: s.sessions.get(sessionId)?.metadata ?? {},
        customer_details: { email: null },
      },
    },
  } as unknown as Stripe.Event;
}

/** Bezahlseite Nr. n dieses Tests (IDs je Test eindeutig, Webhooks ordnen über die Session-ID zu). */
const cs = (n: number) => `cs_${s.run}_${n}`;
const sched = (n: number) => `sub_sched_${s.run}_${n}`;
const csUrl = (n: number) => `https://checkout.stripe.test/${cs(n)}`;

const offerRow = (id: string) => prisma.offer.findUniqueOrThrow({ where: { id } });

describe("Checkout mit 1 € Setup", () => {
  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const ob = await prisma.onboarding.findMany({ where: { offerId: { in: offers } }, select: { customerId: true } });
    await prisma.onboarding.deleteMany({ where: { offerId: { in: offers } } }).catch(() => {});
    await prisma.customer.deleteMany({ where: { id: { in: ob.map((o) => o.customerId) } } }).catch(() => {});
    await prisma.offer.deleteMany({ where: { id: { in: offers } } }).catch(() => {});
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
  });
  beforeEach(() => {
    s.created = 0;
    s.run = Math.random().toString(36).slice(2, 7);
    s.sessions.clear();
    s.coupons = [];
    s.schedules = [];
    s.canceled = [];
    s.defaultPm = [];
  });

  it("ohne Bonus: Zahlung 1 € netto + 19 % USt., Rechnung, Zahlungsart für die Monatsgebühr gespeichert", async () => {
    const offer = await einEuroAngebot({ bonus: 0 });
    expect(offer.abschlussBonus).toBeNull();
    const res = await createCheckoutForOffer(offer.id, "sepa");
    expect(res).toEqual({ url: csUrl(1) });
    const p = s.sessions.get(cs(1))!.params as Params & {
      line_items: { price_data: { unit_amount: number; tax_behavior: string }; tax_rates: string[] }[];
      payment_intent_data: { setup_future_usage: string };
      invoice_creation: { enabled: boolean };
    };
    expect(p.mode).toBe("payment");
    expect(p.allowed_payment_method_types).toEqual(["sepa_debit"]);
    expect(p.line_items[0].price_data.unit_amount).toBe(100);
    expect(p.line_items[0].price_data.tax_behavior).toBe("exclusive");
    expect(p.line_items[0].tax_rates).toEqual(["txr_19"]);
    expect(p.discounts).toBeUndefined();
    expect(s.coupons).toHaveLength(0);
    expect(p.payment_intent_data.setup_future_usage).toBe("off_session");
    expect(p.invoice_creation.enabled).toBe(true);
    expect(p.tax_id_collection).toEqual({ enabled: true });
    expect(p.client_reference_id).toBe(offer.id);
    expect(p.success_url).toBe(`${process.env.APP_URL}/angebot/${offer.token}?zahlung=ok`);
    expect((await offerRow(offer.id)).paymentStatus).toBe("pending");
  });

  it("mit Abschlussbonus (Formular-Standard): kein 0-€-Checkout, sondern Zahlungsart hinterlegen (Modus setup)", async () => {
    const offer = await einEuroAngebot({ bonus: 300 });
    // Bonus wird beim Anlegen auf das Setup gedeckelt
    expect(Number(offer.abschlussBonus)).toBe(1);
    const res = await createCheckoutForOffer(offer.id, "card");
    expect(res).toEqual({ url: csUrl(1) });
    const p = s.sessions.get(cs(1))!.params;
    expect(p.mode).toBe("setup");
    expect(p.currency).toBe("eur");
    expect(p.allowed_payment_method_types).toEqual(["card"]);
    expect(p.line_items).toBeUndefined();
    expect(p.discounts).toBeUndefined();
    expect(p.tax_id_collection).toBeUndefined();
    expect(s.coupons).toHaveLength(0);
    // Bonus wird beim Webhook als gewährt vermerkt (ganzes Setup)
    expect(p.metadata.pg_bonus).toBe("100");

    await handleStripeEvent(sessionEvent("checkout.session.completed", cs(1), offer.id, { mode: "setup", payment_status: "no_payment_required", amount_total: 0 }));
    const after = await offerRow(offer.id);
    expect(after.paymentStatus).toBe("paid");
    expect(Number(after.abschlussBonusGewaehrt)).toBe(1);
    expect(after.stripeScheduleId).toBe(sched(1));
    // Zahlungsart aus der Einrichtung wird Standard für die Monatsgebühr
    expect(s.defaultPm).toContain("pm_setup");
    expect((s.schedules[0].params as { default_settings: { default_payment_method: string } }).default_settings.default_payment_method).toBe("pm_setup");
    expect(await prisma.onboarding.findUnique({ where: { offerId: offer.id } })).not.toBeNull();
  });

  it("Karte: Webhook zahlt, Zeitplan und Onboarding einmal; doppelter Webhook ändert nichts; danach keine zweite Bezahlseite", async () => {
    const offer = await einEuroAngebot({ bonus: 0 });
    await createCheckoutForOffer(offer.id, "card");
    // Rückkehr vor dem Webhook: Seite schon „complete“, Status noch pending → keine zweite Bezahlseite
    s.sessions.get(cs(1))!.status = "complete";
    expect(await createCheckoutForOffer(offer.id, "card")).toEqual({ error: "Die Zahlung ist bereits eingerichtet." });

    const ev = sessionEvent("checkout.session.completed", cs(1), offer.id, { mode: "payment", payment_status: "paid", amount_total: 119, pi: "pi_card" });
    await handleStripeEvent(ev);
    await handleStripeEvent(ev); // Stripe stellt erneut zu
    const after = await offerRow(offer.id);
    expect(after.paymentStatus).toBe("paid");
    expect(after.paidAt).not.toBeNull();
    expect(s.schedules).toHaveLength(1);
    expect(s.schedules[0].key).toBe(`offer-schedule-${offer.id}-${cs(1)}`);
    expect(s.defaultPm).toEqual(["pm_card"]);
    const phase = (s.schedules[0].params as { phases: { items: { price_data: { unit_amount: number } }[] }[] }).phases.at(-1)!;
    expect(phase.items.reduce((a, i) => a + i.price_data.unit_amount, 0)).toBe(Math.round(Number(after.monthlyFee) * 100));
    expect(await prisma.onboarding.count({ where: { offerId: offer.id } })).toBe(1);
    // Nach dem Webhook: erneuter Klick → bereits eingerichtet
    expect(await createCheckoutForOffer(offer.id, "card")).toEqual({ error: "Die Zahlung ist bereits eingerichtet." });
    expect(s.created).toBe(1);
  });

  it("SEPA: eingerichtet → Onboarding sofort, Bestätigung Tage später → bezahlt, kein zweiter Zeitplan", async () => {
    const offer = await einEuroAngebot({ bonus: 0 });
    await createCheckoutForOffer(offer.id, "sepa");
    await handleStripeEvent(sessionEvent("checkout.session.completed", cs(1), offer.id, { mode: "payment", payment_status: "unpaid", amount_total: 119, pi: "pi_sepa" }));
    let row = await offerRow(offer.id);
    expect(row.paymentStatus).toBe("processing");
    expect(row.paidAt).toBeNull();
    expect(await prisma.onboarding.count({ where: { offerId: offer.id } })).toBe(1);
    expect(s.defaultPm).toEqual(["pm_sepa"]);

    await handleStripeEvent(sessionEvent("checkout.session.async_payment_succeeded", cs(1), offer.id, { mode: "payment", payment_status: "paid", amount_total: 119, pi: "pi_sepa" }));
    row = await offerRow(offer.id);
    expect(row.paymentStatus).toBe("paid");
    expect(row.paidAt).not.toBeNull();
    expect(s.schedules).toHaveLength(1);
    expect(await prisma.onboarding.count({ where: { offerId: offer.id } })).toBe(1);
  });

  it("SEPA geplatzt: Zeitplan gestoppt, Kunde kann neu zahlen, neue Zahlung legt neuen Zeitplan an", async () => {
    const offer = await einEuroAngebot({ bonus: 0 });
    await createCheckoutForOffer(offer.id, "sepa");
    await handleStripeEvent(sessionEvent("checkout.session.completed", cs(1), offer.id, { mode: "payment", payment_status: "unpaid", amount_total: 119, pi: "pi_sepa" }));
    s.sessions.get(cs(1))!.status = "complete";
    await handleStripeEvent(sessionEvent("checkout.session.async_payment_failed", cs(1), offer.id, { mode: "payment", payment_status: "unpaid", amount_total: 119, pi: "pi_sepa" }));
    let row = await offerRow(offer.id);
    expect(row.paymentStatus).toBe("failed");
    expect(s.canceled).toEqual([sched(1)]);
    expect(row.stripeScheduleId).toBeNull();

    // Neuer Versuch (z. B. mit Karte): abgeschlossene, aber geplatzte Seite blockiert nicht
    expect(await createCheckoutForOffer(offer.id, "card")).toEqual({ url: csUrl(2) });
    await handleStripeEvent(sessionEvent("checkout.session.completed", cs(2), offer.id, { mode: "payment", payment_status: "paid", amount_total: 119, pi: "pi_card" }));
    row = await offerRow(offer.id);
    expect(row.paymentStatus).toBe("paid");
    expect(s.schedules.map((x) => x.key)).toEqual([`offer-schedule-${offer.id}-${cs(1)}`, `offer-schedule-${offer.id}-${cs(2)}`]);
    expect(row.stripeScheduleId).toBe(sched(2));
  });
});
