// WhatsApp-Gebühren von Meta erfassen und (nur wenn PRICE_LIST.whatsappIncluded
// false ist) an Kunden weiterberechnen. Seit 11.11.2026 sind sie im Preis
// enthalten: die Weiterberechnung im Cron ist abgeschaltet, die Erfassung
// (feeUsage, monthlyFeeCosts) bleibt für die Marge auf der Zahlen-Seite.
//
// Grundlage: Meta meldet je ausgehender Nachricht im Status-Webhook, ob sie
// berechnet wird und in welcher Kategorie (Message.billable/pricingCategory).
// Gezählt werden nur Nachrichten mit billable = true. Preise je Kategorie in
// EUR (Meta-Tarif Deutschland); anpassbar über WHATSAPP_FEES_EUR, z. B.
// {"marketing":0.1131,"utility":0.0456,"authentication":0.0456,"service":0.0456}.
// Abgleich mit der 360dialog-Abrechnung: docs/whatsapp-gebuehren.md.

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { PRICE_LIST } from "@/lib/offer-pricing";

export const FEE_CATEGORIES = ["marketing", "utility", "authentication", "service"] as const;
export type FeeCategory = (typeof FEE_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<FeeCategory, string> = {
  marketing: "Marketing",
  utility: "Service-Vorlage",
  authentication: "Bestätigungscode",
  service: "Antwort im Gespräch",
};

const DEFAULT_RATES: Record<FeeCategory, number> = {
  marketing: 0.1131,
  utility: 0.0456,
  authentication: 0.0456,
  service: 0.0456,
};

export function feeRates(): Record<FeeCategory, number> {
  const raw = process.env.WHATSAPP_FEES_EUR?.trim();
  if (!raw) return DEFAULT_RATES;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<FeeCategory, number>>;
    const out = { ...DEFAULT_RATES };
    for (const k of FEE_CATEGORIES) if (typeof parsed[k] === "number" && parsed[k]! >= 0) out[k] = parsed[k]!;
    return out;
  } catch {
    reportError(new Error("WHATSAPP_FEES_EUR ist kein gültiges JSON – Standardpreise werden verwendet."), "whatsapp-fees");
    return DEFAULT_RATES;
  }
}

export type FeeUsage = { counts: Record<FeeCategory, number>; amount: number };

/** "2026-11" → [1.11. 00:00 Berlin, 1.12. 00:00 Berlin) als UTC-Zeitpunkte. */
export function monthRange(month: string): { from: Date; to: Date } {
  const [y, m] = month.split("-").map(Number);
  return { from: berlinMidnight(y, m, 1), to: berlinMidnight(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) };
}

function berlinMidnight(y: number, m: number, d: number): Date {
  // Mitternacht Berlin = 23:00 bzw. 22:00 UTC am Vortag; Offset über Intl ermitteln.
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const berlin = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (berlin.getTime() - utc.getTime()));
}

/** Monat in Berliner Zeit, z. B. "2026-11". offset -1 = Vormonat. */
export function berlinMonth(now = new Date(), offset = 0): string {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  const idx = y * 12 + (m - 1) + offset;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** Berechnete Nachrichten eines Kunden in einem Monat. */
export async function feeUsage(customerId: string, month: string): Promise<FeeUsage> {
  const { from, to } = monthRange(month);
  const rows = await prisma.message.groupBy({
    by: ["pricingCategory"],
    where: {
      billable: true,
      direction: "outbound",
      createdAt: { gte: from, lt: to },
      conversation: { customerId },
    },
    _count: { _all: true },
  });
  return priceCounts(Object.fromEntries(rows.map((r) => [r.pricingCategory ?? "marketing", r._count._all])));
}

export function priceCounts(raw: Record<string, number>): FeeUsage {
  const rates = feeRates();
  const counts = Object.fromEntries(FEE_CATEGORIES.map((k) => [k, 0])) as Record<FeeCategory, number>;
  for (const [k, n] of Object.entries(raw)) {
    // Unbekannte Kategorien (z. B. referral_conversion) wie Marketing behandeln.
    const cat = (FEE_CATEGORIES as readonly string[]).includes(k) ? (k as FeeCategory) : "marketing";
    counts[cat] += n;
  }
  const amount = Math.round(FEE_CATEGORIES.reduce((sum, k) => sum + counts[k] * rates[k], 0) * 100) / 100;
  return { counts, amount };
}

export function describeCounts(counts: Record<FeeCategory, number>): string {
  return FEE_CATEGORIES.filter((k) => counts[k] > 0)
    .map((k) => `${counts[k]} × ${CATEGORY_LABEL[k]}`)
    .join(", ");
}

const MONTH_DE = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
};

export type ChargeResult = { month: string; charged: number; manual: number; skipped: number; errors: string[] };

/**
 * Gebühren eines Monats für alle Kunden abrechnen. Idempotent: je Kunde und
 * Monat höchstens ein Eintrag. Mit Stripe-Kunde → Rechnungsposten, der an der
 * nächsten Abo-Rechnung hängt; sonst nur festhalten (von Hand abrechnen).
 */
export async function chargeWhatsAppFees(month: string): Promise<ChargeResult> {
  const res: ChargeResult = { month, charged: 0, manual: 0, skipped: 0, errors: [] };
  const customers = await prisma.customer.findMany({
    where: { whatsAppAccount: { isNot: null }, whatsAppFees: { none: { month } } },
    select: { id: true, name: true, stripeCustomerId: true },
  });
  const { addInvoiceItem } = await import("@/lib/billing");
  const toStripe = async (chargeId: string, customerId: string, stripeCustomerId: string, usage: FeeUsage) => {
    const itemId = await addInvoiceItem({
      stripeCustomerId,
      amountEur: usage.amount,
      description: `WhatsApp-Gebühren Meta ${MONTH_DE(month)}: ${describeCounts(usage.counts)}`,
      idempotencyKey: `wa-fees-${customerId}-${month}`,
      metadata: { customer_id: customerId, month, kind: "whatsapp_fees" },
    });
    await prisma.whatsAppFeeCharge.update({ where: { id: chargeId }, data: { stripeInvoiceItemId: itemId } });
  };

  // Früher fehlgeschlagene Stripe-Übertragungen nachholen (gleicher Idempotenz-Schlüssel).
  const pending = await prisma.whatsAppFeeCharge.findMany({
    where: { month, stripeInvoiceItemId: null, customer: { stripeCustomerId: { not: null } } },
    select: { id: true, customerId: true, counts: true, amount: true, customer: { select: { name: true, stripeCustomerId: true } } },
  });
  for (const p of pending) {
    try {
      await toStripe(p.id, p.customerId, p.customer.stripeCustomerId!, { counts: p.counts as Record<FeeCategory, number>, amount: Number(p.amount) });
      res.charged++;
    } catch (err) {
      reportError(err, "whatsapp-fees", { customer: p.customerId, month });
      res.errors.push(`${p.customer.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const c of customers) {
    try {
      const usage = await feeUsage(c.id, month);
      if (usage.amount <= 0) {
        res.skipped++;
        continue;
      }
      // Erst festhalten (unique je Monat), dann Stripe → nie doppelt berechnet.
      const charge = await prisma.whatsAppFeeCharge.create({
        data: { customerId: c.id, month, counts: usage.counts, amount: usage.amount },
      });
      if (!c.stripeCustomerId) {
        res.manual++;
        continue;
      }
      await toStripe(charge.id, c.id, c.stripeCustomerId, usage);
      res.charged++;
    } catch (err) {
      reportError(err, "whatsapp-fees", { customer: c.id, month });
      res.errors.push(`${c.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return res;
}

/** WhatsApp-Gebühren aller Kunden je Monat („YYYY-MM“, Berliner Zeit) – für die Kosten auf der Zahlen-Seite. */
export async function monthlyFeeCosts(from: Date): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ month: string; category: string | null; n: number }[]>`
    SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin', 'YYYY-MM') AS month,
           "pricingCategory" AS category, COUNT(*)::int AS n
    FROM "Message"
    WHERE direction = 'outbound' AND billable = true AND "createdAt" >= ${from}
    GROUP BY 1, 2`;
  const rates = feeRates();
  const out = new Map<string, number>();
  for (const r of rows) {
    const cat = (FEE_CATEGORIES as readonly string[]).includes(r.category ?? "") ? (r.category as FeeCategory) : "marketing";
    out.set(r.month, Math.round(((out.get(r.month) ?? 0) + r.n * rates[cat]) * 100) / 100);
  }
  return out;
}

/**
 * Weiterberechnung im Cron fällig? Nur am 1.–3. (Berliner Zeit) und nur, wenn die
 * Gebühren nicht im Preis enthalten sind (PRICE_LIST.whatsappIncluded).
 */
export function feeChargeDue(berlinDay: number, included: boolean = PRICE_LIST.whatsappIncluded): boolean {
  return berlinDay <= 3 && !included;
}
