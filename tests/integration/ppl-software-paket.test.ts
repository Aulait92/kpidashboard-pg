// Paket „Pay-per-Lead + Software“ (Ole, 19.11.2026), ganzer Weg Angebot → Annahme → Bezahlseite → Webhook → Onboarding,
// ohne echte Stripe-API. Geprüft: 349 € ohne Einrichtung, nur Zahlungsart hinterlegen (keine Rechnung jetzt), Abo nur mit
// Position „Software“, Kunde plan „ppl_software“ mit Software-Oberfläche, keine Kampagnen-Aufgaben, Pay-per-Lead-Aufgabe,
// Auftragsbestätigung ohne Werbebudget, gelieferte Pay-per-Lead-Leads gelten nie als „reiner Pay-per-Lead“.
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
      create: async () => ({ id: "cus_ppl" }),
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
import { NUR_PPL_WHERE, packageLabel } from "@/lib/customer-package";
import { onboardingChecklist, loadOnboarding } from "@/lib/onboarding";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const contacts: string[] = [];
const offers: string[] = [];

describe("Pay-per-Lead + Software: Angebot bis Onboarding", () => {
  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
    process.env.RESEND_API_KEY = "re_test";
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const ob = await prisma.onboarding.findMany({ where: { offerId: { in: offers } }, select: { customerId: true } });
    await prisma.onboarding.deleteMany({ where: { offerId: { in: offers } } }).catch(() => {});
    await prisma.salesTask.deleteMany({ where: { contactId: { in: contacts } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { customerId: { in: ob.map((o) => o.customerId) } } }).catch(() => {});
    await prisma.customer.deleteMany({ where: { id: { in: ob.map((o) => o.customerId) } } }).catch(() => {});
    await prisma.offer.deleteMany({ where: { id: { in: offers } } }).catch(() => {});
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
  });
  beforeEach(() => {
    s.created = 0;
    s.run = uid();
    s.sessions.clear();
    s.schedules = [];
    s.mails = [];
  });

  it("Angebot: 349 €, keine Einrichtung, keine Produkte, nur ohne Laufzeit oder 3 Monate", async () => {
    const tag = uid();
    const contact = await prisma.salesContact.create({ data: { name: `PPL ${tag}`, email: `ppl-${tag}@example.test` } });
    contacts.push(contact.id);
    const input = {
      contactName: "Paula Pay",
      company: `Agentur Pay ${tag}`,
      email: `paula-${tag}@example.test`,
      package: "ppl_software",
      term: "12m",
      products: [{ name: "TKV-Katze", dailyBudget: 30 }],
      startDate: addDaysIso(berlinTodayIso(), 10),
      abschlussBonus: 300,
      abschlussBonusBis: addDaysIso(berlinTodayIso(), 1),
      seats: 4,
    } as Parameters<typeof createOffer>[1];
    await expect(createOffer({ salesContactId: contact.id }, input, null)).rejects.toThrow(/ohne Mindestlaufzeit oder mit 3 Monaten/);
    const offer = await createOffer({ salesContactId: contact.id }, { ...input, term: "none" }, null);
    offers.push(offer.id);
    expect(offer.package).toBe("ppl_software");
    expect(Number(offer.setupFee)).toBe(0);
    expect(Number(offer.monthlyFee)).toBe(349);
    expect(Number(offer.softwareFee)).toBe(349);
    expect(offer.products).toEqual([]);
    expect(offer.abschlussBonus).toBeNull();
    expect(offer.customerChoosesProducts).toBe(false);
    expect([offer.seats, offer.seatsIncluded, Number(offer.seatMonthly)]).toEqual([4, 3, 49]);

    // Annahme mit 3 Monaten: Setup bleibt 0; 12 Monate abgelehnt
    const business = { company: `Agentur Pay ${tag}`, vatId: null, confirmed: true };
    expect((await acceptOffer(offer.token, { name: "Paula Pay", ip: null, agent: "vitest", termsAccepted: true, business, term: "12m" })).ok).toBe(false);
    expect(await acceptOffer(offer.token, { name: "Paula Pay", ip: null, agent: "vitest", termsAccepted: true, business, term: "3m" })).toEqual({ ok: true });
    const acc = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(acc.term).toBe("3m");
    expect(Number(acc.setupFee)).toBe(0);
    // Auftragsbestätigung
    const mail = s.mails.find((m) => String((m as { subject?: string }).subject ?? "").includes("Auftragsbestätigung")) as unknown as { text?: string; html?: string } | undefined;
    const mailText = String(mail?.text ?? mail?.html ?? "");
    expect(mailText).toMatch(/Pay-per-Lead \+ Software/);
    expect(mailText).toMatch(/Mindestlaufzeit 3 Monate/);
    expect(mailText).not.toMatch(/Werbebudget|Garantie/);
    expect(hatGedankenstrich(mailText.replace(/<[^>]+>/g, " "))).toBe(false);

    // Bezahlseite: nichts zu zahlen, nur Zahlungsart hinterlegen
    expect(await createCheckoutForOffer(offer.id, "sepa")).toEqual({ url: `https://checkout.stripe.test/cs_${s.run}_1` });
    const sess = s.sessions.get(`cs_${s.run}_1`)!;
    expect(sess.params.mode).toBe("setup");
    expect(sess.params.line_items).toBeUndefined();

    // Webhook: Abo nur mit Software (349 €) und 1 weiterem Verkäufer (49 €), Onboarding startet
    await handleStripeEvent({
      id: `evt_ppl_${uid()}`,
      type: "checkout.session.completed",
      data: { object: { id: sess.id, object: "checkout.session", mode: "setup", client_reference_id: offer.id, payment_status: "no_payment_required", amount_total: 0, customer: "cus_ppl", subscription: null, payment_intent: null, setup_intent: "seti_ppl", metadata: sess.metadata, customer_details: { email: null } } },
    } as unknown as Stripe.Event);
    expect(s.schedules).toHaveLength(1);
    const sp = s.schedules[0].params as { default_settings: { description: string }; phases: { items: { price_data: { product: string; unit_amount: number }; quantity: number }[] }[] };
    const items = sp.phases.at(-1)!.items.map((i) => [i.price_data.product, i.price_data.unit_amount, i.quantity]);
    expect(items).toEqual([
      ["prod_software", 34900, 1],
      ["prod_seat", 4900, 1],
    ]);
    expect(sp.default_settings.description).toBe(`Pay-per-Lead + Software, Angebot ${offer.number}`);

    const ob = await prisma.onboarding.findUniqueOrThrow({ where: { offerId: offer.id } });
    expect(ob.package).toBe("ppl_software");
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: ob.customerId }, include: { onboarding: { select: { id: true } } } });
    expect(c.plan).toBe("ppl_software");
    expect(c.newUi).toBe(true);
    expect(Number(c.retainerMonthly)).toBe(349);
    expect(packageLabel(c)).toBe("Pay-per-Lead + Software");
    // Nie als reiner Pay-per-Lead-Kunde (alle Nachrichten laufen wie bei Betreuung + Software)
    expect(await prisma.customer.count({ where: { id: c.id, ...NUR_PPL_WHERE } })).toBe(0);
    expect(await prisma.customer.count({ where: { id: c.id, plan: "ppl_software", onboarding: { is: null } } })).toBe(0);

    // Aufgaben: Pay-per-Lead-Bezug und Go-live, keine Kampagne
    const tasks = (await prisma.salesTask.findMany({ where: { contactId: contact.id }, select: { title: true } })).map((t) => t.title).join(" | ");
    expect(tasks).toMatch(/Pay-per-Lead-Bezug einrichten/);
    expect(tasks).not.toMatch(/Kampagne|Leadformular|Testlead/);

    // Checkliste ohne Meta und Kampagne
    const full = await loadOnboarding({ customerId: c.id });
    const keys = onboardingChecklist(full!, null).map((i) => i.key);
    expect(keys).not.toContain("metaAccess");
    expect(keys).not.toContain("campaign");
    expect(keys).toContain("whatsapp");
  });

  it("reiner Pay-per-Lead-Kunde bleibt gesperrt (Gegenprobe)", async () => {
    const c = await prisma.customer.create({ data: { name: `Nur PPL ${uid()}` } });
    try {
      expect(await prisma.customer.count({ where: { id: c.id, ...NUR_PPL_WHERE } })).toBe(1);
      await prisma.customer.update({ where: { id: c.id }, data: { plan: "ppl_software" } });
      expect(await prisma.customer.count({ where: { id: c.id, ...NUR_PPL_WHERE } })).toBe(0);
    } finally {
      await prisma.customer.delete({ where: { id: c.id } }).catch(() => {});
    }
  });
});
