// Angebot ohne E-Mail (Go-live 15.11.2026): E-Mail ist beim Anlegen Pflicht. Fehlt sie bei einem
// älteren Angebot trotzdem, übernimmt das Onboarding nach der Zahlung die E-Mail aus dem
// Stripe-Checkout (customer_details.email). Geht gar nichts: Push und Aufgabe „Kein Login angelegt“.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ pushes: [] as { title: string; body: string }[], mails: [] as { to: string | string[] }[] }));
vi.mock("stripe", () => {
  class FakeStripe {
    checkout = { sessions: { create: async () => ({ id: "cs_x", url: "https://checkout.stripe.test/x" }) } };
    customers = { create: async () => ({ id: "cus_x" }), update: async () => ({}) };
    products = { search: async () => ({ data: [] }), create: async () => ({ id: "prod_x" }) };
    tax = { registrations: { list: async () => ({ data: [] }) } };
  }
  return { default: FakeStripe };
});
// Abo-Zeitplan ist nicht Gegenstand dieses Tests
vi.mock("@/lib/billing", async (orig) => ({
  ...(await orig<typeof import("@/lib/billing")>()),
  createScheduleForOffer: vi.fn(async () => undefined),
  cancelScheduleForOffer: vi.fn(async () => undefined),
}));
vi.mock("@/lib/push", () => ({
  sendToAdmins: vi.fn(async (p: { title: string; body: string }) => (st.pushes.push(p), { sent: 0, removed: 0, errors: [] })),
  sendToCustomer: vi.fn(async () => ({ sent: 0 })),
}));
vi.mock("@/lib/mail-guard", () => ({
  wasBlocked: () => false,
  MAIL_BLOCKED_TEXT: "gesperrt",
  mailClient: () => ({ emails: { send: async (m: { to: string | string[] }) => (st.mails.push(m), { error: null }) } }),
}));

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { acceptOffer, createOffer } from "@/lib/offers";
import { handleStripeEvent } from "@/lib/billing-webhook";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const contacts: string[] = [];
const customers: string[] = [];

async function acceptedOfferWithoutEmail(tag: string) {
  // Kontakt ohne echte E-Mail (Platzhalter wie bei LinkedIn-Kontakten)
  const contact = await prisma.salesContact.create({ data: { name: `Ohne Mail ${tag}`, email: `linkedin-${tag}@ohne-email.invalid` } });
  contacts.push(contact.id);
  const offer = await createOffer(
    { salesContactId: contact.id },
    { contactName: "Olga Ohnemail", company: `Agentur ${tag}`, email: `vorher-${tag}@example.test`, term: "12m", products: [{ name: "TKV-Katze", dailyBudget: 30 }], startDate: addDaysIso(berlinTodayIso(), 20) },
    null,
  );
  expect(await acceptOffer(offer.token, { name: "Olga Ohnemail", ip: null, agent: "vitest", termsAccepted: true, business: { company: `Agentur ${tag}`, confirmed: true } })).toEqual({ ok: true });
  // Altes Angebot aus der Zeit vor dem Pflichtfeld: keine E-Mail im Angebot und am Kontakt
  await prisma.offer.update({ where: { id: offer.id }, data: { email: null, stripeCheckoutSessionId: `cs_${tag}`, paymentStatus: "pending" } });
  return { offer, contact };
}

function checkoutCompleted(tag: string, offerId: string, email: string | null): Stripe.Event {
  return {
    id: `evt_${tag}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${tag}`,
        object: "checkout.session",
        mode: "payment",
        client_reference_id: offerId,
        payment_status: "paid",
        amount_total: 0,
        customer: null,
        subscription: null,
        metadata: {},
        customer_details: email ? { email } : { email: null },
      },
    },
  } as unknown as Stripe.Event;
}

describe("Angebot ohne E-Mail", () => {
  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.RESEND_API_KEY = "re_test";
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.RESEND_API_KEY;
    const obs = await prisma.onboarding.findMany({ where: { salesContactId: { in: contacts } }, select: { customerId: true } });
    customers.push(...obs.map((o) => o.customerId));
    await prisma.onboarding.deleteMany({ where: { salesContactId: { in: contacts } } });
    await prisma.user.deleteMany({ where: { customerId: { in: customers } } });
    await prisma.salesTask.deleteMany({ where: { contactId: { in: contacts } } });
    await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
    for (const id of customers) await prisma.customer.delete({ where: { id } }).catch(() => {});
  });

  it("Angebot anlegen: E-Mail ist Pflicht und wird normalisiert", async () => {
    const contact = await prisma.salesContact.create({ data: { name: `Pflicht ${uid()}`, email: `pflicht-${uid()}@ohne-email.invalid` } });
    contacts.push(contact.id);
    const base = { contactName: "Paula Pflicht", term: "12m" as const, products: [{ name: "TKV-Katze", dailyBudget: 30 }], startDate: addDaysIso(berlinTodayIso(), 20) };
    await expect(createOffer({ salesContactId: contact.id }, base, null)).rejects.toThrow(/E-Mail/);
    await expect(createOffer({ salesContactId: contact.id }, { ...base, email: "  " }, null)).rejects.toThrow(/E-Mail/);
    await expect(createOffer({ salesContactId: contact.id }, { ...base, email: "paula@" }, null)).rejects.toThrow(/E-Mail/);
    await expect(createOffer({ salesContactId: contact.id }, { ...base, email: contact.email }, null)).rejects.toThrow(/E-Mail/);
    const offer = await createOffer({ salesContactId: contact.id }, { ...base, email: " Paula.Pflicht+1@Example.TEST " }, null);
    expect(offer.email).toBe("paula.pflicht+1@example.test");
  });

  it("fehlt die E-Mail, kommt sie aus dem Stripe-Checkout: Login und Willkommens-Mail", async () => {
    const tag = uid();
    const { offer, contact } = await acceptedOfferWithoutEmail(tag);
    st.pushes = [];
    st.mails = [];
    await handleStripeEvent(checkoutCompleted(tag, offer.id, ` Kasse+${tag}@Example.test `));

    const ob = await prisma.onboarding.findUniqueOrThrow({ where: { offerId: offer.id } });
    const login = await prisma.user.findUnique({ where: { email: `kasse+${tag}@example.test` } });
    expect(login).toMatchObject({ role: "BUYER", customerId: ob.customerId });
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } })).email).toBe(`kasse+${tag}@example.test`);
    expect(st.mails.some((m) => [m.to].flat().includes(`kasse+${tag}@example.test`))).toBe(true);
    expect(st.pushes.some((p) => p.title.startsWith("🚀 Onboarding gestartet"))).toBe(true);
    expect(st.pushes.some((p) => p.title.includes("Kein Login"))).toBe(false);
    expect(await prisma.salesTask.count({ where: { contactId: contact.id, title: { startsWith: "Kein Login" } } })).toBe(0);
  });

  it("ohne jede E-Mail: Push und Aufgabe „Kein Login angelegt“ statt „Onboarding gestartet“", async () => {
    const tag = uid();
    const { offer, contact } = await acceptedOfferWithoutEmail(tag);
    st.pushes = [];
    await handleStripeEvent(checkoutCompleted(tag, offer.id, null));

    const ob = await prisma.onboarding.findUniqueOrThrow({ where: { offerId: offer.id } });
    expect(await prisma.user.count({ where: { customerId: ob.customerId } })).toBe(0);
    expect(st.pushes.some((p) => p.title.startsWith("⚠️ Kein Login angelegt"))).toBe(true);
    expect(st.pushes.some((p) => p.title.startsWith("🚀 Onboarding gestartet"))).toBe(false);
    expect(await prisma.salesTask.count({ where: { contactId: contact.id, title: { startsWith: "Kein Login angelegt" } } })).toBe(1);
  });
});
