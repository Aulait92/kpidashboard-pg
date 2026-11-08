// Lead-Kosten aus Sicht eines Retainer-Kunden: eigenes Werbebudget (Spend aus
// seinem Meta-Werbekonto, CustomerAdSpend) + Retainer (tagesanteilig ab
// „Retainer seit"). Für Pro-Lead-Kunden gibt es hier nichts — dort bleiben die
// Lead-Kosten der Lead-Preis (Revenue).
//
// Bewusst getrennt von computeKpis(): Agentur-Umsatz/-Kosten (Admin-Sicht)
// bleiben unverändert; nur das Kunden-Dashboard rechnet mit diesen Kosten.

import { endOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";

export type CustomerSpend = {
  adSpend: number;
  retainer: number;
  total: number;
};

export type RetainerConfig = {
  retainerMonthly: number | null;
  retainerStart: Date | null;
  metaAdAccountId: string | null;
};

function toNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const obj = v as { toNumber?: () => number };
  if (typeof obj.toNumber === "function") return obj.toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Retainer-Konfiguration des Kunden, oder null für Pro-Lead-Kunden. */
export async function loadRetainerConfig(customerId: string): Promise<RetainerConfig | null> {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { retainerMonthly: true, retainerStart: true, metaAdAccountId: true },
  });
  if (!c) return null;
  const retainerMonthly = c.retainerMonthly == null ? null : toNumber(c.retainerMonthly);
  if (!retainerMonthly && !c.metaAdAccountId) return null;
  return { retainerMonthly, retainerStart: c.retainerStart, metaAdAccountId: c.metaAdAccountId };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Retainer tagesanteilig: jeder Tag kostet Monatsbetrag / Tage des Monats.
 * Gezählt werden nur Tage ab Retainer-Start und bis heute (keine Zukunft).
 */
export function retainerForRange(cfg: RetainerConfig, from: Date, to: Date): number {
  if (!cfg.retainerMonthly) return 0;
  const startBound = cfg.retainerStart ? Math.max(from.getTime(), cfg.retainerStart.getTime()) : from.getTime();
  const endBound = Math.min(to.getTime(), endOfDay(new Date()).getTime());
  if (endBound < startBound) return 0;
  let sum = 0;
  // Tagesweise in UTC iterieren (Datumsgrenzen genügen für die Anteilsrechnung).
  const first = new Date(startBound);
  let d = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
  while (d <= endBound) {
    const day = new Date(d);
    const daysInMonth = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
    sum += cfg.retainerMonthly / daysInMonth;
    d += DAY_MS;
  }
  return Math.round(sum * 100) / 100;
}

export async function adSpendForRange(customerId: string, from: Date, to: Date): Promise<number> {
  const agg = await prisma.customerAdSpend.aggregate({
    _sum: { amount: true },
    where: { customerId, date: { gte: from, lte: to } },
  });
  return toNumber(agg._sum.amount);
}

/** Lead-Kosten des Retainer-Kunden im Zeitraum, oder null für Pro-Lead-Kunden. */
export async function computeCustomerSpend(
  customerId: string,
  range: { from: Date; to: Date },
  cfg?: RetainerConfig | null,
): Promise<CustomerSpend | null> {
  const config = cfg === undefined ? await loadRetainerConfig(customerId) : cfg;
  if (!config) return null;
  const adSpend = config.metaAdAccountId ? await adSpendForRange(customerId, range.from, range.to) : 0;
  const retainer = retainerForRange(config, range.from, range.to);
  return { adSpend, retainer, total: adSpend + retainer };
}

/**
 * Lead-Kosten je Zeitreihen-Bucket (Bucket-Start „YYYY-MM-DD", aufsteigend).
 * Ein Bucket reicht bis zum nächsten Bucket-Start bzw. bis rangeEnd.
 */
export async function customerSpendForBuckets(
  customerId: string,
  bucketStarts: string[],
  rangeEnd: Date,
  cfg: RetainerConfig,
): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < bucketStarts.length; i++) {
    const from = new Date(`${bucketStarts[i]}T00:00:00.000Z`);
    const to =
      i + 1 < bucketStarts.length
        ? new Date(new Date(`${bucketStarts[i + 1]}T00:00:00.000Z`).getTime() - 1)
        : rangeEnd;
    const spend = await computeCustomerSpend(customerId, { from, to }, cfg);
    out.push(spend?.total ?? 0);
  }
  return out;
}

// ─── Retainer als Agentur-Umsatz (Admin-Sicht) ───────────────────────────
// Der Retainer ist für uns Umsatz — tagesanteilig ab „Retainer seit", genau
// wie im Kunden-Dashboard. Produkt-Zuordnung: das häufigste Lead-Produkt des
// Kunden (für Produktfilter / Produkt-Aufschlüsselung).

export type RetainerRevenueEntry = {
  customerId: string;
  product: string | null;
  amount: number;
};

type RetainerCustomer = { id: string; cfg: RetainerConfig; product: string | null };

async function loadRetainerCustomers(): Promise<RetainerCustomer[]> {
  const rows = await prisma.customer.findMany({
    where: { retainerMonthly: { not: null } },
    select: { id: true, retainerMonthly: true, retainerStart: true, metaAdAccountId: true },
  });
  const out: RetainerCustomer[] = [];
  for (const r of rows) {
    const monthly = toNumber(r.retainerMonthly);
    if (!monthly) continue;
    const top = await prisma.lead.groupBy({
      by: ["source"],
      where: { customerId: r.id, source: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { source: "desc" } },
      take: 1,
    });
    out.push({
      id: r.id,
      cfg: { retainerMonthly: monthly, retainerStart: r.retainerStart, metaAdAccountId: r.metaAdAccountId },
      product: top[0]?.source ?? null,
    });
  }
  return out;
}

/** Retainer-Umsatz je Kunde im Zeitraum (nur Kunden mit Betrag > 0). */
export async function retainerRevenueEntries(range: { from: Date; to: Date }): Promise<RetainerRevenueEntry[]> {
  const customers = await loadRetainerCustomers();
  return customers
    .map((c) => ({
      customerId: c.id,
      product: c.product,
      amount: retainerForRange(c.cfg, range.from, range.to),
    }))
    .filter((e) => e.amount > 0);
}

/** Summe passend zu den KPI-Filtern (Kunde/Produkt optional). */
export function sumRetainer(
  entries: RetainerRevenueEntry[],
  customerId?: string | null,
  product?: string | null,
): number {
  return entries
    .filter((e) => (!customerId || e.customerId === customerId) && (!product || e.product === product))
    .reduce((a, e) => a + e.amount, 0);
}

/** Retainer-Umsatz je Zeitreihen-Bucket (Bucket-Start „YYYY-MM-DD"). */
export async function retainerRevenueForBuckets(
  bucketStarts: string[],
  rangeEnd: Date,
  customerId: string | null,
  product: string | null,
): Promise<number[]> {
  const customers = (await loadRetainerCustomers()).filter(
    (c) => (!customerId || c.id === customerId) && (!product || c.product === product),
  );
  return bucketStarts.map((b, i) => {
    const from = new Date(`${b}T00:00:00.000Z`);
    const to =
      i + 1 < bucketStarts.length
        ? new Date(new Date(`${bucketStarts[i + 1]}T00:00:00.000Z`).getTime() - 1)
        : rangeEnd;
    return customers.reduce((a, c) => a + retainerForRange(c.cfg, from, to), 0);
  });
}
