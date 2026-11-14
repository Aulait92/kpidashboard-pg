// Admin → Einstellungen → Rechnungsangaben (Ole, 14.11.2026):
// - abweichende Steuernummer speichern (Standard: USt-IdNr. aus PROVIDER; danach alle
//   Stripe-Kunden automatisch nachziehen)
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
  effectiveTaxNumber,
  invoiceDefaultsFor,
  loadTaxNumber,
  loadTaxNumberOverride,
  validateTaxNumber,
  type InvoiceCustomField,
  type InvoiceDefaults,
} from "@/lib/invoice-footer";

/** Sicherheitsgrenze beim Blättern durch Stripe-Listen. */
const MAX_PAGES = 100;

// ─── Steuernummer speichern ────────────────────────────────────────────

/**
 * Abweichende USt-IdNr. bzw. Steuernummer speichern; leer = Standard aus PROVIDER.
 * value ist der gespeicherte (abweichende) Wert, changed bezieht sich darauf.
 */
export async function saveTaxNumber(raw: string): Promise<{ ok: true; value: string | null; changed: boolean } | { ok: false; error: string }> {
  const v = validateTaxNumber(raw);
  if (!v.ok) return v;
  const before = await loadTaxNumberOverride();
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
  // taxNumber = abweichender Wert aus den Einstellungen (null = Standard aus PROVIDER)
  const d = invoiceDefaultsFor(opts.taxNumber === undefined ? await loadTaxNumber() : effectiveTaxNumber(opts.taxNumber));
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

export type AccountCheck = {
  key: "name" | "address" | "phone" | "tax" | "tax_default" | "country";
  label: string;
  value: string;
  /** false = Warnung; neutrale Hinweise (tone "info") zählen als ok */
  ok: boolean;
  tone: "ok" | "warn" | "info";
  hint: string;
};

/** Steuer-ID des eigenen Kontos (Stripe Account Tax IDs), nur was die Prüfung braucht. */
export type AccountTaxId = { id: string; value: string; type?: string };

export type AccountCheckOptions = {
  /** Testschlüssel (sk_test bzw. livemode false): Sandbox-Platzhalter nur als Hinweis */
  testmode?: boolean;
  /** Steuer-IDs des Kontos; undefined = nicht gelesen */
  accountTaxIds?: AccountTaxId[];
};

/** Platzhalter aus Stripe-Sandboxen bzw. Test-Adressen. */
const PLACEHOLDER_PHONES = ["+14155550199", "14155550199", "4155550199"];
const TEST_ADDRESS = /^address_|address_full_match/i;
/** Ort der Sandbox-Platzhalteradresse. */
const PLACEHOLDER_CITY = /k(ö|oe)nigs\s*wusterhausen/i;
const SANDBOX_HINT = "Testkonto mit Platzhaltern. Im Live-Konto stehen die echten Angaben.";

const check = (c: Omit<AccountCheck, "ok">): AccountCheck => ({ ...c, ok: c.tone !== "warn" });
const compactTax = (v: string | null | undefined) => (v ?? "").replace(/[\s./-]/g, "").toUpperCase();

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
export function checkAccount(
  account: Partial<Pick<Stripe.Account, "business_profile" | "company" | "settings" | "country">>,
  taxNumber: string | null,
  opts: AccountCheckOptions = {},
): AccountCheck[] {
  const bp = account.business_profile ?? null;
  const company = account.company ?? null;
  const checks: AccountCheck[] = [];

  // Name
  const name = bp?.name || company?.name || account.settings?.dashboard?.display_name || "";
  const nameOk = norm(name) === norm(PROVIDER.name) || (norm(name).includes("kannapinn") && norm(name).includes("ug"));
  checks.push(check({
    key: "name",
    label: "Name",
    value: name || "(leer)",
    tone: nameOk ? "ok" : "warn",
    hint: nameOk
      ? "Voller Name mit Rechtsform."
      : `Auf der Rechnung sollte der volle Name mit Rechtsform stehen: „${PROVIDER.name}“ (Stripe: Einstellungen → Unternehmensdaten bzw. Öffentliche Angaben).`,
  }));

  // Adresse
  const addr = bp?.support_address ?? company?.address ?? null;
  const addrText = formatAddress(addr);
  const isTest =
    !!addr && ([addr.line1, addr.line2, addr.city, addr.postal_code].some((v) => v && TEST_ADDRESS.test(v)) || PLACEHOLDER_CITY.test(addr.city ?? ""));
  const addrOk =
    !!addr &&
    !isTest &&
    (addr.postal_code ?? "").trim() === providerZip &&
    norm(addr.city) === norm(providerCity) &&
    norm(addr.line1).replace(/straße|str\./g, "str").includes(norm(PROVIDER.street).replace(/straße|str\./g, "str")) &&
    (!addr.country || addr.country === "DE");
  checks.push(check({
    key: "address",
    label: "Adresse",
    value: addrText || "(leer)",
    tone: addrOk ? "ok" : isTest && opts.testmode ? "info" : "warn",
    hint: addrOk
      ? "Stimmt mit der Anschrift im Impressum überein."
      : isTest
        ? opts.testmode
          ? SANDBOX_HINT
          : "Test-Adresse aus der Sandbox (z. B. „address_full_match“). Bitte die echte Anschrift eintragen."
        : `Weicht von der Anschrift ab: ${PROVIDER.street}, ${PROVIDER.city}.`,
  }));

  // Telefon
  const phone = bp?.support_phone || company?.phone || "";
  const p = digitsPlus(phone);
  const placeholder = PLACEHOLDER_PHONES.some((x) => p.endsWith(x));
  const us = p.startsWith("+1") || p.startsWith("001");
  const phoneOk = !!p && !placeholder && !us;
  checks.push(check({
    key: "phone",
    label: "Telefon",
    value: phone || "(leer)",
    tone: phoneOk ? "ok" : placeholder && opts.testmode ? "info" : "warn",
    hint: phoneOk
      ? "Plausible Nummer."
      : placeholder
        ? opts.testmode
          ? SANDBOX_HINT
          : "Platzhalter aus der Sandbox (+1 415-555-0199). Bitte die echte Nummer eintragen."
        : us
          ? "US-Telefonnummer. Bitte eine deutsche Nummer eintragen."
          : `Keine Telefonnummer hinterlegt${PROVIDER.phone ? ` (z. B. ${PROVIDER.phone})` : ""}.`,
  }));

  // Steuer-ID im Footer (Einstellung, sonst PROVIDER)
  const stripeTax = !!(company?.tax_id_provided || company?.vat_id_provided);
  const taxOk = !!taxNumber;
  checks.push(check({
    key: "tax",
    label: "Steuer-ID",
    value: [taxNumber ? `Rechnungsfuß: ${taxNumber}` : "Rechnungsfuß: (leer)", `Stripe-Konto: ${stripeTax ? "hinterlegt" : "nicht hinterlegt"}`].join(" · "),
    tone: taxOk ? "ok" : "warn",
    hint: taxOk
      ? "Steht über den Footer auf jeder Rechnung."
      : "Keine Steuernummer in den Rechnungsangaben: Rechnungen gehen ohne USt-IdNr. bzw. Steuernummer raus.",
  }));

  // Standard-Steuer-ID für Rechnungen (Kopf der Rechnung, Stripe: Account Tax IDs)
  const defaults = (account.settings?.invoices?.default_account_tax_ids ?? []).map((t) => (typeof t === "string" ? t : t.id));
  const want = compactTax(taxNumber);
  const match = opts.accountTaxIds?.find((t) => want && compactTax(t.value) === want);
  const defaultValues = defaults.map((id) => opts.accountTaxIds?.find((t) => t.id === id)?.value ?? id);
  checks.push(check({
    key: "tax_default",
    label: "Standard-Steuer-ID für Rechnungen",
    value: defaults.length ? defaultValues.join(", ") : "(keine gesetzt)",
    tone: defaults.length ? "ok" : "warn",
    hint: defaults.length
      ? "Stripe setzt sie auf jede Rechnung."
      : opts.accountTaxIds === undefined
        ? "Im Stripe-Konto ist keine Standard-Steuer-ID für Rechnungen gesetzt."
        : match
          ? `Im Stripe-Konto ist keine Standard-Steuer-ID für Rechnungen gesetzt. Die Software gibt ${match.value} bei neuen Rechnungen und neuen Abos selbst mit; für bestehende Abos in Stripe unter Einstellungen → Rechnungen als Standard auswählen.`
          : `Im Stripe-Konto ist keine Standard-Steuer-ID für Rechnungen gesetzt und ${taxNumber ?? "die USt-IdNr."} ist dort nicht als Steuer-ID angelegt. Bitte in Stripe unter Einstellungen → Steuer-IDs anlegen und unter Einstellungen → Rechnungen als Standard auswählen.`,
  }));

  // Land
  if (account.country && account.country !== "DE") {
    checks.push(check({ key: "country", label: "Land", value: account.country, tone: "warn", hint: "Das Stripe-Konto ist nicht auf Deutschland eingestellt." }));
  }
  return checks;
}

/** Testschlüssel (sk_test_ bzw. rk_test_): Konto im Testmodus bzw. Sandbox. */
export function isTestKey(key: string | null | undefined): boolean {
  return /^(sk|rk)_test_/.test((key ?? "").trim());
}

export async function loadAccountCheck(): Promise<{ checks: AccountCheck[]; livemode: boolean | null } | { error: string }> {
  const stripe = stripeClient();
  if (!stripe) return { error: "Stripe ist nicht eingerichtet (STRIPE_SECRET_KEY fehlt)." };
  try {
    const [account, taxNumber, taxIds] = await Promise.all([
      stripe.accounts.retrieveCurrent(),
      loadTaxNumber(),
      stripe.taxIds
        .list({ limit: 100 })
        .then((r) => r.data.map((t) => ({ id: t.id, value: t.value, type: t.type })))
        .catch(() => undefined),
    ]);
    const testmode = isTestKey(process.env.STRIPE_SECRET_KEY);
    return { checks: checkAccount(account, taxNumber, { testmode, accountTaxIds: taxIds }), livemode: !testmode };
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
