import {
  addDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { de } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import type { DateRange } from "@/lib/date-ranges";
import { previousRange } from "@/lib/date-ranges";

export { PRODUCTS, type Product } from "@/lib/products";

export type KpiFilters = {
  range: DateRange;
  customerId?: string | null;
  product?: string | null;
};

export type Kpis = {
  totalLeads: number;
  reachedLeads: number;
  terminLeads: number;
  closedLeads: number;
  // Ungültige Leads (Spaß-/Fake-Anfrage o. ä.) mit Status „Storno".
  // validLeads = totalLeads - cancelledLeads — die „brauchbaren" Leads.
  cancelledLeads: number;
  validLeads: number;
  // cancelledLeads / totalLeads. null wenn keine Leads.
  cancellationRate: number | null;
  reachabilityRate: number | null; // 0..1
  terminRate: number | null; // termin / reached
  closingFromTerminRate: number | null; // closed / termin
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
        cancelledAt: true,
        reached: true,
        contactAttempts: true,
        status: true,
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
  const terminLeads = leads.filter(
    (l) => l.status != null && TERMIN_STATUSES.has(l.status),
  ).length;
  const closedLeads = leads.filter((l) => l.closedAt != null).length;
  const cancelledLeads = leads.filter((l) => l.cancelledAt != null).length;
  const validLeads = totalLeads - cancelledLeads;
  const cancellationRate =
    totalLeads > 0 ? cancelledLeads / totalLeads : null;

  const reachabilityRate =
    totalLeads > 0 ? reachedLeads / totalLeads : null;
  const terminRate = reachedLeads > 0 ? terminLeads / reachedLeads : null;
  const closingFromTerminRate =
    terminLeads > 0 ? closedLeads / terminLeads : null;
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
    terminLeads,
    closedLeads,
    cancelledLeads,
    validLeads,
    cancellationRate,
    reachabilityRate,
    terminRate,
    closingFromTerminRate,
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

const TERMIN_STATUSES = new Set([
  "Termin vereinbart",
  "Angebot/Beratung läuft",
  "Abschluss",
]);

export async function listCustomers() {
  return prisma.customer.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export type CustomerKpiRow = {
  customerId: string;
  customerName: string;
  totalLeads: number;
  reachedLeads: number;
  terminLeads: number;
  closedLeads: number;
  cancelledLeads: number;
  cancellationRate: number | null;
  reachabilityRate: number | null;
  closingRate: number | null;
  avgHoursToFirstContact: number | null;
  revenue: number;
  leadCosts: number;
  costPerLead: number | null;
  profit: number;
  margin: number | null;
};

// Pro-Kunde-KPIs für die Leaderboard-Tabelle. Globale Meta-Kosten werden
// pro (Monat × Produkt) nach Lead-Anteil auf die Kunden umgelegt — Summe
// über alle Kunden entspricht damit dem ungefilterten Gesamtwert.
export async function computeCustomerLeaderboard(params: {
  range: DateRange;
  product: string | null;
}): Promise<CustomerKpiRow[]> {
  const { range, product } = params;
  const productLeadClause = product ? { source: product } : {};
  const productRevenueClause = product
    ? { lead: { is: { source: product } } }
    : {};
  const productCostClause = product ? { product } : {};

  const [customers, leads, revenueByCustomer, directCostByCustomer, globalCosts] =
    await Promise.all([
      prisma.customer.findMany({ select: { id: true, name: true } }),
      prisma.lead.findMany({
        where: {
          ...productLeadClause,
          createdAt: { gte: range.from, lte: range.to },
        },
        select: {
          customerId: true,
          reached: true,
          closedAt: true,
          cancelledAt: true,
          status: true,
          createdAt: true,
          firstContactAt: true,
        },
      }),
      prisma.revenue.groupBy({
        by: ["customerId"],
        _sum: { amount: true },
        where: {
          ...productRevenueClause,
          occurredAt: { gte: range.from, lte: range.to },
        },
      }),
      prisma.cost.groupBy({
        by: ["customerId"],
        _sum: { amount: true },
        where: {
          ...productCostClause,
          kind: "LEAD",
          customerId: { not: null },
          occurredAt: { gte: range.from, lte: range.to },
        },
      }),
      prisma.cost.findMany({
        where: {
          ...productCostClause,
          customerId: null,
          kind: "LEAD",
          product: { not: null },
          occurredAt: { gte: range.from, lte: range.to },
        },
        select: { product: true, amount: true, occurredAt: true },
      }),
    ]);

  const proratedByCustomer = new Map<string, number>();
  if (globalCosts.length > 0) {
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
    const leadsForProration = await prisma.lead.findMany({
      where: {
        source: { in: usedProducts },
        createdAt: {
          gte: parseMonthStart(minKey),
          lte: parseMonthEnd(maxKey),
        },
      },
      select: { source: true, customerId: true, createdAt: true },
    });

    const buckets = new Map<
      string,
      { total: number; perCustomer: Map<string, number> }
    >();
    for (const l of leadsForProration) {
      if (!l.source) continue;
      const key = `${monthKey(l.createdAt)}|${l.source}`;
      let b = buckets.get(key);
      if (!b) {
        b = { total: 0, perCustomer: new Map() };
        buckets.set(key, b);
      }
      b.total += 1;
      b.perCustomer.set(
        l.customerId,
        (b.perCustomer.get(l.customerId) ?? 0) + 1,
      );
    }

    for (const c of globalCosts) {
      const key = `${monthKey(c.occurredAt)}|${c.product}`;
      const b = buckets.get(key);
      if (!b || b.total === 0) continue;
      const amount = decToNumber(c.amount);
      for (const [customerId, count] of b.perCustomer) {
        proratedByCustomer.set(
          customerId,
          (proratedByCustomer.get(customerId) ?? 0) +
            (amount * count) / b.total,
        );
      }
    }
  }

  const leadStatsByCustomer = new Map<
    string,
    {
      total: number;
      reached: number;
      termin: number;
      closed: number;
      cancelled: number;
      hours: number[];
    }
  >();
  for (const l of leads) {
    let s = leadStatsByCustomer.get(l.customerId);
    if (!s) {
      s = { total: 0, reached: 0, termin: 0, closed: 0, cancelled: 0, hours: [] };
      leadStatsByCustomer.set(l.customerId, s);
    }
    s.total += 1;
    if (l.reached) s.reached += 1;
    if (l.status && TERMIN_STATUSES.has(l.status)) s.termin += 1;
    if (l.closedAt != null) s.closed += 1;
    if (l.cancelledAt != null) s.cancelled += 1;
    if (l.firstContactAt) {
      s.hours.push(
        (l.firstContactAt.getTime() - l.createdAt.getTime()) / 1000 / 3600,
      );
    }
  }

  const revenueByCustomerId = new Map<string, number>();
  for (const r of revenueByCustomer) {
    if (r.customerId) {
      revenueByCustomerId.set(r.customerId, decToNumber(r._sum.amount));
    }
  }

  const directCostByCustomerId = new Map<string, number>();
  for (const c of directCostByCustomer) {
    if (c.customerId) {
      directCostByCustomerId.set(c.customerId, decToNumber(c._sum.amount));
    }
  }

  const rows: CustomerKpiRow[] = customers.map((c) => {
    const stat = leadStatsByCustomer.get(c.id) ?? {
      total: 0,
      reached: 0,
      termin: 0,
      closed: 0,
      cancelled: 0,
      hours: [] as number[],
    };
    const revenue = revenueByCustomerId.get(c.id) ?? 0;
    const direct = directCostByCustomerId.get(c.id) ?? 0;
    const prorated = proratedByCustomer.get(c.id) ?? 0;
    const leadCosts = direct + prorated;
    const profit = revenue - leadCosts;
    const avgHoursToFirstContact =
      stat.hours.length > 0
        ? stat.hours.reduce((a, b) => a + b, 0) / stat.hours.length
        : null;
    return {
      customerId: c.id,
      customerName: c.name,
      totalLeads: stat.total,
      reachedLeads: stat.reached,
      terminLeads: stat.termin,
      closedLeads: stat.closed,
      cancelledLeads: stat.cancelled,
      cancellationRate: stat.total > 0 ? stat.cancelled / stat.total : null,
      reachabilityRate: stat.total > 0 ? stat.reached / stat.total : null,
      closingRate: stat.total > 0 ? stat.closed / stat.total : null,
      avgHoursToFirstContact,
      revenue,
      leadCosts,
      costPerLead: stat.total > 0 ? leadCosts / stat.total : null,
      profit,
      margin: revenue > 0 ? profit / revenue : null,
    };
  });

  return rows.filter(
    (r) => r.totalLeads > 0 || r.revenue > 0 || r.leadCosts > 0,
  );
}

export type ProductKpiRow = {
  product: string;
  totalLeads: number;
  reachedLeads: number;
  closedLeads: number;
  cancelledLeads: number;
  cancellationRate: number | null;
  reachabilityRate: number | null;
  closingRate: number | null;
  revenue: number;
  leadCosts: number;
  costPerLead: number | null;
  profit: number;
  margin: number | null;
};

export async function computeProductBreakdown(params: {
  range: DateRange;
  customerId: string | null;
}): Promise<ProductKpiRow[]> {
  const { range, customerId } = params;
  const customerClause = customerId ? { customerId } : {};

  const [leads, revenues] = await Promise.all([
    prisma.lead.findMany({
      where: {
        ...customerClause,
        source: { not: null },
        createdAt: { gte: range.from, lte: range.to },
      },
      select: {
        source: true,
        reached: true,
        closedAt: true,
        cancelledAt: true,
      },
    }),
    prisma.revenue.findMany({
      where: {
        ...customerClause,
        occurredAt: { gte: range.from, lte: range.to },
        lead: { is: { source: { not: null } } },
      },
      select: { amount: true, lead: { select: { source: true } } },
    }),
  ]);

  const stats = new Map<
    string,
    {
      total: number;
      reached: number;
      closed: number;
      cancelled: number;
      revenue: number;
      leadCosts: number;
    }
  >();
  function s(p: string) {
    let x = stats.get(p);
    if (!x) {
      x = { total: 0, reached: 0, closed: 0, cancelled: 0, revenue: 0, leadCosts: 0 };
      stats.set(p, x);
    }
    return x;
  }

  for (const l of leads) {
    if (!l.source) continue;
    const x = s(l.source);
    x.total += 1;
    if (l.reached) x.reached += 1;
    if (l.closedAt != null) x.closed += 1;
    if (l.cancelledAt != null) x.cancelled += 1;
  }
  for (const r of revenues) {
    const src = r.lead?.source;
    if (!src) continue;
    s(src).revenue += decToNumber(r.amount);
  }

  // Lead-Kosten pro Produkt — wenn Kunden-Filter aktiv, anteilig; sonst
  // direkt summiert. Wir nutzen computeLeadCosts pro Produkt einmal.
  for (const p of Array.from(stats.keys())) {
    const cost = await computeLeadCosts({
      range,
      customerId: customerId ?? null,
      product: p,
    });
    s(p).leadCosts = cost;
  }

  return Array.from(stats.entries())
    .map(([product, x]) => {
      const profit = x.revenue - x.leadCosts;
      return {
        product,
        totalLeads: x.total,
        reachedLeads: x.reached,
        closedLeads: x.closed,
        cancelledLeads: x.cancelled,
        cancellationRate: x.total > 0 ? x.cancelled / x.total : null,
        reachabilityRate: x.total > 0 ? x.reached / x.total : null,
        closingRate: x.total > 0 ? x.closed / x.total : null,
        revenue: x.revenue,
        leadCosts: x.leadCosts,
        costPerLead: x.total > 0 ? x.leadCosts / x.total : null,
        profit,
        margin: x.revenue > 0 ? profit / x.revenue : null,
      };
    })
    .sort((a, b) => b.totalLeads - a.totalLeads);
}

export type Granularity = "day" | "week" | "month";

export type TimeSeriesPoint = {
  bucket: string; // ISO start date "YYYY-MM-DD"
  label: string;
  leads: number;
  reachedLeads: number;
  terminLeads: number;
  closedLeads: number;
  cancelledLeads: number;
  cancellationRate: number | null;
  reachabilityRate: number | null;
  closingRate: number | null;
  avgContactAttempts: number | null;
  avgHoursToFirstContact: number | null;
  revenue: number;
  leadCosts: number;
  otherCosts: number;
  costPerLead: number | null;
  costPerTermin: number | null;
  costPerClosed: number | null;
  profitBeforeOther: number;
  profitAfterOther: number;
  marginBeforeOther: number | null;
  marginAfterOther: number | null;
};

function pickGranularity(range: DateRange): Granularity {
  const days =
    (range.to.getTime() - range.from.getTime()) / (24 * 3600 * 1000);
  if (days <= 14) return "day";
  if (days <= 92) return "week";
  return "month";
}

function bucketStartFor(d: Date, g: Granularity): Date {
  if (g === "day") return startOfDay(d);
  if (g === "week") return startOfWeek(d, { weekStartsOn: 1 });
  return startOfMonth(d);
}

function generateBucketStarts(range: DateRange, g: Granularity): Date[] {
  const interval = { start: range.from, end: range.to };
  if (g === "day") return eachDayOfInterval(interval);
  if (g === "week")
    return eachWeekOfInterval(interval, { weekStartsOn: 1 });
  return eachMonthOfInterval(interval);
}

function formatBucketLabel(d: Date, g: Granularity): string {
  if (g === "day") return format(d, "dd.MM.", { locale: de });
  if (g === "week") return `KW ${format(d, "II", { locale: de })}`;
  return format(d, "MMM yy", { locale: de });
}

export async function computeTimeSeries(params: {
  range: DateRange;
  customerId: string | null;
  product: string | null;
}): Promise<{ points: TimeSeriesPoint[]; granularity: Granularity }> {
  const { range, customerId, product } = params;
  const granularity = pickGranularity(range);

  const customerClause = customerId ? { customerId } : {};
  const productLeadClause = product ? { source: product } : {};
  const productRevenueClause = product
    ? { lead: { is: { source: product } } }
    : {};
  const productCostClause = product ? { product } : {};

  const [leads, revenues, allLeadCosts, allOtherCosts] = await Promise.all([
    prisma.lead.findMany({
      where: {
        ...customerClause,
        ...productLeadClause,
        createdAt: { gte: range.from, lte: range.to },
      },
      select: {
        createdAt: true,
        firstContactAt: true,
        closedAt: true,
        cancelledAt: true,
        reached: true,
        contactAttempts: true,
        status: true,
      },
    }),
    prisma.revenue.findMany({
      where: {
        ...customerClause,
        ...productRevenueClause,
        occurredAt: { gte: range.from, lte: range.to },
      },
      select: { amount: true, occurredAt: true },
    }),
    prisma.cost.findMany({
      where: {
        ...productCostClause,
        kind: "LEAD",
        occurredAt: { gte: range.from, lte: range.to },
      },
      select: {
        customerId: true,
        product: true,
        amount: true,
        occurredAt: true,
      },
    }),
    // OTHER-Kosten nur wenn kein Produkt-Filter aktiv ist (OTHER ist nicht
    // produktspezifisch). Bei Customer-Filter ebenfalls bewusst gefiltert.
    product
      ? Promise.resolve([] as { amount: unknown; occurredAt: Date }[])
      : prisma.cost.findMany({
          where: {
            ...customerClause,
            kind: "OTHER",
            occurredAt: { gte: range.from, lte: range.to },
          },
          select: { amount: true, occurredAt: true },
        }),
  ]);

  // Buckets initialisieren — pro Bucket halten wir Hilfssummen für
  // anschließende Mittelwert-Berechnungen.
  type Accumulator = {
    point: TimeSeriesPoint;
    contactSum: number;
    hoursList: number[];
  };

  const acc = new Map<string, Accumulator>();
  for (const start of generateBucketStarts(range, granularity)) {
    const key = format(start, "yyyy-MM-dd");
    acc.set(key, {
      point: {
        bucket: key,
        label: formatBucketLabel(start, granularity),
        leads: 0,
        reachedLeads: 0,
        terminLeads: 0,
        closedLeads: 0,
        cancelledLeads: 0,
        cancellationRate: null,
        reachabilityRate: null,
        closingRate: null,
        avgContactAttempts: null,
        avgHoursToFirstContact: null,
        revenue: 0,
        leadCosts: 0,
        otherCosts: 0,
        costPerLead: null,
        costPerTermin: null,
        costPerClosed: null,
        profitBeforeOther: 0,
        profitAfterOther: 0,
        marginBeforeOther: null,
        marginAfterOther: null,
      },
      contactSum: 0,
      hoursList: [],
    });
  }

  function bucketFor(date: Date): Accumulator | undefined {
    const start = bucketStartFor(date, granularity);
    return acc.get(format(start, "yyyy-MM-dd"));
  }

  for (const l of leads) {
    const b = bucketFor(l.createdAt);
    if (!b) continue;
    b.point.leads += 1;
    if (l.reached) b.point.reachedLeads += 1;
    if (l.status && TERMIN_STATUSES.has(l.status)) b.point.terminLeads += 1;
    if (l.closedAt != null) b.point.closedLeads += 1;
    if (l.cancelledAt != null) b.point.cancelledLeads += 1;
    b.contactSum += l.contactAttempts;
    if (l.firstContactAt) {
      b.hoursList.push(
        (l.firstContactAt.getTime() - l.createdAt.getTime()) / 1000 / 3600,
      );
    }
  }
  for (const r of revenues) {
    const b = bucketFor(r.occurredAt);
    if (b) b.point.revenue += decToNumber(r.amount);
  }

  // Direkte LEAD-Kosten (customerId gesetzt) buchen wir am occurredAt;
  // globale Meta-Kosten verteilen wir gleichmäßig über die Tage des Monats,
  // damit Wochen-/Tages-Charts nicht nur am Monatsersten Spitzen zeigen.
  const directCosts = customerId
    ? allLeadCosts.filter((c) => c.customerId === customerId)
    : allLeadCosts.filter((c) => c.customerId != null);
  const globalCosts = allLeadCosts.filter(
    (c) => c.customerId == null && c.product != null,
  );

  for (const c of directCosts) {
    const b = bucketFor(c.occurredAt);
    if (b) b.point.leadCosts += decToNumber(c.amount);
  }

  if (globalCosts.length > 0) {
    let customerShare: Map<string, number> | null = null;
    if (customerId) {
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
      const leadsForShare = await prisma.lead.findMany({
        where: {
          source: { in: usedProducts },
          createdAt: {
            gte: parseMonthStart(minKey),
            lte: parseMonthEnd(maxKey),
          },
        },
        select: { source: true, customerId: true, createdAt: true },
      });
      const buckets = new Map<
        string,
        { total: number; forCustomer: number }
      >();
      for (const l of leadsForShare) {
        if (!l.source) continue;
        const key = `${monthKey(l.createdAt)}|${l.source}`;
        const s = buckets.get(key) ?? { total: 0, forCustomer: 0 };
        s.total += 1;
        if (l.customerId === customerId) s.forCustomer += 1;
        buckets.set(key, s);
      }
      customerShare = new Map();
      for (const [k, v] of buckets) {
        customerShare.set(k, v.total > 0 ? v.forCustomer / v.total : 0);
      }
    }

    for (const c of globalCosts) {
      let amount = decToNumber(c.amount);
      if (customerShare) {
        const share =
          customerShare.get(`${monthKey(c.occurredAt)}|${c.product}`) ?? 0;
        amount *= share;
      }
      if (amount === 0) continue;

      const monthStart = startOfMonth(c.occurredAt);
      const monthEnd = endOfMonth(c.occurredAt);
      const daysInMonth =
        Math.round(
          (monthEnd.getTime() - monthStart.getTime()) / (24 * 3600 * 1000),
        ) + 1;
      const perDay = amount / daysInMonth;

      const effectiveStart =
        monthStart.getTime() > range.from.getTime() ? monthStart : range.from;
      const effectiveEnd =
        monthEnd.getTime() < range.to.getTime() ? monthEnd : range.to;

      for (
        let day = startOfDay(effectiveStart);
        day.getTime() <= effectiveEnd.getTime();
        day = addDays(day, 1)
      ) {
        const b = bucketFor(day);
        if (b) b.point.leadCosts += perDay;
      }
    }
  }

  // OTHER-Kosten ebenfalls über die Tage des Monats verteilen — analog Meta.
  for (const c of allOtherCosts) {
    const amount = decToNumber(c.amount);
    if (amount === 0) continue;
    const monthStart = startOfMonth(c.occurredAt);
    const monthEnd = endOfMonth(c.occurredAt);
    const daysInMonth =
      Math.round(
        (monthEnd.getTime() - monthStart.getTime()) / (24 * 3600 * 1000),
      ) + 1;
    const perDay = amount / daysInMonth;
    const effectiveStart =
      monthStart.getTime() > range.from.getTime() ? monthStart : range.from;
    const effectiveEnd =
      monthEnd.getTime() < range.to.getTime() ? monthEnd : range.to;
    for (
      let day = startOfDay(effectiveStart);
      day.getTime() <= effectiveEnd.getTime();
      day = addDays(day, 1)
    ) {
      const b = bucketFor(day);
      if (b) b.point.otherCosts += perDay;
    }
  }

  for (const a of acc.values()) {
    const p = a.point;
    p.reachabilityRate = p.leads > 0 ? p.reachedLeads / p.leads : null;
    p.closingRate = p.leads > 0 ? p.closedLeads / p.leads : null;
    p.cancellationRate =
      p.leads > 0 ? p.cancelledLeads / p.leads : null;
    p.avgContactAttempts = p.leads > 0 ? a.contactSum / p.leads : null;
    p.avgHoursToFirstContact =
      a.hoursList.length > 0
        ? a.hoursList.reduce((x, y) => x + y, 0) / a.hoursList.length
        : null;
    p.costPerLead = p.leads > 0 ? p.leadCosts / p.leads : null;
    p.costPerTermin =
      p.terminLeads > 0 ? p.leadCosts / p.terminLeads : null;
    p.costPerClosed =
      p.closedLeads > 0 ? p.leadCosts / p.closedLeads : null;
    p.profitBeforeOther = p.revenue - p.leadCosts;
    p.profitAfterOther = p.revenue - p.leadCosts - p.otherCosts;
    p.marginBeforeOther = p.revenue > 0 ? p.profitBeforeOther / p.revenue : null;
    p.marginAfterOther = p.revenue > 0 ? p.profitAfterOther / p.revenue : null;
  }

  return {
    points: Array.from(acc.values())
      .map((a) => a.point)
      .sort((x, y) => x.bucket.localeCompare(y.bucket)),
    granularity,
  };
}

// ─── P&L (Gewinn- und Verlustrechnung) ───────────────────────────────────

export type PnLRow = {
  label: string;
  current: number;
  previous: number;
};

export type PnLSection = {
  rows: PnLRow[];
  totalCurrent: number;
  totalPrevious: number;
};

export type PnL = {
  range: DateRange;
  previousRange: DateRange;
  revenue: PnLSection;
  leadCosts: PnLSection;
  // null wenn Produkt-Filter aktiv (OTHER-Kosten sind nicht produktspezifisch).
  otherCosts: PnLSection | null;
  grossProfit: { current: number; previous: number };
  grossMargin: { current: number | null; previous: number | null };
  netProfit: { current: number; previous: number };
  netMargin: { current: number | null; previous: number | null };
};

function parseVendorFromNote(note: string | null | undefined): string {
  if (!note) return "Unbekannt";
  // Format aus airtable.ts: "Vendor (Kosten Mai 25)"
  const match = /^(.+?)\s*\(.*\)\s*$/.exec(note);
  return (match ? match[1] : note).trim() || "Unbekannt";
}

async function fetchOtherByVendor(params: {
  range: DateRange;
  customerId: string | null;
}): Promise<{ vendor: string; amount: number }[]> {
  const { range, customerId } = params;
  const customerClause = customerId ? { customerId } : {};

  const costs = await prisma.cost.findMany({
    where: {
      ...customerClause,
      kind: "OTHER",
      occurredAt: { gte: range.from, lte: range.to },
    },
    select: { amount: true, note: true },
  });

  const byVendor = new Map<string, number>();
  for (const c of costs) {
    const vendor = parseVendorFromNote(c.note);
    byVendor.set(
      vendor,
      (byVendor.get(vendor) ?? 0) + decToNumber(c.amount),
    );
  }

  return Array.from(byVendor.entries())
    .map(([vendor, amount]) => ({ vendor, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export async function computePnL(params: {
  range: DateRange;
  customerId: string | null;
  product: string | null;
}): Promise<PnL> {
  const { range, customerId, product } = params;
  const prev = previousRange(range);

  // Produkt-Breakdown für beide Perioden parallel.
  const [curProducts, prevProducts] = await Promise.all([
    computeProductBreakdown({ range, customerId }),
    computeProductBreakdown({ range: prev, customerId }),
  ]);

  const filterByProduct = (rows: ProductKpiRow[]) =>
    product ? rows.filter((r) => r.product === product) : rows;

  const curRows = filterByProduct(curProducts);
  const prevRows = filterByProduct(prevProducts);

  const prevByProduct = new Map(prevRows.map((r) => [r.product, r]));
  const allProducts = Array.from(
    new Set([
      ...curRows.map((r) => r.product),
      ...prevRows.map((r) => r.product),
    ]),
  ).sort();

  const revenueRows: PnLRow[] = allProducts.map((p) => {
    const cur = curRows.find((r) => r.product === p);
    const prv = prevByProduct.get(p);
    return {
      label: p,
      current: cur?.revenue ?? 0,
      previous: prv?.revenue ?? 0,
    };
  });

  const leadCostRows: PnLRow[] = allProducts.map((p) => {
    const cur = curRows.find((r) => r.product === p);
    const prv = prevByProduct.get(p);
    return {
      label: p,
      current: cur?.leadCosts ?? 0,
      previous: prv?.leadCosts ?? 0,
    };
  });

  const sumCurrent = (rows: PnLRow[]) =>
    rows.reduce((acc, r) => acc + r.current, 0);
  const sumPrevious = (rows: PnLRow[]) =>
    rows.reduce((acc, r) => acc + r.previous, 0);

  const revenueTotal = sumCurrent(revenueRows);
  const revenuePrev = sumPrevious(revenueRows);
  const leadCostsTotal = sumCurrent(leadCostRows);
  const leadCostsPrev = sumPrevious(leadCostRows);

  // OTHER-Kosten nur ohne Produkt-Filter — sie sind keinem Produkt zugeordnet.
  let otherCostsSection: PnLSection | null = null;
  if (!product) {
    const [curOther, prevOther] = await Promise.all([
      fetchOtherByVendor({ range, customerId }),
      fetchOtherByVendor({ range: prev, customerId }),
    ]);
    const prevByVendor = new Map(prevOther.map((r) => [r.vendor, r.amount]));
    const allVendors = Array.from(
      new Set([
        ...curOther.map((r) => r.vendor),
        ...prevOther.map((r) => r.vendor),
      ]),
    );
    const otherRows: PnLRow[] = allVendors
      .map((v) => {
        const cur = curOther.find((r) => r.vendor === v);
        return {
          label: v,
          current: cur?.amount ?? 0,
          previous: prevByVendor.get(v) ?? 0,
        };
      })
      .sort((a, b) => b.current - a.current);

    otherCostsSection = {
      rows: otherRows,
      totalCurrent: sumCurrent(otherRows),
      totalPrevious: sumPrevious(otherRows),
    };
  }

  const grossProfit = {
    current: revenueTotal - leadCostsTotal,
    previous: revenuePrev - leadCostsPrev,
  };
  const otherCur = otherCostsSection?.totalCurrent ?? 0;
  const otherPrev = otherCostsSection?.totalPrevious ?? 0;
  const netProfit = {
    current: grossProfit.current - otherCur,
    previous: grossProfit.previous - otherPrev,
  };

  return {
    range,
    previousRange: prev,
    revenue: {
      rows: revenueRows,
      totalCurrent: revenueTotal,
      totalPrevious: revenuePrev,
    },
    leadCosts: {
      rows: leadCostRows,
      totalCurrent: leadCostsTotal,
      totalPrevious: leadCostsPrev,
    },
    otherCosts: otherCostsSection,
    grossProfit,
    grossMargin: {
      current: revenueTotal > 0 ? grossProfit.current / revenueTotal : null,
      previous: revenuePrev > 0 ? grossProfit.previous / revenuePrev : null,
    },
    netProfit,
    netMargin: {
      current: revenueTotal > 0 ? netProfit.current / revenueTotal : null,
      previous: revenuePrev > 0 ? netProfit.previous / revenuePrev : null,
    },
  };
}

// ─── Stornogründe ────────────────────────────────────────────────────────

export type CancellationReasonRow = {
  reason: string;
  count: number;
};

export type CancellationBreakdown = {
  total: number;
  reasons: CancellationReasonRow[];
};

const UNKNOWN_REASON_LABEL = "Kein Grund angegeben";

export async function computeCancellationBreakdown(params: {
  range: DateRange;
  customerId: string | null;
  product: string | null;
}): Promise<CancellationBreakdown> {
  const { range, customerId, product } = params;
  const customerClause = customerId ? { customerId } : {};
  const productClause = product ? { source: product } : {};

  const leads = await prisma.lead.findMany({
    where: {
      ...customerClause,
      ...productClause,
      cancelledAt: { gte: range.from, lte: range.to },
    },
    select: { cancellationReason: true },
  });

  const byReason = new Map<string, number>();
  for (const l of leads) {
    const raw = l.cancellationReason?.trim();
    const key = raw && raw.length > 0 ? raw : UNKNOWN_REASON_LABEL;
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }

  const reasons = Array.from(byReason.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return { total: leads.length, reasons };
}
