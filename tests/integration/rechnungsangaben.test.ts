// Pflichtangaben auf Stripe-Rechnungen mit echter Datenbank (Stripe gemockt):
// Steuernummer speichern, Footer beim Anlegen des Kunden und auf der Setup-Rechnung
// aus dem Checkout, Nachziehen bestehender Kunden nach dem Speichern.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sessions: [] as Record<string, unknown>[],
  created: [] as Record<string, unknown>[],
  updated: [] as { id: string; params: Record<string, unknown> }[],
}));

vi.mock("stripe", () => {
  class FakeStripe {
    products = {
      search: async () => ({ data: [] }),
      create: async (p: { metadata: { pg_key: string } }) => ({ id: `prod_${p.metadata.pg_key}` }),
    };
    tax = { registrations: { list: async () => ({ data: [{ id: "taxreg_1" }] }) } };
    customers = {
      create: async (params: Record<string, unknown>) => {
        s.created.push(params);
        return { id: `cus_${Math.random().toString(36).slice(2, 8)}` };
      },
      update: async (id: string, params: Record<string, unknown>) => {
        s.updated.push({ id, params });
        return { id };
      },
      list: async () => ({ data: [{ id: "cus_alt", invoice_settings: { footer: null, custom_fields: null } }], has_more: false }),
    };
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
import { loadTaxNumber } from "@/lib/invoice-footer";
import { saveTaxNumber, updateCustomerFooters } from "@/lib/rechnungsangaben";
import { requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const today = berlinTodayIso();

describe("Rechnungsangaben", () => {
  const contacts: string[] = [];
  beforeAll(async () => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
    await prisma.invoiceSettings.deleteMany({});
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await prisma.invoiceSettings.deleteMany({});
    await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
  });
  beforeEach(() => {
    s.sessions = [];
    s.created = [];
    s.updated = [];
  });

  it("Steuernummer speichern: Prüfung, Änderung erkannt, leer = Zeile entfällt", async () => {
    expect(await loadTaxNumber()).toBeNull();
    expect(await saveTaxNumber("DE12")).toMatchObject({ ok: false });
    expect(await loadTaxNumber()).toBeNull();
    expect(await saveTaxNumber("de 123 456 789")).toEqual({ ok: true, value: "DE123456789", changed: true });
    expect(await saveTaxNumber("DE123456789")).toEqual({ ok: true, value: "DE123456789", changed: false });
    expect(await loadTaxNumber()).toBe("DE123456789");
  });

  it("Checkout: neuer Kunde und Setup-Rechnung tragen die Pflichtangaben", async () => {
    const contact = await prisma.salesContact.create({ data: { name: "Footer Test", email: `footer-${uid()}@example.test` } });
    contacts.push(contact.id);
    const offer = await createOffer(
      { salesContactId: contact.id },
      {
        contactName: "Karl Kunde",
        email: `karl-${uid()}@example.test`,
        term: "12m",
        products: [{ name: "Katzenversicherung", dailyBudget: 40 }],
        startDate: addDaysIso(today, 20),
      },
      null,
    );
    expect(await acceptOffer(offer.token, { name: "Karl Kunde", ip: "127.0.0.1", agent: "vitest", termsAccepted: true })).toEqual({ ok: true });
    expect(await createCheckoutForOffer(offer.id)).toEqual({ url: "https://checkout.stripe.test/x" });

    const footer = (s.created[0].invoice_settings as { footer: string }).footer;
    expect(footer).toContain("Geschäftsführer: Ole Kannapinn");
    expect(footer).toContain("Amtsgericht Charlottenburg, HRB 172651");
    expect(footer).toMatch(/USt-IdNr\.: DE123456789$/);
    const invoiceData = (s.sessions[0].invoice_creation as { invoice_data: { footer: string; custom_fields: unknown } }).invoice_data;
    expect(invoiceData.footer).toBe(footer);
    expect(invoiceData.custom_fields).toEqual([{ name: "USt-IdNr.", value: "DE123456789" }]);
  });

  it("nach dem Speichern zieht das Nachziehen bestehende Kunden auf den neuen Stand", async () => {
    await saveTaxNumber("29/123/45678");
    const res = await updateCustomerFooters({ dryRun: false });
    expect(res).toMatchObject({ total: 1, affected: 1, updated: 1 });
    expect((s.updated[0].params.invoice_settings as { footer: string }).footer).toMatch(/Steuernummer: 29\/123\/45678$/);
  });
});
