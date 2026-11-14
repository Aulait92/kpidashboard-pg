// Admin → Einstellungen → Rechnungsangaben (Ole, 14.11.2026):
// - Steuernummer speichern (danach alle Stripe-Kunden automatisch nachziehen)
// - bestehende Stripe-Kunden mit Trockenlauf auf den neuen Footer setzen
// - eigenes Stripe-Konto auf plausible Angaben prüfen (nur lesen)
// - zählen, wie viele finalisierte Rechnungen ohne den Footer verschickt wurden (nur Zahlen)

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/billing";
import { PROVIDER } from "@/lib/legal-texts";
import {
  FOOTER_MARKER,
  customerInvoiceSettingsUpdate,
  invoiceDefaultsFor,
  loadTaxNumber,
  validateTaxNumber,
  type InvoiceCustomField,
  type InvoiceDefaults,
} from "@/lib/invoice-footer";

/** Sicherheitsgrenze beim Blättern durch Stripe-Listen. */
const MAX_PAGES = 100;

// ─── Steuernummer speichern ────────────────────────────────────────────

export async function saveTaxNumber(raw: string): Promise<{ ok: true; value: string | null; changed: boolean } | { ok: false; error: string }> {
  const v = validateTaxNumber(raw);
  if (!v.ok) return v;
  const before = await loadTaxNumber();
  await prisma.invoiceSettings.upsert({
    where: { id: "default" },
    create: { id: "default", taxNumber: v.value },
    update: { taxNumber: v.value },
  });
  return { ok: true, value: v.value, changed: before !== v.value };
}

// ─── Bestehende Stripe-Kunden aktualisieren ───────────────────────────

const sameFields = (a: InvoiceCustomField[] | null | undefined, b: InvoiceCustomField[]) =>
  JSON.stringify((a ?? []).map((f) => [f.name, f.value])) === JSON.stringify(b.map((f) => [f.name, f.value]));

/** Hat der Kunde schon genau diesen Footer und diese Zusatzfelder als Standard? */
export function customerUpToDate(c: Pick<Stripe.Customer, "invoice_settings">, d: InvoiceDefaults): boolean {
  return (c.invoice_settings?.footer ?? "") === d.footer && sameFields(c.invoice_settings?.custom_fields, d.customFields);
}

async function allCustomers(stripe: Stripe): Promise<Stripe.Customer[]> {
  const out: Stripe.Customer[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await stripe.customers.list({ limit: 100, ...(after ? { starting_after: after } : {}) });
    out.push(...res.data);
    if (!res.has_more || !res.data.length) break;
    after = res.data[res.data.length - 1].id;
  }
  return out;
}

export type CustomerFooterResult = { total: number; affected: number; updated: number; failed: number; dryRun: boolean };

/**
 * Setzt bei allen Stripe-Kunden den Footer und die Zusatzfelder als Standard für künftige
 * Rechnungen. Trockenlauf (dryRun) zählt nur, wie viele Kunden betroffen sind.
 */
export async function updateCustomerFooters(opts: { dryRun: boolean; taxNumber?: string | null }): Promise<CustomerFooterResult | { error: string }> {
  const stripe = stripeClient();
  if (!stripe) return { error: "Stripe ist nicht eingerichtet (STRIPE_SECRET_KEY fehlt)." };
  const d = invoiceDefaultsFor(opts.taxNumber === undefined ? await loadTaxNumber() : opts.taxNumber);
  const customers = await allCustomers(stripe);
  const affected = customers.filter((c) => !c.deleted && !customerUpToDate(c, d));
  const res: CustomerFooterResult = { total: customers.length, affected: affected.length, updated: 0, failed: 0, dryRun: opts.dryRun };
  if (opts.dryRun) return res;
  for (const c of affected) {
    try {
      await stripe.customers.update(c.id, { invoice_settings: customerInvoiceSettingsUpdate(d) });
      res.updated++;
    } catch {
      res.failed++;
    }
  }
  return res;
}

// ─── Prüfung des eigenen Stripe-Kontos (nur lesen) ─────────────────────

export type AccountCheck = { key: "name" | "address" | "phone" | "tax" | "country"; label: string; value: string; ok: boolean; hint: string };

/** Platzhalter aus Stripe-Sandboxen bzw. Test-Adressen. */
const PLACEHOLDER_PHONES = ["+14155550199", "14155550199", "4155550199"];
const TEST_ADDRESS = /^address_|address_full_match/i;

const digitsPlus = (v: string) => v.replace(/[^\d+]/g, "");
const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/\s+/g, " ").trim();

const providerZip = PROVIDER.city.split(" ")[0];
const providerCity = PROVIDER.city.split(" ").slice(1).join(" ");

function formatAddress(a: Stripe.Address | null | undefined): string {
  if (!a) return "";
  return [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ");
}

/**
 * Prüft Name, Adresse, Telefon und Steuer-ID des eigenen Stripe-Kontos auf Plausibilität.
 * Stripe druckt diese Angaben in den Kopf jeder Rechnung; die Pflichtangaben im Footer
 * kommen unabhängig davon aus der Software.
 */
export function checkAccount(account: Partial<Pick<Stripe.Account, "business_profile" | "company" | "settings" | "country">>, taxNumber: string | null): AccountCheck[] {
  const bp = account.business_profile ?? null;
  const company = account.company ?? null;
  const checks: AccountCheck[] = [];

  // Name
  const name = bp?.name || company?.name || account.settings?.dashboard?.display_name || "";
  const nameOk = norm(name) === norm(PROVIDER.name) || (norm(name).includes("kannapinn") && norm(name).includes("ug"));
  checks.push({
    key: "name",
    label: "Name",
    value: name || "(leer)",
    ok: nameOk,
    hint: nameOk
      ? "Voller Name mit Rechtsform."
      : `Auf der Rechnung sollte der volle Name mit Rechtsform stehen: „${PROVIDER.name}“ (Stripe: Einstellungen → Unternehmensdaten bzw. Öffentliche Angaben).`,
  });

  // Adresse
  const addr = bp?.support_address ?? company?.address ?? null;
  const addrText = formatAddress(addr);
  const isTest = !!addr && [addr.line1, addr.line2, addr.city, addr.postal_code].some((v) => v && TEST_ADDRESS.test(v));
  const addrOk =
    !!addr &&
    !isTest &&
    (addr.postal_code ?? "").trim() === providerZip &&
    norm(addr.city) === norm(providerCity) &&
    norm(addr.line1).replace(/straße|str\./g, "str").includes(norm(PROVIDER.street).replace(/straße|str\./g, "str")) &&
    (!addr.country || addr.country === "DE");
  checks.push({
    key: "address",
    label: "Adresse",
    value: addrText || "(leer)",
    ok: addrOk,
    hint: addrOk
      ? "Stimmt mit der Anschrift im Impressum überein."
      : isTest
        ? "Test-Adresse aus der Sandbox (z. B. „address_full_match“). Bitte die echte Anschrift eintragen."
        : `Weicht von der Anschrift ab: ${PROVIDER.street}, ${PROVIDER.city}.`,
  });

  // Telefon
  const phone = bp?.support_phone || company?.phone || "";
  const p = digitsPlus(phone);
  const placeholder = PLACEHOLDER_PHONES.some((x) => p.endsWith(x));
  const us = p.startsWith("+1") || p.startsWith("001");
  const phoneOk = !!p && !placeholder && !us;
  checks.push({
    key: "phone",
    label: "Telefon",
    value: phone || "(leer)",
    ok: phoneOk,
    hint: phoneOk
      ? "Plausible Nummer."
      : placeholder
        ? "Platzhalter aus der Sandbox (+1 415-555-0199). Bitte die echte Nummer eintragen."
        : us
          ? "US-Telefonnummer. Bitte eine deutsche Nummer eintragen."
          : `Keine Telefonnummer hinterlegt${PROVIDER.phone ? ` (z. B. ${PROVIDER.phone})` : ""}.`,
  });

  // Steuer-ID
  const stripeTax = !!(company?.tax_id_provided || company?.vat_id_provided);
  const taxOk = !!taxNumber;
  checks.push({
    key: "tax",
    label: "Steuer-ID",
    value: [taxNumber ? `Einstellung: ${taxNumber}` : "Einstellung: (leer)", `Stripe-Konto: ${stripeTax ? "hinterlegt" : "nicht hinterlegt"}`].join(" · "),
    ok: taxOk,
    hint: taxOk
      ? "Steht über den Footer auf jeder Rechnung."
      : "Keine Steuernummer in den Rechnungsangaben: Rechnungen gehen ohne USt-IdNr. bzw. Steuernummer raus.",
  });

  // Land
  if (account.country && account.country !== "DE") {
    checks.push({ key: "country", label: "Land", value: account.country, ok: false, hint: "Das Stripe-Konto ist nicht auf Deutschland eingestellt." });
  }
  return checks;
}

export async function loadAccountCheck(): Promise<{ checks: AccountCheck[]; livemode: boolean | null } | { error: string }> {
  const stripe = stripeClient();
  if (!stripe) return { error: "Stripe ist nicht eingerichtet (STRIPE_SECRET_KEY fehlt)." };
  try {
    const [account, taxNumber] = await Promise.all([stripe.accounts.retrieveCurrent(), loadTaxNumber()]);
    const live = process.env.STRIPE_SECRET_KEY?.trim().startsWith("sk_live_") ?? null;
    return { checks: checkAccount(account, taxNumber), livemode: live };
  } catch (err) {
    return { error: `Stripe-Konto konnte nicht gelesen werden: ${(err as Error).message.slice(0, 160)}` };
  }
}

// ─── Bereits verschickte Rechnungen zählen (ohne Kundendaten) ──────────

export type SentInvoiceCount = {
  /** finalisierte Rechnungen insgesamt (offen, bezahlt, uneinbringlich, storniert) */
  finalized: number;
  /** davon ohne die neuen Pflichtangaben im Footer */
  withoutFooter: number;
  /** davon vor dem heutigen Tag (Berlin) finalisiert */
  beforeToday: number;
  /** ohne Footer und vor heute */
  withoutFooterBeforeToday: number;
  /** abgeschnitten, weil es mehr als 10.000 Rechnungen sind */
  truncated: boolean;
};

/** Beginn des heutigen Tages in Berlin. */
export function startOfBerlinDay(now: Date): Date {
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(now);
  // Offset Berlin gegenüber UTC zu diesem Zeitpunkt (Winter +1, Sommer +2)
  const probe = new Date(`${day}T12:00:00Z`);
  const berlinNoon = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(probe);
  const offsetH = Number(berlinNoon) - 12;
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - offsetH * 3600_000);
}

export function countInvoices(invoices: Pick<Stripe.Invoice, "status" | "footer" | "status_transitions">[], now: Date): Omit<SentInvoiceCount, "truncated"> {
  const today = startOfBerlinDay(now).getTime() / 1000;
  const r = { finalized: 0, withoutFooter: 0, beforeToday: 0, withoutFooterBeforeToday: 0 };
  for (const inv of invoices) {
    const finalizedAt = inv.status_transitions?.finalized_at ?? null;
    if (inv.status === "draft" || !finalizedAt) continue;
    r.finalized++;
    const noFooter = !(inv.footer ?? "").includes(FOOTER_MARKER);
    const before = finalizedAt < today;
    if (noFooter) r.withoutFooter++;
    if (before) r.beforeToday++;
    if (noFooter && before) r.withoutFooterBeforeToday++;
  }
  return r;
}

/** Zählt finalisierte Rechnungen im Stripe-Konto, nur Zahlen, keine Kundendaten. */
export async function countSentInvoices(now = new Date()): Promise<SentInvoiceCount | { error: string }> {
  const stripe = stripeClient();
  if (!stripe) return { error: "Stripe ist nicht eingerichtet (STRIPE_SECRET_KEY fehlt)." };
  const all: Pick<Stripe.Invoice, "status" | "footer" | "status_transitions">[] = [];
  let after: string | undefined;
  let truncated = false;
  try {
    for (let page = 0; ; page++) {
      if (page >= MAX_PAGES) {
        truncated = true;
        break;
      }
      const res = await stripe.invoices.list({ limit: 100, ...(after ? { starting_after: after } : {}) });
      for (const i of res.data) all.push({ status: i.status, footer: i.footer, status_transitions: i.status_transitions });
      if (!res.has_more || !res.data.length) break;
      after = res.data[res.data.length - 1].id;
    }
  } catch (err) {
    return { error: `Rechnungen konnten nicht gelesen werden: ${(err as Error).message.slice(0, 160)}` };
  }
  return { ...countInvoices(all, now), truncated };
}
