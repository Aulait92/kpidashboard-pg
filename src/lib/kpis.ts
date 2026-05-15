import { prisma } from "@/lib/prisma";
import type { DateRange } from "@/lib/date-ranges";

export { PRODUCTS, type Product } from "@/lib/products";

export type KpiFilters = {
  range: DateRange;
  customerId?: string | null;
  product?: string | null;
};

export type Kpis = {
  totalLeads: number;
  reachedLeads: number;
  closedLeads: number;
  reachabilityRate: number | null; // 0..1
  avgContactAttempts: number | null;
  avgHoursToFirstContact: number | null;
  closingRate: number | null; // 0..1
  revenue: number;
  leadCosts: number;
  otherCosts: number;
  costPerLead: number | null;
  profitBeforeOther: number;
  profitAfterOther: number;
  marginBeforeOther: number | null; // 0..1
  marginAfterOther: number | null; // 0..1
};

function decToNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  // Prisma Decimal exposes toNumber()
  const obj = v as { toNumber?: () => number };
  if (typeof obj.toNumber === "function") return obj.toNumber();
  return Number(v);
}

function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseMonthStart(key: string): Date {
  const [y, m] = key.split("-").map((s) => Number.parseInt(s, 10));
  return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
}

function parseMonthEnd(key: string): Date {
  const [y, m] = key.split("-").map((s) => Number.parseInt(s, 10));
  return new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
}

// Meta-Kosten sind global (customerId=null). Mit Kunden-Filter müssen sie
// anteilig nach Lead-Anteil pro (Monat × Produkt) auf den Kunden umgelegt
// werden, sonst fallen sie komplett aus der Kunden-Sicht raus.
async function computeLeadCosts(params: {
  range: DateRange;
  customerId: string | null;
  product: string | null;
}): Promise<number> {
  const { range, customerId, product } = params;
  const productClause = product ? { product } : {};

  if (!customerId) {
    const agg = await prisma.cost.aggregate({
      _sum: { amount: true },
      where: {
        ...productClause,
        kind: "LEAD",
        occurredAt: { gte: range.from, lte: range.to },
      },
    });
    return decToNumber(agg._sum.amount);
  }

  const [directAgg, globalCosts] = await Promise.all([
    prisma.cost.aggregate({
      _sum: { amount: true },
      where: {
        ...productClause,
        customerId,
        kind: "LEAD",
        occurredAt: { gte: range.from, lte: range.to },
      },
    }),
    prisma.cost.findMany({
      where: {
        ...productClause,
        customerId: null,
        kind: "LEAD",
        product: { not: null },
        occurredAt: { gte: range.from, lte: range.to },
      },
      select: { product: true, amount: true, occurredAt: true },
    }),
  ]);

  const direct = decToNumber(directAgg._sum.amount);
  if (globalCosts.length === 0) return direct;

  const costMonthKeys = globalCosts.map((c) => monthKey(c.occurredAt));
  const minKey = costMonthKeys.reduce((a, b) => (a < b ? a : b));
  const maxKey = costMonthKeys.reduce((a, b) => (a > b ? a : b));
  const usedProducts = Array.from(
    new Set(
      globalCosts
        .map((c) => c.product)
        .filter((p): p is string => p !== null),
    ),
  );

  const leads = await prisma.lead.findMany({
    where: {
      source: { in: usedProducts },
      createdAt: {
        gte: parseMonthStart(minKey),
        lte: parseMonthEnd(maxKey),
      },
    },
    select: { source: true, customerId: true, createdAt: true },
  });

  // Bucket: "YYYY-MM|product" → { total, forCustomer }
  const stats = new Map<string, { total: number; forCustomer: number }>();
  for (const l of leads) {
    if (!l.source) continue;
    const key = `${monthKey(l.createdAt)}|${l.source}`;
    const s = stats.get(key) ?? { total: 0, forCustomer: 0 };
    s.total += 1;
    if (l.customerId === customerId) s.forCustomer += 1;
    stats.set(key, s);
  }

  let prorated = 0;
  for (const c of globalCosts) {
    const key = `${monthKey(c.occurredAt)}|${c.product}`;
    const s = stats.get(key);
    if (!s || s.total === 0) continue;
    prorated += decToNumber(c.amount) * (s.forCustomer / s.total);
  }

  return direct + prorated;
}

export async function computeKpis(filters: KpiFilters): Promise<Kpis> {
  const { range, customerId, product } = filters;
  const customerClause = customerId ? { customerId } : {};
  const productLeadClause = product ? { source: product } : {};
  const productRevenueClause = product
    ? { lead: { is: { source: product } } }
    : {};

  const [
    leads,
    revenueAgg,
    leadCosts,
    otherCostsAgg,
  ] = await Promise.all([
    prisma.lead.findMany({
      where: {
        ...customerClause,
        ...productLeadClause,
        createdAt: { gte: range.from, lte: range.to },
      },
      select: {
        id: true,
        createdAt: true,
        firstContactAt: true,
        closedAt: true,
        reached: true,
        contactAttempts: true,
      },
    }),
    prisma.revenue.aggregate({
      _sum: { amount: true },
      where: {
        ...customerClause,
        ...productRevenueClause,
        occurredAt: { gte: range.from, lte: range.to },
      },
    }),
    computeLeadCosts({
      range,
      customerId: customerId ?? null,
      product: product ?? null,
    }),
    prisma.cost.aggregate({
      _sum: { amount: true },
      where: {
        ...customerClause,
        kind: "OTHER",
        // OTHER-Kosten nur in der Gesamtansicht (kein Produktfilter) zählen.
        ...(product ? { id: "__never__" } : {}),
        occurredAt: { gte: range.from, lte: range.to },
      },
    }),
  ]);

  const totalLeads = leads.length;
  const reachedLeads = leads.filter((l) => l.reached).length;
  const closedLeads = leads.filter((l) => l.closedAt != null).length;

  const reachabilityRate =
    totalLeads > 0 ? reachedLeads / totalLeads : null;
  const closingRate = totalLeads > 0 ? closedLeads / totalLeads : null;

  const avgContactAttempts =
    totalLeads > 0
      ? leads.reduce((acc, l) => acc + l.contactAttempts, 0) / totalLeads
      : null;

  const hoursList = leads
    .filter((l) => l.firstContactAt)
    .map(
      (l) =>
        (l.firstContactAt!.getTime() - l.createdAt.getTime()) / 1000 / 3600,
    );
  const avgHoursToFirstContact =
    hoursList.length > 0
      ? hoursList.reduce((a, b) => a + b, 0) / hoursList.length
      : null;

  const revenue = decToNumber(revenueAgg._sum.amount);
  const otherCosts = decToNumber(otherCostsAgg._sum.amount);

  const costPerLead = totalLeads > 0 ? leadCosts / totalLeads : null;
  const profitBeforeOther = revenue - leadCosts;
  const profitAfterOther = revenue - leadCosts - otherCosts;
  const marginBeforeOther = revenue > 0 ? profitBeforeOther / revenue : null;
  const marginAfterOther = revenue > 0 ? profitAfterOther / revenue : null;

  return {
    totalLeads,
    reachedLeads,
    closedLeads,
    reachabilityRate,
    avgContactAttempts,
    avgHoursToFirstContact,
    closingRate,
    revenue,
    leadCosts,
    otherCosts,
    costPerLead,
    profitBeforeOther,
    profitAfterOther,
    marginBeforeOther,
    marginAfterOther,
  };
}

export async function listCustomers() {
  return prisma.customer.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
