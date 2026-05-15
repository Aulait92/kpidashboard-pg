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

export async function computeKpis(filters: KpiFilters): Promise<Kpis> {
  const { range, customerId, product } = filters;
  const customerClause = customerId ? { customerId } : {};
  const productLeadClause = product ? { source: product } : {};
  const productRevenueClause = product
    ? { lead: { is: { source: product } } }
    : {};
  // LEAD-Kosten haben jetzt ein product-Feld (aus Meta). Beim Produktfilter
  // exakt darauf einschränken; OTHER-Kosten sind nicht produkt-spezifisch
  // und werden ausgeblendet, wenn ein Produkt gefiltert ist.
  const productLeadCostClause = product ? { product } : {};

  const [
    leads,
    revenueAgg,
    leadCostsAgg,
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
    prisma.cost.aggregate({
      _sum: { amount: true },
      where: {
        ...customerClause,
        ...productLeadCostClause,
        kind: "LEAD",
        occurredAt: { gte: range.from, lte: range.to },
      },
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
  const leadCosts = decToNumber(leadCostsAgg._sum.amount);
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
