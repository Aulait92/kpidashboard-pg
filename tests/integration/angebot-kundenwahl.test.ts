// Kunde wählt Laufzeit und Startdatum bei der Annahme: Werte werden serverseitig
// neu berechnet, gespeichert und vom Checkout (Stripe gemockt) verwendet.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const stripeState = vi.hoisted(() => ({ sessions: [] as Record<string, unknown>[] }));

vi.mock("stripe", () => {
  const s = stripeState;
  class FakeStripe {
    products = {
      search: async () => ({ data: [] }),
      create: async (p: { metadata: { pg_key: string } }) => ({ id: `prod_${p.metadata.pg_key}` }),
    };
    tax = { registrations: { list: async () => ({ data: [{ id: "taxreg_1" }] }) } };
    customers = { create: async () => ({ id: `cus_${Math.random().toString(36).slice(2, 8)}` }), update: async () => ({}) };
    checkout = {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          s.sessions.push(params);
          return { id: `cs_${s.sessions.length}`, url: "https://checkout.stripe.test/x" };
        },
      },
    };
  }
  return { default: FakeStripe };
});

import { prisma } from "@/lib/prisma";
import { acceptOffer, createOffer } from "@/lib/offers";
import { createCheckoutForOffer } from "@/lib/billing";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const today = berlinTodayIso();
const accept = (token: string, extra: { term?: string; startDate?: string } = {}) =>
  acceptOffer(token, { name: "Karl Kunde", ip: "127.0.0.1", agent: "vitest", termsAccepted: true, ...extra });

describe("Angebot: Kunde wählt Laufzeit und Startdatum", () => {
  const contacts: string[] = [];
  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.OFFER_NUMBER_START;
    await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
  });
  beforeEach(() => {
    stripeState.sessions = [];
  });

  async function newOffer(extra: Record<string, unknown> = {}) {
    const contact = await prisma.salesContact.create({ data: { name: "Wahl Test", email: `wahl-${uid()}@example.test` } });
    contacts.push(contact.id);
    return createOffer(
      { salesContactId: contact.id },
      {
        contactName: "Karl Kunde",
        email: `karl-${uid()}@example.test`,
        term: "12m",
        products: [{ name: "Katzenversicherung", dailyBudget: 40 }],
        startDate: addDaysIso(today, 20),
        ...extra,
      },
      null,
    );
  }

  it("Standard: Wahl freigegeben; Annahme mit 3 Monaten + Start → gespeichert, Setup 1.990 €, Checkout mit 1.990 €", async () => {
    const offer = await newOffer();
    expect(offer.customerChoosesTerm).toBe(true);
    expect(offer.customerChoosesStart).toBe(true);
    expect(Number(offer.setupFee)).toBe(990);

    const start = addDaysIso(today, 30);
    expect(await accept(offer.token, { term: "3m", startDate: start })).toEqual({ ok: true });
    const saved = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(saved.status).toBe("accepted");
    expect(saved.term).toBe("3m");
    expect(Number(saved.setupFee)).toBe(1990);
    expect(saved.startDate?.toISOString().slice(0, 10)).toBe(start);
    expect(Number(saved.monthlyFee)).toBe(1000);

    const audit = await prisma.auditLog.findFirst({ where: { entityId: offer.id, action: "offer.accept" } });
    expect(audit?.details).toMatchObject({ term: "3m", startDate: start, setupFee: 1990 });
    const act = await prisma.salesActivity.findFirst({ where: { contactId: offer.salesContactId!, outcome: { contains: "angenommen" } } });
    expect(act?.outcome).toMatch(/3 Monate, Start/);

    const res = await createCheckoutForOffer(offer.id);
    expect(res).toEqual({ url: "https://checkout.stripe.test/x" });
    const items = stripeState.sessions[0].line_items as { price_data: { unit_amount: number } }[];
    expect(items[0].price_data.unit_amount).toBe(199000);
  });

  it("Manipulierte Werte werden abgelehnt und nichts gespeichert", async () => {
    const offer = await newOffer();
    expect(await accept(offer.token, { term: "24m" })).toMatchObject({ ok: false });
    expect(await accept(offer.token, { startDate: addDaysIso(today, 2) })).toMatchObject({ ok: false });
    expect(await accept(offer.token, { startDate: addDaysIso(today, 120) })).toMatchObject({ ok: false });
    const saved = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(saved.status).toBe("draft");
    expect(saved.term).toBe("12m");
    expect(Number(saved.setupFee)).toBe(990);
  });

  it("Sonderpreis sperrt die Laufzeit (Start bleibt wählbar); Schalter aus sperrt beides", async () => {
    const special = await newOffer({ setupOverride: 500 });
    expect(special.customerChoosesTerm).toBe(false);
    expect(special.customerChoosesStart).toBe(true);
    expect(await accept(special.token, { term: "none" })).toMatchObject({ ok: false });
    const start = addDaysIso(today, 14);
    expect(await accept(special.token, { term: "12m", startDate: start })).toEqual({ ok: true });
    const saved = await prisma.offer.findUniqueOrThrow({ where: { id: special.id } });
    expect(Number(saved.setupFee)).toBe(500);
    expect(saved.startDate?.toISOString().slice(0, 10)).toBe(start);

    const fixed = await newOffer({ customerChoice: false });
    expect(fixed.customerChoosesTerm).toBe(false);
    expect(fixed.customerChoosesStart).toBe(false);
    expect(await accept(fixed.token, { startDate: addDaysIso(today, 40) })).toMatchObject({ ok: false });
    expect(await accept(fixed.token)).toEqual({ ok: true });
  });

  it("Angebotsnummer startet bei OFFER_NUMBER_START", async () => {
    process.env.OFFER_NUMBER_START = "9141";
    const offer = await newOffer();
    const n = Number(offer.number.split("-")[2]);
    expect(offer.number.startsWith(`PG-${new Date().getFullYear()}-`)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(9141);
    const next = await newOffer();
    expect(Number(next.number.split("-")[2])).toBe(n + 1);
    delete process.env.OFFER_NUMBER_START;
  });
});
