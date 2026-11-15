// Doppelzahlung verhindern (Go-live 15.11.2026): „Zahlung einrichten“ mehrfach geklickt → die offene
// Bezahlseite wird wiederverwendet (gleiche Positionen und Zahlart, nicht abgelaufen). Sonst wird
// die alte per expire geschlossen, bevor eine neue entsteht. Bezahlte alte Seite → keine neue.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type FakeSession = { id: string; url: string; status: "open" | "complete" | "expired"; expires_at: number; metadata: Record<string, string>; params: Record<string, unknown> };
const s = vi.hoisted(() => ({ sessions: new Map<string, FakeSession>(), created: 0, expired: [] as string[] }));

vi.mock("stripe", () => {
  class FakeStripe {
    products = {
      search: async () => ({ data: [] }),
      create: async (p: { metadata: { pg_key: string } }) => ({ id: `prod_${p.metadata.pg_key}` }),
    };
    // keine Tax-Registrierung → fester Satz 19 % (bleibt so)
    tax = { registrations: { list: async () => ({ data: [] }) } };
    taxRates = { list: async () => ({ data: [{ id: "txr_19", metadata: { pg_key: "ust19" } }] }) };
    accounts = { retrieveCurrent: async () => ({ settings: { invoices: { default_account_tax_ids: [] } } }) };
    taxIds = { list: async () => ({ data: [] }) };
    customers = { create: async () => ({ id: "cus_doppelt" }), update: async () => ({}) };
    checkout = {
      sessions: {
        create: async (params: { metadata: Record<string, string> }) => {
          s.created++;
          const id = `cs_d${s.created}`;
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
          if (sess.status !== "open") throw Object.assign(new Error("not open"), { type: "StripeInvalidRequestError" });
          sess.status = "expired";
          s.expired.push(id);
          return sess;
        },
      },
    };
  }
  return { default: FakeStripe };
});
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })), sendToCustomer: vi.fn(async () => ({ sent: 0 })) }));

import { prisma } from "@/lib/prisma";
import { acceptOffer, createOffer } from "@/lib/offers";
import { createCheckoutForOffer } from "@/lib/billing";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const contacts: string[] = [];

async function acceptedOffer() {
  const tag = uid();
  const contact = await prisma.salesContact.create({ data: { name: `Doppelt ${tag}`, email: `doppelt-${tag}@example.test` } });
  contacts.push(contact.id);
  const offer = await createOffer(
    { salesContactId: contact.id },
    { contactName: "Dora Doppelt", email: `dora-${tag}@example.test`, term: "12m", products: [{ name: "TKV-Katze", dailyBudget: 30 }], startDate: addDaysIso(berlinTodayIso(), 20) },
    null,
  );
  expect(await acceptOffer(offer.token, { name: "Dora Doppelt", ip: null, agent: "vitest", termsAccepted: true, business: { company: `Agentur ${tag}`, confirmed: true } })).toEqual({ ok: true });
  return offer;
}

const stored = async (id: string) => (await prisma.offer.findUniqueOrThrow({ where: { id } })).stripeCheckoutSessionId;

describe("Checkout: keine doppelte Bezahlseite", () => {
  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
  });
  beforeEach(() => {
    s.created = 0;
    s.expired = [];
  });

  it("zweiter Klick mit gleicher Zahlart: dieselbe offene Bezahlseite, keine neue", async () => {
    const offer = await acceptedOffer();
    const first = await createCheckoutForOffer(offer.id, "sepa");
    expect(first).toEqual({ url: "https://checkout.stripe.test/cs_d1" });
    expect(await createCheckoutForOffer(offer.id, "sepa")).toEqual(first);
    expect(await createCheckoutForOffer(offer.id, "sepa")).toEqual(first);
    expect(s.created).toBe(1);
    expect(s.expired).toEqual([]);
    expect(await stored(offer.id)).toBe("cs_d1");
    // Stripe-Steuer unverändert: fester Satz 19 %, kein automatic_tax
    const params = s.sessions.get("cs_d1")!.params as { automatic_tax?: unknown; line_items: { tax_rates: string[] }[] };
    expect(params.automatic_tax).toBeUndefined();
    expect(params.line_items[0].tax_rates).toEqual(["txr_19"]);
  });

  it("andere Zahlart: alte Seite wird geschlossen, bevor die neue entsteht", async () => {
    const offer = await acceptedOffer();
    await createCheckoutForOffer(offer.id, "sepa");
    const second = await createCheckoutForOffer(offer.id, "card");
    expect(s.created).toBe(2);
    expect(s.expired).toEqual(["cs_d1"]);
    expect(second).toEqual({ url: "https://checkout.stripe.test/cs_d2" });
    expect(await stored(offer.id)).toBe("cs_d2");
  });

  it("bald ablaufende oder abgelaufene Seite: neue Seite (laufende wird vorher geschlossen)", async () => {
    const offer = await acceptedOffer();
    await createCheckoutForOffer(offer.id, "sepa");
    s.sessions.get("cs_d1")!.expires_at = Math.floor(Date.now() / 1000) + 60;
    expect(await createCheckoutForOffer(offer.id, "sepa")).toEqual({ url: "https://checkout.stripe.test/cs_d2" });
    expect(s.expired).toEqual(["cs_d1"]);
    s.sessions.get("cs_d2")!.status = "expired";
    expect(await createCheckoutForOffer(offer.id, "sepa")).toEqual({ url: "https://checkout.stripe.test/cs_d3" });
    expect(s.expired).toEqual(["cs_d1"]);
  });

  it("alte Seite schon bezahlt (Webhook noch nicht da): keine zweite Bezahlseite", async () => {
    const offer = await acceptedOffer();
    await createCheckoutForOffer(offer.id, "sepa");
    s.sessions.get("cs_d1")!.status = "complete";
    expect(await createCheckoutForOffer(offer.id, "card")).toEqual({ error: "Die Zahlung ist bereits eingerichtet." });
    expect(s.created).toBe(1);
    expect(s.expired).toEqual([]);
  });

  it("unbekannte gespeicherte Session (anderes Stripe-Konto): neue Bezahlseite", async () => {
    const offer = await acceptedOffer();
    await prisma.offer.update({ where: { id: offer.id }, data: { stripeCheckoutSessionId: "cs_unbekannt" } });
    expect(await createCheckoutForOffer(offer.id, "sepa")).toEqual({ url: "https://checkout.stripe.test/cs_d1" });
    expect(await stored(offer.id)).toBe("cs_d1");
  });
});
