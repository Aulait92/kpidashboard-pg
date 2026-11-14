// Pflichtangaben auf jeder Stripe-Rechnung (Ole, 14.11.2026): Footer beim Anlegen von Kunden
// und Rechnungen, bestehende Kunden nachziehen (Trockenlauf), Warnung ohne Steuernummer,
// Plausibilitätsprüfung des Stripe-Kontos, Zählung verschickter Rechnungen. Stripe und die
// Datenbank sind gemockt.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Cust = { id: string; invoice_settings: { footer: string | null; custom_fields: { name: string; value: string }[] | null } };
const s = vi.hoisted(() => ({
  created: [] as Record<string, unknown>[],
  updated: [] as { id: string; params: Record<string, unknown> }[],
  invoices: [] as Record<string, unknown>[],
  customers: [] as Cust[],
  listCalls: 0,
  failIds: new Set<string>(),
  taxNumber: null as string | null,
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
        return { id: `cus_new_${s.created.length}` };
      },
      update: async (id: string, params: Record<string, unknown>) => {
        if (s.failIds.has(id)) throw new Error("boom");
        s.updated.push({ id, params });
        return { id };
      },
      // Seitenweise wie die echte API (2 je Seite, damit das Blättern geprüft wird)
      list: async (p: { limit: number; starting_after?: string }) => {
        s.listCalls++;
        const start = p.starting_after ? s.customers.findIndex((c) => c.id === p.starting_after) + 1 : 0;
        const data = s.customers.slice(start, start + 2);
        return { data, has_more: start + 2 < s.customers.length };
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
    invoiceSettings: { findUnique: async () => ({ taxNumber: s.taxNumber }) },
    customer: {
      findUniqueOrThrow: async () => ({ name: "Agentur Muster", stripeCustomerId: null, users: [{ email: "chef@muster.test" }] }),
      update: async () => ({}),
    },
  },
}));

import { chargeNow, ensureStripeCustomerFor } from "@/lib/billing";
import { cleanTaxNumber, invoiceFooter, taxNumberWarning, validateTaxNumber } from "@/lib/invoice-footer";
import { checkAccount, countInvoices, customerUpToDate, startOfBerlinDay, updateCustomerFooters } from "@/lib/rechnungsangaben";
import { rechnungItem } from "@/lib/admin-heute";

const BASE = "Ole Kannapinn UG (haftungsbeschränkt) · Lorenzstraße 58 · 12209 Berlin · Geschäftsführer: Ole Kannapinn · Amtsgericht Charlottenburg, HRB 172651";

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
});
afterAll(() => {
  delete process.env.STRIPE_SECRET_KEY;
});
beforeEach(() => {
  s.created = [];
  s.updated = [];
  s.invoices = [];
  s.customers = [];
  s.listCalls = 0;
  s.failIds = new Set();
  s.taxNumber = null;
});

describe("Footer mit Pflichtangaben", () => {
  it("enthält Name, Anschrift, Geschäftsführer, Register und je nach Eingabe USt-IdNr. oder Steuernummer", () => {
    expect(invoiceFooter(null)).toBe(BASE);
    expect(invoiceFooter("DE123456789")).toBe(`${BASE} · USt-IdNr.: DE123456789`);
    expect(invoiceFooter("29/123/45678")).toBe(`${BASE} · Steuernummer: 29/123/45678`);
    expect(invoiceFooter("   ")).toBe(BASE);
    // keine Gedankenstriche im sichtbaren Text
    expect(invoiceFooter("DE123456789")).not.toMatch(/[–—]/);
  });

  it("prüft die Eingabe", () => {
    expect(validateTaxNumber("")).toEqual({ ok: true, value: null });
    expect(validateTaxNumber(" de 123 456 789 ")).toEqual({ ok: true, value: "DE123456789" });
    expect(validateTaxNumber("29/123/45678")).toEqual({ ok: true, value: "29/123/45678" });
    expect(validateTaxNumber("DE12345").ok).toBe(false);
    expect(validateTaxNumber("abc").ok).toBe(false);
    expect(cleanTaxNumber("  29 / 123  ")).toBe("29 / 123");
  });
});

describe("Footer beim Anlegen von Kunden und Rechnungen", () => {
  it("neuer Stripe-Kunde bekommt Footer und Zusatzfeld als Standard", async () => {
    s.taxNumber = "DE123456789";
    await ensureStripeCustomerFor("c1");
    expect(s.created).toHaveLength(1);
    expect(s.created[0].invoice_settings).toEqual({
      footer: `${BASE} · USt-IdNr.: DE123456789`,
      custom_fields: [{ name: "USt-IdNr.", value: "DE123456789" }],
    });
  });

  it("ohne Steuernummer: Footer ohne die Zeile, kein Zusatzfeld", async () => {
    await ensureStripeCustomerFor("c1");
    expect(s.created[0].invoice_settings).toEqual({ footer: BASE });
  });

  it("selbst erstellte Rechnung (Vorkasse) trägt den Footer", async () => {
    s.taxNumber = "29/123/45678";
    const res = await chargeNow({
      stripeCustomerId: "cus_x",
      lines: [{ description: "10 Leads", amountEur: 300 }],
      description: "Bestellung",
      idempotencyKey: "order-1",
      metadata: {},
    });
    expect(res.status).toBe("paid");
    expect(s.invoices[0].footer).toBe(`${BASE} · Steuernummer: 29/123/45678`);
    expect(s.invoices[0].custom_fields).toEqual([{ name: "Steuernummer", value: "29/123/45678" }]);
  });
});

describe("Bestehende Stripe-Kunden aktualisieren", () => {
  const cust = (id: string, footer: string | null, fields: Cust["invoice_settings"]["custom_fields"] = null): Cust => ({
    id,
    invoice_settings: { footer, custom_fields: fields },
  });

  it("Trockenlauf zählt nur, ändert nichts; danach werden genau die betroffenen aktualisiert", async () => {
    const tax = "DE123456789";
    s.customers = [
      cust("cus_a", null),
      cust("cus_b", `${BASE} · USt-IdNr.: ${tax}`, [{ name: "USt-IdNr.", value: tax }]),
      cust("cus_c", BASE),
      cust("cus_d", "alter Text"),
      cust("cus_e", `${BASE} · USt-IdNr.: ${tax}`, null),
    ];
    const dry = await updateCustomerFooters({ dryRun: true, taxNumber: tax });
    expect(dry).toEqual({ total: 5, affected: 4, updated: 0, failed: 0, dryRun: true });
    expect(s.updated).toHaveLength(0);
    expect(s.listCalls).toBe(3); // 2 + 2 + 1

    s.failIds.add("cus_d");
    const run = await updateCustomerFooters({ dryRun: false, taxNumber: tax });
    expect(run).toEqual({ total: 5, affected: 4, updated: 3, failed: 1, dryRun: false });
    expect(s.updated.map((u) => u.id)).toEqual(["cus_a", "cus_c", "cus_e"]);
    expect(s.updated[0].params).toEqual({
      invoice_settings: { footer: `${BASE} · USt-IdNr.: ${tax}`, custom_fields: [{ name: "USt-IdNr.", value: tax }] },
    });
  });

  it("ohne Steuernummer werden alte Zusatzfelder entfernt", async () => {
    s.customers = [cust("cus_a", `${BASE} · Steuernummer: 1`, [{ name: "Steuernummer", value: "1" }])];
    const run = await updateCustomerFooters({ dryRun: false, taxNumber: null });
    expect(run).toMatchObject({ affected: 1, updated: 1 });
    expect(s.updated[0].params).toEqual({ invoice_settings: { footer: BASE, custom_fields: "" } });
    expect(customerUpToDate(cust("x", BASE, []) as unknown as Parameters<typeof customerUpToDate>[0], { footer: BASE, customFields: [] })).toBe(true);
  });

  it("liest die Steuernummer aus den Einstellungen, wenn keine übergeben wird", async () => {
    s.taxNumber = "DE111222333";
    s.customers = [cust("cus_a", BASE)];
    await updateCustomerFooters({ dryRun: false });
    expect((s.updated[0].params.invoice_settings as { footer: string }).footer).toContain("USt-IdNr.: DE111222333");
  });
});

describe("Warnung ohne Steuernummer", () => {
  it("Admin-Hinweis und Heute-Punkt nur, solange das Feld leer ist", () => {
    expect(taxNumberWarning(null)).toMatch(/^Rechnungen ohne Steuernummer/);
    expect(taxNumberWarning(" ")).not.toBeNull();
    expect(taxNumberWarning("DE123456789")).toBeNull();
    const item = rechnungItem(null);
    expect(item).toMatchObject({ key: "rechnung:steuernummer", tone: "warn", title: "Rechnungen ohne Steuernummer" });
    expect(item?.action.href).toBe("/admin/einstellungen/rechnungsangaben");
    expect(rechnungItem("DE123456789")).toBeNull();
  });
});

describe("Plausibilitätsprüfung des Stripe-Kontos", () => {
  it("erkennt die Sandbox-Platzhalter", () => {
    const checks = checkAccount(
      {
        country: "DE",
        business_profile: {
          name: "performancegrowth",
          support_phone: "+1 415-555-0199",
          support_address: { line1: "address_full_match", line2: null, postal_code: "15712", city: "Königs Wusterhausen", state: null, country: "DE" },
        } as never,
        company: { tax_id_provided: false } as never,
      },
      null,
    );
    const by = Object.fromEntries(checks.map((c) => [c.key, c]));
    expect(by.name.ok).toBe(false);
    expect(by.address.ok).toBe(false);
    expect(by.address.hint).toMatch(/address_full_match/);
    expect(by.phone.ok).toBe(false);
    expect(by.phone.hint).toMatch(/Platzhalter/);
    expect(by.tax.ok).toBe(false);
  });

  it("andere US-Nummer und abweichende Adresse sind Warnungen", () => {
    const checks = checkAccount(
      {
        business_profile: {
          name: "Ole Kannapinn UG (haftungsbeschränkt)",
          support_phone: "+1 212 555 1234",
          support_address: { line1: "Hauptstraße 1", line2: null, postal_code: "15712", city: "Königs Wusterhausen", state: null, country: "DE" },
        } as never,
      },
      "DE123456789",
    );
    const by = Object.fromEntries(checks.map((c) => [c.key, c]));
    expect(by.name.ok).toBe(true);
    expect(by.phone.ok).toBe(false);
    expect(by.phone.hint).toMatch(/US-Telefonnummer/);
    expect(by.address.ok).toBe(false);
    expect(by.address.hint).toMatch(/Lorenzstraße 58, 12209 Berlin/);
    expect(by.tax.ok).toBe(true);
  });

  it("richtige Angaben sind plausibel", () => {
    const checks = checkAccount(
      {
        country: "DE",
        business_profile: {
          name: "Ole Kannapinn UG (haftungsbeschränkt)",
          support_phone: "+49 151 52418846",
          support_address: { line1: "Lorenzstr. 58", line2: null, postal_code: "12209", city: "Berlin", state: null, country: "DE" },
        } as never,
        company: { vat_id_provided: true } as never,
      },
      "DE123456789",
    );
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks.map((c) => c.key)).toEqual(["name", "address", "phone", "tax"]);
  });

  it("anderes Land wird gemeldet", () => {
    expect(checkAccount({ country: "US" }, null).find((c) => c.key === "country")?.ok).toBe(false);
  });
});

describe("Verschickte Rechnungen zählen", () => {
  const now = new Date("2026-11-14T10:00:00Z");
  const ts = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
  it("Tagesbeginn in Berlin (Winter- und Sommerzeit)", () => {
    expect(startOfBerlinDay(now).toISOString()).toBe("2026-11-13T23:00:00.000Z");
    expect(startOfBerlinDay(new Date("2026-07-01T05:00:00Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(startOfBerlinDay(new Date("2026-11-13T23:30:00Z")).toISOString()).toBe("2026-11-13T23:00:00.000Z");
  });

  it("zählt nur finalisierte, getrennt nach Footer und Datum", () => {
    const r = countInvoices(
      [
        { status: "draft", footer: null, status_transitions: { finalized_at: null } as never },
        { status: "paid", footer: null, status_transitions: { finalized_at: ts("2026-11-10T09:00:00Z") } as never },
        { status: "open", footer: "Danke", status_transitions: { finalized_at: ts("2026-11-14T08:00:00Z") } as never },
        { status: "paid", footer: BASE, status_transitions: { finalized_at: ts("2026-11-14T09:00:00Z") } as never },
        { status: "void", footer: null, status_transitions: { finalized_at: ts("2026-11-01T09:00:00Z") } as never },
      ],
      now,
    );
    expect(r).toEqual({ finalized: 4, withoutFooter: 3, beforeToday: 2, withoutFooterBeforeToday: 2 });
  });
});
