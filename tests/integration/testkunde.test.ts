// Testangebot und Testkunde (Ole, 15.11.2026): 0 €, Annahme ohne Stripe (auch wenn Stripe aktiv ist),
// Onboarding startet sofort, Kunde als Test markiert, nicht in Buchungen/Zahlen, mit einem Klick löschbar.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const stripeState = vi.hoisted(() => ({ sessions: 0 }));
vi.mock("stripe", () => {
  class FakeStripe {
    checkout = { sessions: { create: async () => { stripeState.sessions++; return { id: "cs_x", url: "https://checkout.stripe.test/x" }; } } };
    customers = { create: async () => ({ id: "cus_x" }), update: async () => ({}) };
    products = { search: async () => ({ data: [] }), create: async () => ({ id: "prod_x" }) };
    tax = { registrations: { list: async () => ({ data: [] }) } };
  }
  return { default: FakeStripe };
});
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })), sendToCustomer: vi.fn(async () => ({ sent: 0 })) }));

import { prisma } from "@/lib/prisma";
import { acceptOffer, createOffer } from "@/lib/offers";
import { createCheckoutForOffer } from "@/lib/billing";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { loadBuchungSources, buildBuchungen } from "@/lib/admin-buchungen";
import { deleteTestCustomer } from "@/lib/testkunde";
import { makeCustomer, cleanupCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const contacts: string[] = [];
const extraCustomers: string[] = [];

describe("Testangebot und Testkunde", () => {
  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    for (const id of extraCustomers) await cleanupCustomer(id);
    await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
  });

  it("0 €, ohne Stripe angenommen, Onboarding startet, Testkunde nicht in Buchungen, löschbar", async () => {
    const contact = await prisma.salesContact.create({ data: { name: "Test Durchlauf", email: `test-${uid()}@example.test` } });
    contacts.push(contact.id);
    const email = `ole-test-${uid()}@example.test`;
    const offer = await createOffer(
      { salesContactId: contact.id },
      {
        contactName: "Ole Test",
        company: `Testagentur ${uid()}`,
        email,
        term: "12m",
        products: [{ name: "Katzenversicherung", dailyBudget: 40 }],
        startDate: addDaysIso(berlinTodayIso(), 10),
        annual: true,
        bestandModule: true,
        seats: 5,
        test: true,
      },
      null,
    );
    expect(offer.isTest).toBe(true);
    expect(Number(offer.setupFee)).toBe(0);
    expect(Number(offer.monthlyFee)).toBe(0);
    expect(Number(offer.seatMonthly)).toBe(0);
    expect(Number(offer.bestandMonthly)).toBe(0);
    expect(offer.annualPrepay).toBe(false);
    expect(offer.specialTerms).toMatch(/Testangebot/);

    expect(await acceptOffer(offer.token, { name: "Ole Test", ip: null, agent: "vitest", termsAccepted: true, business: { company: "Agentur Test", confirmed: true } })).toEqual({ ok: true });
    expect(stripeState.sessions).toBe(0);
    expect(await createCheckoutForOffer(offer.id)).toEqual({ error: "Testangebote laufen ohne Zahlung." });

    const ob = await prisma.onboarding.findUniqueOrThrow({ where: { offerId: offer.id }, include: { customer: true } });
    expect(ob.customer.isTest).toBe(true);
    const login = await prisma.user.findUnique({ where: { email } });
    expect(login?.customerId).toBe(ob.customerId);

    // Nicht in den Buchungen
    const rows = buildBuchungen(await loadBuchungSources());
    expect(rows.some((r) => r.customerId === ob.customerId)).toBe(false);
    expect(rows.some((r) => r.sourceId === offer.id)).toBe(false);

    // Echter Kunde lässt sich so nicht löschen
    const real = await makeCustomer();
    extraCustomers.push(real.id);
    expect(await deleteTestCustomer(real.id)).toMatchObject({ ok: false });

    // Testkunde löschen: Konto, Login und Testangebot weg, Vertriebskontakt bleibt
    expect(await deleteTestCustomer(ob.customerId)).toMatchObject({ ok: true });
    expect(await prisma.customer.findUnique({ where: { id: ob.customerId } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    expect(await prisma.offer.findUnique({ where: { id: offer.id } })).toBeNull();
    expect(await prisma.salesContact.findUnique({ where: { id: contact.id } })).not.toBeNull();
  });
});
