// Kauf mit 1 € Setup plus Abo (Durchklick vor dem ersten Live-Kauf, 17.11.2026): Angebot annehmen, Bezahlseite,
// Webhook (simuliert, Stripe gemockt), Abo-Zeitplan mit Zahlungsart, Onboarding mit Login. Dazu „Später zahlen“.
// 1 € Setup mit Abschlussbonus (Standard 300 €, gedeckelt auf das Setup) ergäbe eine Bezahlseite über 0 €; Stripe
// sammelt dann keine Zahlungsart ein. Seit 4cf9028: unter dem Mindestbetrag nur Zahlungsart (Modus „setup“), Bonus
// vermerkt. Dieser Test prüft den ganzen Weg bis Onboarding und Login sowie „Später zahlen“ (Ergänzung zu checkout-ein-euro).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Params = Record<string, unknown> & { metadata?: Record<string, string> };
const st = vi.hoisted(() => ({ sessions: [] as Params[], coupons: [] as Params[], schedules: [] as Params[], customerUpdates: [] as Params[] }));

vi.mock("stripe", () => {
  class FakeStripe {
    products = {
      search: async () => ({ data: [] }),
      create: async (p: { metadata: { pg_key: string } }) => ({ id: `prod_${p.metadata.pg_key}` }),
    };
    // keine Tax-Registrierung (wie im Live-Konto): fester Satz 19 %
    tax = { registrations: { list: async () => ({ data: [] }) } };
    taxRates = { list: async () => ({ data: [{ id: "txr_19", metadata: { pg_key: "ust19" } }] }) };
    accounts = { retrieveCurrent: async () => ({ settings: { invoices: { default_account_tax_ids: ["txi_1"] } } }) };
    taxIds = { list: async () => ({ data: [] }) };
    customers = {
      create: async () => ({ id: `cus_${Math.random().toString(36).slice(2, 8)}` }),
      update: async (_id: string, p: Params) => {
        st.customerUpdates.push(p);
        return {};
      },
    };
    coupons = {
      create: async (p: Params) => {
        st.coupons.push(p);
        return { id: `coupon_${st.coupons.length}` };
      },
    };
    paymentIntents = { retrieve: async (id: string) => ({ id, payment_method: "pm_karte" }) };
    setupIntents = { retrieve: async (id: string) => ({ id, payment_method: "pm_sepa" }) };
    subscriptionSchedules = {
      create: async (p: Params) => {
        st.schedules.push(p);
        return { id: `sub_sched_${st.schedules.length}_${Math.random().toString(36).slice(2, 8)}`, subscription: null };
      },
    };
    checkout = {
      sessions: {
        create: async (p: Params) => {
          st.sessions.push(p);
          return { id: `cs_e${st.sessions.length}_${Math.random().toString(36).slice(2, 6)}`, url: `https://checkout.stripe.test/${st.sessions.length}` };
        },
      },
    };
  }
  return { default: FakeStripe };
});
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })), sendToCustomer: vi.fn(async () => ({ sent: 0 })) }));

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { acceptOffer, createOffer } from "@/lib/offers";
import { createCheckoutForOffer } from "@/lib/billing";
import { handleStripeEvent } from "@/lib/billing-webhook";
import { setzeErinnerungPerToken } from "@/lib/angebot-zahlungserinnerung-server";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const today = berlinTodayIso();
const contacts: string[] = [];
const emails: string[] = [];

async function offer1Euro(opts: { bonus?: number; payLater?: boolean; startIn?: number; setup?: number } = {}) {
  const tag = uid();
  const contact = await prisma.salesContact.create({ data: { name: `Agentur Euro ${tag}`, email: `euro-${tag}@example.test` } });
  contacts.push(contact.id);
  const email = `klara-${tag}@example.test`;
  emails.push(email);
  return createOffer(
    { salesContactId: contact.id },
    {
      contactName: "Klara Kaufmann",
      company: `Agentur Euro ${tag}`,
      email,
      term: "12m",
      products: [{ name: "TKV-Katze", dailyBudget: 30 }],
      setupOverride: opts.setup ?? 1,
      startDate: addDaysIso(today, opts.startIn ?? 20),
      allowPayLater: opts.payLater ?? false,
      abschlussBonus: opts.bonus ?? 0,
      abschlussBonusBis: opts.bonus ? addDaysIso(today, 1) : null,
    },
    null,
  );
}

const accept = (token: string) =>
  acceptOffer(token, { name: "Klara Kaufmann", ip: null, agent: "vitest", termsAccepted: true, business: { company: "Agentur Euro GmbH", confirmed: true } });

function completedEvent(
  offerId: string,
  sessionId: string,
  mode: "payment" | "setup",
  metadata: Record<string, string>,
  type: "checkout.session.completed" | "checkout.session.async_payment_failed" = "checkout.session.completed",
  paymentStatus?: string,
): Stripe.Event {
  return {
    id: `evt_${uid()}${uid()}`,
    type,
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        mode,
        client_reference_id: offerId,
        customer: null,
        payment_status: paymentStatus ?? (mode === "payment" ? "paid" : "no_payment_required"),
        payment_intent: mode === "payment" ? "pi_1" : null,
        setup_intent: mode === "setup" ? "seti_1" : null,
        subscription: null,
        amount_total: mode === "payment" ? 119 : 0,
        metadata,
        customer_details: { email: null },
      },
    },
  } as unknown as Stripe.Event;
}

describe("Kauf: 1 € Setup plus Abo", () => {
  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
  });
  beforeEach(() => {
    st.sessions = [];
    st.coupons = [];
    st.schedules = [];
    st.customerUpdates = [];
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const offers = await prisma.offer.findMany({ where: { salesContactId: { in: contacts } }, select: { id: true } });
    const obs = await prisma.onboarding.findMany({ where: { offerId: { in: offers.map((o) => o.id) } }, select: { customerId: true } });
    await prisma.onboarding.deleteMany({ where: { offerId: { in: offers.map((o) => o.id) } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => {});
    await prisma.salesTask.deleteMany({ where: { contactId: { in: contacts } } }).catch(() => {});
    await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
    await prisma.customer.deleteMany({ where: { id: { in: obs.map((o) => o.customerId) } } }).catch(() => {});
  });

  it("ohne Bonus: 1 € netto wird bezahlt (19 %), danach Abo ab Start mit der Zahlungsart und Login", async () => {
    const offer = await offer1Euro();
    expect(Number(offer.setupFee)).toBe(1);
    expect(offer.abschlussBonus).toBeNull();
    expect(await accept(offer.token)).toEqual({ ok: true });
    const res = await createCheckoutForOffer(offer.id, "sepa");
    expect(res).toEqual({ url: "https://checkout.stripe.test/1" });
    const s = st.sessions[0] as Params & { line_items: { price_data: { unit_amount: number }; tax_rates: string[] }[] };
    expect(s.mode).toBe("payment");
    expect(s.line_items[0].price_data.unit_amount).toBe(100);
    expect(s.line_items[0].tax_rates).toEqual(["txr_19"]);
    expect(s.discounts).toBeUndefined();
    expect(s.allowed_payment_method_types).toEqual(["sepa_debit"]);
    expect(s.tax_id_collection).toEqual({ enabled: true });

    const stored = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    await handleStripeEvent(completedEvent(offer.id, stored.stripeCheckoutSessionId!, "payment", s.metadata!));
    const paid = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(paid.paymentStatus).toBe("paid");
    expect(paid.stripeScheduleId).toMatch(/^sub_sched_1_/);
    const sched = st.schedules[0] as Params & { default_settings: { default_payment_method?: string }; phases: { items: { price_data: { unit_amount: number } }[] }[] };
    expect(sched.default_settings.default_payment_method).toBe("pm_karte");
    // Monatsgebühr (Software + Betreuung) = 1.000 € netto, ab Startdatum
    expect(sched.phases[0].items.reduce((a, i) => a + i.price_data.unit_amount, 0)).toBe(Number(offer.monthlyFee) * 100);
    expect(sched.start_date).toBe(Math.floor(offer.startDate!.getTime() / 1000));
    const ob = await prisma.onboarding.findUniqueOrThrow({ where: { offerId: offer.id } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: offer.email! } });
    expect(user.customerId).toBe(ob.customerId);
    expect(user.role).toBe("BUYER");
  });

  it("mit Abschlussbonus (deckt das ganze 1-€-Setup): keine 0-€-Zahlung, nur Zahlungsart (setup), Bonus vermerkt", async () => {
    const offer = await offer1Euro({ bonus: 300 });
    expect(Number(offer.abschlussBonus)).toBe(1); // gedeckelt auf das Setup
    expect(await accept(offer.token)).toEqual({ ok: true });
    expect(await createCheckoutForOffer(offer.id, "sepa")).toEqual({ url: "https://checkout.stripe.test/1" });
    const s = st.sessions[0];
    expect(s.mode).toBe("setup");
    expect(s.currency).toBe("eur");
    expect(s.line_items).toBeUndefined();
    expect(s.tax_id_collection).toBeUndefined();
    expect(st.coupons).toEqual([]);
    expect(s.metadata?.pg_bonus).toBe("100");

    const stored = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    await handleStripeEvent(completedEvent(offer.id, stored.stripeCheckoutSessionId!, "setup", s.metadata!));
    const paid = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(paid.paymentStatus).toBe("paid");
    expect(Number(paid.abschlussBonusGewaehrt)).toBe(1);
    expect((st.schedules[0] as { default_settings: { default_payment_method?: string } }).default_settings.default_payment_method).toBe("pm_sepa");
    expect(await prisma.onboarding.findUnique({ where: { offerId: offer.id } })).not.toBeNull();
  });

  it("Später zahlen: nur wenn erlaubt; Bonus gesichert, auch wenn nach der Frist gezahlt wird", async () => {
    const ohne = await offer1Euro({ startIn: 40 });
    expect(await accept(ohne.token)).toEqual({ ok: true });
    expect(await setzeErinnerungPerToken(ohne.token, addDaysIso(today, 3))).toMatchObject({ ok: false });

    const offer = await offer1Euro({ bonus: 300, payLater: true, startIn: 40 });
    expect(offer.allowPayLater).toBe(true);
    expect(await accept(offer.token)).toEqual({ ok: true });
    // zu spät (nach Start minus 14 Tage) und zu früh (heute) abgelehnt, dazwischen gespeichert
    expect(await setzeErinnerungPerToken(offer.token, addDaysIso(today, 30))).toMatchObject({ ok: false });
    expect(await setzeErinnerungPerToken(offer.token, today)).toMatchObject({ ok: false });
    expect(await setzeErinnerungPerToken(offer.token, addDaysIso(today, 5))).toMatchObject({ ok: true });
    // Kein Login vor der Zahlung
    expect(await prisma.onboarding.findUnique({ where: { offerId: offer.id } })).toBeNull();

    // Frist vorbei, aber rechtzeitig angenommen → Bonus gilt weiter
    const acc = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    await prisma.offer.update({ where: { id: offer.id }, data: { abschlussBonusBis: new Date(Date.now() - 60_000), acceptedAt: new Date(Date.now() - 3600_000) } });
    expect(acc.paymentReminderAt).not.toBeNull();
    expect(await createCheckoutForOffer(offer.id, "card")).toMatchObject({ url: expect.any(String) });
    const s = st.sessions[0];
    expect(s.mode).toBe("setup");
    expect(s.expires_at).toBeUndefined(); // gesicherter Bonus: Seite läuft nicht zur Frist ab
    expect(s.metadata?.pg_bonus).toBe("100");
  });

  it("geplatzte Lastschrift: Bonus gilt nicht als genutzt", async () => {
    const offer = await offer1Euro({ bonus: 300, setup: 500 });
    expect(await accept(offer.token)).toEqual({ ok: true });
    await createCheckoutForOffer(offer.id, "sepa");
    const s = st.sessions[0];
    expect(s.mode).toBe("payment");
    expect(s.metadata?.pg_bonus).toBe("30000");
    const sid = (await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } })).stripeCheckoutSessionId!;
    await handleStripeEvent(completedEvent(offer.id, sid, "payment", s.metadata!, "checkout.session.completed", "unpaid"));
    let o = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(o.paymentStatus).toBe("processing");
    expect(Number(o.abschlussBonusGewaehrt)).toBe(300);
    await handleStripeEvent(completedEvent(offer.id, sid, "payment", s.metadata!, "checkout.session.async_payment_failed", "unpaid"));
    o = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(o.paymentStatus).toBe("failed");
    expect(o.abschlussBonusGewaehrt).toBeNull();
  });
});
