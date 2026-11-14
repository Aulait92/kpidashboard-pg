// Zahlarten und Steuer-ID auf Rechnungen (Ole, 14.11.2026): Lastschrift zuerst und vorausgewählt,
// keine exotischen Zahlarten, neue Zahlart wird Standard bei Kunde und Abo, account_tax_ids nur
// ohne Standard-Steuer-ID im Stripe-Konto. Stripe und die Datenbank sind gemockt.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const s = vi.hoisted(() => ({
  sessions: [] as Record<string, unknown>[],
  invoices: [] as Record<string, unknown>[],
  customerUpdates: [] as { id: string; params: Record<string, unknown> }[],
  subUpdates: [] as { id: string; params: Record<string, unknown> }[],
  scheduleUpdates: [] as { id: string; params: Record<string, unknown> }[],
  defaultTaxIds: [] as string[],
  taxIds: [] as { id: string; value: string; type: string }[],
  accountCalls: 0,
  taxIdCalls: 0,
  rejectSepa: false,
  setupPm: "pm_sepa_1",
  created: [] as Record<string, unknown>[],
  stripeCustomerId: "cus_muster" as string | null,
}));

vi.mock("stripe", () => {
  class FakeStripe {
    products = {
      search: async () => ({ data: [] }),
      create: async (p: { metadata: { pg_key: string } }) => ({ id: `prod_${p.metadata.pg_key}` }),
    };
    tax = { registrations: { list: async () => ({ data: [{ id: "taxreg_1" }] }) } };
    accounts = {
      retrieveCurrent: async () => {
        s.accountCalls++;
        return { settings: { invoices: { default_account_tax_ids: s.defaultTaxIds } } };
      },
    };
    taxIds = {
      list: async () => {
        s.taxIdCalls++;
        return { data: s.taxIds };
      },
    };
    customers = {
      create: async (params: Record<string, unknown>) => {
        s.created.push(params);
        return { id: "cus_neu" };
      },
      update: async (id: string, params: Record<string, unknown>) => {
        s.customerUpdates.push({ id, params });
        return { id };
      },
    };
    checkout = {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          const types = params.allowed_payment_method_types as string[] | undefined;
          if (s.rejectSepa && types?.length === 1 && types[0] === "sepa_debit") {
            throw Object.assign(new Error("sepa_debit ist nicht aktiviert"), { type: "StripeInvalidRequestError" });
          }
          s.sessions.push(params);
          return { id: `cs_${s.sessions.length}`, url: "https://checkout.stripe.test/x" };
        },
      },
    };
    setupIntents = { retrieve: async () => ({ id: "seti_1", payment_method: s.setupPm }) };
    subscriptions = {
      list: async () => ({
        data: [
          { id: "sub_aktiv", status: "active", default_payment_method: "pm_karte_alt" },
          { id: "sub_alt", status: "canceled", default_payment_method: "pm_karte_alt" },
        ],
      }),
      update: async (id: string, params: Record<string, unknown>) => {
        s.subUpdates.push({ id, params });
        return { id };
      },
    };
    subscriptionSchedules = {
      list: async () => ({
        data: [
          { id: "sub_sched_geplant", status: "not_started", default_settings: { default_payment_method: "pm_karte_alt" } },
          { id: "sub_sched_fertig", status: "released", default_settings: { default_payment_method: "pm_karte_alt" } },
        ],
      }),
      update: async (id: string, params: Record<string, unknown>) => {
        s.scheduleUpdates.push({ id, params });
        return { id };
      },
    };
    invoices = {
      create: async (params: Record<string, unknown>) => {
        s.invoices.push(params);
        return { id: "in_1" };
      },
      finalizeInvoice: async (id: string) => ({ id, status: "paid" }),
    };
    invoiceItems = { create: async () => ({ id: "ii_1" }) };
  }
  return { default: FakeStripe };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoiceSettings: { findUnique: async () => null },
    customer: {
      findUniqueOrThrow: async () => ({ name: "Agentur Muster", stripeCustomerId: s.stripeCustomerId, users: [] }),
      update: async () => ({}),
    },
  },
}));

import { chargeNow, createPaymentSetupUrl, ensureStripeCustomerFor, savePaymentSetup } from "@/lib/billing";
import { resetAccountTaxIdCache } from "@/lib/invoice-footer";
import { allowedPaymentMethodTypes, parseZahlart, ZAHLART_HINWEIS } from "@/lib/zahlart";
import { ZahlartAuswahl } from "@/components/zahlart-auswahl";
import type Stripe from "stripe";

/** Zahlarten, die Ole ausdrücklich nicht anbieten will. */
const EXOTISCH = ["kakao_pay", "naver_pay", "payco", "pix", "blik", "mb_way", "bancontact", "klarna", "link", "paypal", "eps", "ideal"];

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
});
afterAll(() => {
  delete process.env.STRIPE_SECRET_KEY;
});
beforeEach(() => {
  s.sessions = [];
  s.invoices = [];
  s.customerUpdates = [];
  s.subUpdates = [];
  s.scheduleUpdates = [];
  s.defaultTaxIds = [];
  s.taxIds = [];
  s.accountCalls = 0;
  s.taxIdCalls = 0;
  s.rejectSepa = false;
  s.setupPm = "pm_sepa_1";
  s.created = [];
  s.stripeCustomerId = "cus_muster";
  resetAccountTaxIdCache();
});

describe("Zahlart-Auswahl", () => {
  it("Lastschrift ist Standard, Karte nur ausdrücklich", () => {
    expect(parseZahlart(null)).toBe("sepa");
    expect(parseZahlart("irgendwas")).toBe("sepa");
    expect(parseZahlart("card")).toBe("card");
    expect(allowedPaymentMethodTypes("sepa")).toEqual(["sepa_debit"]);
    expect(allowedPaymentMethodTypes("card")).toEqual(["card"]);
    // ohne Wahl: Lastschrift zuerst, dann Karte (Apple Pay und Google Pay laufen über card)
    expect(allowedPaymentMethodTypes(null)).toEqual(["sepa_debit", "card"]);
  });

  it("zeigt Lastschrift zuerst und vorausgewählt, darunter den Hinweis ohne Gedankenstriche", () => {
    const html = renderToStaticMarkup(createElement(ZahlartAuswahl));
    const sepa = html.indexOf('value="sepa"');
    const card = html.indexOf('value="card"');
    expect(sepa).toBeGreaterThan(-1);
    expect(card).toBeGreaterThan(sepa);
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="sepa"/);
    expect(html).not.toMatch(/<input[^>]*checked=""[^>]*value="card"/);
    expect(html).toContain("Apple Pay");
    expect(html).toContain("Google Pay");
    expect(html.indexOf(ZAHLART_HINWEIS)).toBeGreaterThan(card);
    expect(ZAHLART_HINWEIS).toBe("Am einfachsten per Lastschrift, der Betrag wird monatlich automatisch eingezogen.");
    expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/[–—]/);
  });
});

describe("Checkout-Parameter", () => {
  it("Lastschrift gewählt: nur sepa_debit, keine exotischen Zahlarten, Modus setup bleibt", async () => {
    await createPaymentSetupUrl("c1", "https://app.test/buyer/konto", { zahlart: "sepa", description: "Zahlungsart für Rechnungen" });
    const p = s.sessions[0];
    expect(p.allowed_payment_method_types).toEqual(["sepa_debit"]);
    expect(p).not.toHaveProperty("payment_method_types");
    expect(p).not.toHaveProperty("excluded_payment_method_types");
    expect(p.mode).toBe("setup");
    expect(p.currency).toBe("eur");
    expect(p.metadata).toEqual({ kind: "payment_setup", customer_id: "c1" });
    expect((p.setup_intent_data as { description: string }).description).toBe("Zahlungsart für Rechnungen");
    expect(p.success_url).toBe("https://app.test/buyer/konto?zahlung=ok");
  });

  it("Karte gewählt: nur card (Apple Pay und Google Pay inklusive)", async () => {
    await createPaymentSetupUrl("c1", "https://app.test/buyer/bestellen", { zahlart: "card" });
    expect(s.sessions[0].allowed_payment_method_types).toEqual(["card"]);
  });

  it("ohne Wahl: Lastschrift vor Karte, sonst nichts", async () => {
    await createPaymentSetupUrl("c1", "https://app.test/buyer/bestellen");
    const types = s.sessions[0].allowed_payment_method_types as string[];
    expect(types).toEqual(["sepa_debit", "card"]);
    for (const x of EXOTISCH) expect(types).not.toContain(x);
  });

  it("Lastschrift im Konto nicht freigeschaltet: Rückfall auf Lastschrift und Karte", async () => {
    s.rejectSepa = true;
    expect(await createPaymentSetupUrl("c1", "https://app.test/buyer/konto", { zahlart: "sepa" })).toBe("https://checkout.stripe.test/x");
    expect(s.sessions[0].allowed_payment_method_types).toEqual(["sepa_debit", "card"]);
  });
});

describe("Neue Zahlart wird Standard", () => {
  const session = { mode: "setup", setup_intent: "seti_1", customer: "cus_muster" } as unknown as Stripe.Checkout.Session;

  it("Lastschrift: Standard beim Kunden, beim laufenden Abo und beim geplanten Abo-Start", async () => {
    await savePaymentSetup(session);
    expect((s.customerUpdates[0].params.invoice_settings as { default_payment_method: string }).default_payment_method).toBe("pm_sepa_1");
    expect(s.subUpdates).toEqual([{ id: "sub_aktiv", params: { default_payment_method: "pm_sepa_1" } }]);
    expect(s.scheduleUpdates).toEqual([{ id: "sub_sched_geplant", params: { default_settings: { default_payment_method: "pm_sepa_1" } } }]);
  });

  it("ist sie schon Standard, wird das Abo nicht angefasst", async () => {
    s.setupPm = "pm_karte_alt";
    await savePaymentSetup(session);
    expect(s.customerUpdates).toHaveLength(1);
    expect(s.subUpdates).toHaveLength(0);
    expect(s.scheduleUpdates).toHaveLength(0);
  });
});

describe("Steuer-ID auf Rechnungen (account_tax_ids)", () => {
  const charge = () =>
    chargeNow({ stripeCustomerId: "cus_x", lines: [{ description: "10 Leads", amountEur: 300 }], description: "Bestellung", idempotencyKey: `o-${Math.random()}`, metadata: {} });

  it("ohne Standard im Stripe-Konto: ID der passenden Steuer-ID aus der API, kurz zwischengespeichert", async () => {
    s.taxIds = [
      { id: "txi_andere", value: "DE111111111", type: "eu_vat" },
      { id: "txi_pg", value: "DE 295 007 828", type: "eu_vat" },
    ];
    await charge();
    expect(s.invoices[0].account_tax_ids).toEqual(["txi_pg"]);
    await charge();
    expect(s.invoices[1].account_tax_ids).toEqual(["txi_pg"]);
    expect(s.accountCalls).toBe(1);
    expect(s.taxIdCalls).toBe(1);
  });

  it("mit Standard im Stripe-Konto: nichts mitgeben (Stripe setzt sie selbst)", async () => {
    s.defaultTaxIds = ["txi_pg"];
    s.taxIds = [{ id: "txi_pg", value: "DE295007828", type: "eu_vat" }];
    await charge();
    expect(s.invoices[0]).not.toHaveProperty("account_tax_ids");
    expect(s.taxIdCalls).toBe(0);
  });

  it("Steuer-ID im Konto nicht angelegt: nichts mitgeben, Rechnung geht trotzdem raus", async () => {
    s.taxIds = [{ id: "txi_andere", value: "DE111111111", type: "eu_vat" }];
    const res = await charge();
    expect(res.status).toBe("paid");
    expect(s.invoices[0]).not.toHaveProperty("account_tax_ids");
  });
});

describe("Rechnungsfuß mit USt-IdNr.", () => {
  it("ohne abweichenden Wert steht die USt-IdNr. aus den Stammdaten im Footer und als Zusatzfeld", async () => {
    s.taxIds = [{ id: "txi_pg", value: "DE295007828", type: "eu_vat" }];
    await charge0();
    expect(s.invoices[0].footer).toMatch(/ · USt-IdNr\.: DE295007828$/);
    expect(s.invoices[0].custom_fields).toEqual([{ name: "USt-IdNr.", value: "DE295007828" }]);
  });

  it("neuer Stripe-Kunde bekommt den Footer mit USt-IdNr. als Standard", async () => {
    s.stripeCustomerId = null;
    await ensureStripeCustomerFor("c-neu");
    expect((s.created[0].invoice_settings as { footer: string }).footer).toMatch(/USt-IdNr\.: DE295007828$/);
  });
});

function charge0() {
  return chargeNow({ stripeCustomerId: "cus_x", lines: [{ description: "Paket", amountEur: 49 }], description: "Paket", idempotencyKey: "p-1", metadata: {} });
}
