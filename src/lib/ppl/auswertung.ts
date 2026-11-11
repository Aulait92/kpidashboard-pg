// Pay-per-Lead-Auswertung (Admin): Übersicht je Kunde (Woche/Monat) und
// Tages-/Wochen-/Monatszahlen mit Ablehnungen, Reklamationen, Leadpreis und
// Wirtschaftlichkeit.
//
// Gemeinsame Basis für beide Lieferwege (heute Airtable-Abgleich, künftig
// App-Engine): verkaufte Leads = Revenue-Zeilen (cancelled = reklamiert/
// storniert), Produkt = Lead.source. Eingang und Ablehnungen durch uns: heute
// aus dem Airtable-Eingang (PplIntake, alle Lead-Records inkl. aussortierter),
// nach der Umstellung aus der App-Engine (PoolLead). Leads ohne Produkt
// (z. B. Pflege-Check) zählen nicht zu Pay-per-Lead.

import { prisma } from "@/lib/prisma";
import { loadKpiSettings } from "@/lib/zahlen";
import { productKeyOf } from "@/lib/produkte";
import { netCost } from "@/lib/bank/rules";
import { berlinMidnight, monthRange, weekRange } from "@/lib/ppl/periods";
import { INTAKE_SINCE } from "@/lib/ppl/intake";

const TZ = "Europe/Berlin";
const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type Granularity = "tag" | "woche" | "monat";
export const GRANULARITIES: { key: Granularity; label: string; count: number }[] = [
  { key: "tag", label: "Tag", count: 14 },
  { key: "woche", label: "Woche", count: 12 },
  { key: "monat", label: "Monat", count: 12 },
];

export const REJECT_LABELS = {
  dublette: "Dublette",
  schwach: "schwach",
  beamter: "Beamter",
  gebiet: "außerhalb Gebiet",
  ungueltig: "ungültig",
  weitergabe: "Weitergabe abgelehnt",
  kein_abnehmer: "kein Abnehmer (geparkt)",
} as const;
export type RejectKey = keyof typeof REJECT_LABELS;

/** Ablehnungsgrund eines Pool-Leads (Status/Begründung der Engine) → Kategorie. */
export function rejectCategory(status: string, reason: string | null): RejectKey | null {
  if (status === "delivered") return null;
  if (status === "duplicate") return "dublette";
  if (status === "invalid") return "ungueltig";
  const r = (reason ?? "").toLowerCase();
  if (/plz/.test(r)) return "gebiet";
  if (/beamt/.test(r)) return "beamter";
  if (/schwach/.test(r)) return "schwach";
  return "kein_abnehmer";
}

// ─── Zeiträume ───────────────────────────────────────────────────────────

function berlinYmd(d: Date): { y: number; m: number; d: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}
const pad = (n: number) => String(n).padStart(2, "0");

export type Bucket = { key: string; label: string; start: Date; end: Date; current: boolean };

/** Die letzten `count` Zeiträume bis einschließlich des laufenden (älteste zuerst). */
export function buckets(g: Granularity, now = new Date(), count = GRANULARITIES.find((x) => x.key === g)!.count): Bucket[] {
  const out: Bucket[] = [];
  const { y, m, d } = berlinYmd(now);
  for (let i = count - 1; i >= 0; i--) {
    if (g === "tag") {
      const local = new Date(Date.UTC(y, m - 1, d - i));
      const start = berlinMidnight(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
      const next = new Date(Date.UTC(y, m - 1, d - i + 1));
      const end = berlinMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
      out.push({ key: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`, label: `${pad(local.getUTCDate())}.${pad(local.getUTCMonth() + 1)}.`, start, end, current: i === 0 });
    } else if (g === "woche") {
      const r = weekRange(now, -i);
      const s = berlinYmd(r.start);
      const e = berlinYmd(new Date(r.end.getTime() - DAY / 2));
      out.push({ key: `${s.y}-${pad(s.m)}-${pad(s.d)}`, label: `${pad(s.d)}.${pad(s.m)}.–${pad(e.d)}.${pad(e.m)}.`, start: r.start, end: r.end, current: i === 0 });
    } else {
      const mm = new Date(Date.UTC(y, m - 1 - i, 15));
      const r = monthRange(new Date(berlinMidnight(mm.getUTCFullYear(), mm.getUTCMonth() + 1, 15)));
      out.push({ key: `${mm.getUTCFullYear()}-${pad(mm.getUTCMonth() + 1)}`, label: new Intl.DateTimeFormat("de-DE", { timeZone: TZ, month: "short", year: "2-digit" }).format(r.start), start: r.start, end: r.end, current: i === 0 });
    }
  }
  return out;
}

// ─── Reine Aggregation (getestet) ───────────────────────────────────────

export type SaleRow = { at: Date; product: string; amount: number; cancelled: boolean };
export type PoolRow = { at: Date; product: string; status: string; reason: string | null };
/** Airtable-Eingang (PplIntake): Ergebnis geliefert | abgelehnt | offen. */
export type IntakeRow = { at: Date; product: string; outcome: string; reason: string | null };

/** Ablehnungsgrund aus dem Airtable-Eingang → Kategorie. */
export function intakeRejectCategory(reason: string | null): RejectKey {
  const r = (reason ?? "").toLowerCase();
  if (r.startsWith("dublette")) return "dublette";
  if (r.startsWith("weitergabe")) return "weitergabe";
  if (r.startsWith("beamt")) return "beamter";
  if (r.startsWith("schwach")) return "schwach";
  return "kein_abnehmer";
}
export type CostRow = { at: Date; product: string | null; amount: number };
/** Direkte PPL-Kosten ohne Produkt (Bank/Karte netto, laufende Kosten anteilig je Tag). */
export type OtherCostRow = { at: Date; amount: number };

export type ReportRow = {
  key: string;
  label: string;
  current: boolean;
  received: number | null;
  /** eingegangen, aber noch nicht entschieden (wartet auf Zustimmung, in Bearbeitung) */
  pending: number;
  delivered: number;
  rejected: Record<RejectKey, number>;
  rejectedTotal: number;
  complaints: number;
  metaCost: number;
  otherCost: number;
  cplBefore: number | null;
  cplAfterReject: number | null;
  cplAfterComplaints: number | null;
  revenue: number;
  spend: number;
  profit: number;
  margin: number | null;
};

const emptyRejects = (): Record<RejectKey, number> => ({ dublette: 0, schwach: 0, beamter: 0, gebiet: 0, ungueltig: 0, weitergabe: 0, kein_abnehmer: 0 });

export function aggregateReport(input: {
  buckets: Bucket[];
  sales: SaleRow[];
  pool: PoolRow[];
  intake?: IntakeRow[];
  costs: CostRow[];
  other: OtherCostRow[];
  product: string | null;
  /** ab wann Eingangsdaten vorliegen (frühester PoolLead bzw. Airtable-Eingang) */
  poolSince: Date | null;
}): ReportRow[] {
  const inB = (b: Bucket, at: Date) => at >= b.start && at < b.end;
  const prodOk = (p: string | null) => !input.product || p === input.product;
  return input.buckets.map((b) => {
    const sales = input.sales.filter((s) => inB(b, s.at) && prodOk(s.product));
    const delivered = sales.length;
    const complaints = sales.filter((s) => s.cancelled).length;
    const revenue = r2(sales.filter((s) => !s.cancelled).reduce((n, s) => n + s.amount, 0));
    const rejected = emptyRejects();
    let poolRejected = 0;
    for (const p of input.pool) {
      if (!inB(b, p.at) || !prodOk(p.product)) continue;
      const k = rejectCategory(p.status, p.reason);
      if (k) {
        rejected[k]++;
        poolRejected++;
      }
    }
    let intakeCount = 0;
    let pending = 0;
    for (const i of input.intake ?? []) {
      if (!inB(b, i.at) || !prodOk(i.product)) continue;
      intakeCount++;
      if (i.outcome === "abgelehnt") rejected[intakeRejectCategory(i.reason)]++;
      else if (i.outcome === "offen") pending++;
    }
    const rejectedTotal = Object.values(rejected).reduce((n, v) => n + v, 0);
    // Eingang nur, wenn im ganzen Zeitraum Eingangsdaten vorliegen (sonst unbekannt).
    // Airtable-Eingang zählt alle Leads; nach der Umstellung: geliefert + abgelehnt.
    const received = input.poolSince && input.poolSince <= b.start ? Math.max(intakeCount + poolRejected, delivered + rejectedTotal + pending) : null;
    const metaCost = r2(input.costs.filter((c) => inB(b, c.at) && prodOk(c.product)).reduce((n, c) => n + c.amount, 0));
    const otherCost = input.product ? 0 : r2(input.other.filter((c) => inB(b, c.at)).reduce((n, c) => n + c.amount, 0));
    const spend = r2(metaCost + otherCost);
    const profit = r2(revenue - spend);
    const div = (a: number, n: number | null) => (n && n > 0 ? r2(a / n) : null);
    return {
      key: b.key,
      label: b.label,
      current: b.current,
      received,
      pending,
      delivered,
      rejected,
      rejectedTotal,
      complaints,
      metaCost,
      otherCost,
      cplBefore: div(metaCost, received ?? (rejectedTotal ? delivered + rejectedTotal : null)),
      cplAfterReject: div(metaCost, delivered),
      cplAfterComplaints: div(metaCost, delivered - complaints),
      revenue,
      spend,
      profit,
      margin: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null,
    };
  });
}

// ─── Laden ───────────────────────────────────────────────────────────────

export type PplReport = { granularity: Granularity; product: string | null; products: string[]; rows: ReportRow[]; poolSince: string | null; otherCostNote: boolean };

export async function loadPplReport(g: Granularity, productRaw: string | null, now = new Date()): Promise<PplReport> {
  const bs = buckets(g, now);
  const from = bs[0].start;
  const to = bs[bs.length - 1].end;
  const settings = await loadKpiSettings();
  const acq = settings.acquisitionCampaigns.map((c) => c.toLowerCase());
  const [revenues, pool, costs, firstPool, bank, recurring, intake, firstIntake] = await Promise.all([
    prisma.revenue.findMany({
      where: { occurredAt: { gte: from, lt: to }, customer: { plan: { not: "internal" } } },
      select: { occurredAt: true, amount: true, cancelled: true, lead: { select: { source: true } } },
    }),
    prisma.poolLead.findMany({ where: { createdAt: { gte: from, lt: to }, status: { not: "delivered" } }, select: { createdAt: true, productKey: true, status: true, reason: true } }),
    prisma.cost.findMany({ where: { kind: "LEAD", occurredAt: { gte: from, lt: to } }, select: { occurredAt: true, product: true, amount: true, note: true } }),
    prisma.poolLead.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.bankTransaction.findMany({
      where: { status: "zugeordnet", costPurpose: "ppl", amount: { lt: 0 }, bookingDate: { gte: new Date(from.getTime() - DAY), lt: to } },
      select: { bookingDate: true, amount: true, vatIncluded: true },
    }),
    prisma.recurringCost.findMany({ where: { purpose: "ppl" } }),
    prisma.pplIntake.findMany({
      where: { receivedAt: { gte: from, lt: to }, productKey: { not: null } },
      select: { receivedAt: true, productKey: true, outcome: true, reason: true },
    }),
    prisma.pplIntake.findFirst({ where: { productKey: { not: null } }, orderBy: { receivedAt: "asc" }, select: { receivedAt: true } }),
  ]);
  const sales: SaleRow[] = revenues.map((r) => ({ at: r.occurredAt, product: productKeyOf(r.lead?.source), amount: Number(r.amount), cancelled: r.cancelled }));
  const poolRows: PoolRow[] = pool.map((p) => ({ at: p.createdAt, product: productKeyOf(p.productKey), status: p.status, reason: p.reason }));
  const intakeRows: IntakeRow[] = intake.map((i) => ({ at: i.receivedAt, product: productKeyOf(i.productKey), outcome: i.outcome, reason: i.reason }));
  // Der Airtable-Eingang ist ab INTAKE_SINCE vollständig (alle Leads, auch abgelehnte)
  const dataSince = [firstPool?.createdAt, firstIntake ? INTAKE_SINCE : null].filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  // Meta-Kosten Pay-per-Lead: ohne eigene Akquise-Kampagnen (wie Zahlen-Seite/BWA)
  const costRows: CostRow[] = costs
    .filter((c) => !acq.some((a) => (c.note ?? "").toLowerCase().includes(a)))
    .map((c) => ({ at: c.occurredAt, product: c.product ? productKeyOf(c.product) : null, amount: Number(c.amount) }));
  const other: OtherCostRow[] = bank.map((t) => ({ at: new Date(t.bookingDate.getTime() + 12 * 3600_000), amount: netCost(Number(t.amount), t.vatIncluded) }));
  // Laufende Kosten (Zweck ppl): Monatsbetrag gleichmäßig auf die Tage verteilt
  for (let t = new Date(from); t < to; t = new Date(t.getTime() + DAY)) {
    const noon = new Date(t.getTime() + 12 * 3600_000);
    const { y, m } = berlinYmd(noon);
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (const rc of recurring) {
      if (rc.startsAt > noon || (rc.endsAt && rc.endsAt < noon)) continue;
      other.push({ at: noon, amount: Number(rc.monthlyAmount) / dim });
    }
  }
  const products = [...new Set([...sales.map((s) => s.product), ...costRows.map((c) => c.product).filter((p): p is string => !!p)])].sort();
  const product = productRaw && products.includes(productRaw) ? productRaw : null;
  const rows = aggregateReport({ buckets: bs, sales, pool: poolRows, intake: intakeRows, costs: costRows, other, product, poolSince: dataSince });
  return { granularity: g, product, products, rows, poolSince: dataSince?.toISOString() ?? null, otherCostNote: !!product };
}

// ─── Übersicht je Kunde (diese Woche / dieser Monat) ────────────────────

export type PeriodStats = { ordered: number | null; expected: number | null; delivered: number; complaints: number; revenue: number; behind: boolean };
export type CustomerOverviewRow = { customerId: string; customer: string; product: string; week: PeriodStats; month: PeriodStats; source: "app" | "airtable" };

/** Liegt zurück: geliefert < anteilige Bestellmenge (mindestens 1 Lead Rückstand). */
export function periodStats(ordered: number | null, elapsedShare: number, sales: Pick<SaleRow, "amount" | "cancelled">[], prorate = true): PeriodStats {
  const delivered = sales.length;
  const expected = ordered == null ? null : prorate ? Math.floor(ordered * Math.min(1, Math.max(0, elapsedShare))) : ordered;
  return {
    ordered,
    expected,
    delivered,
    complaints: sales.filter((s) => s.cancelled).length,
    revenue: r2(sales.filter((s) => !s.cancelled).reduce((n, s) => n + s.amount, 0)),
    behind: expected != null && delivered + 1 <= expected,
  };
}

export async function loadCustomerOverview(now = new Date()): Promise<CustomerOverviewRow[]> {
  const week = weekRange(now);
  const month = monthRange(now);
  const from = week.start < month.start ? week.start : month.start;
  const [subs, cps, revenues] = await Promise.all([
    prisma.leadSubscription.findMany({
      where: { active: true, customer: { plan: { not: "internal" } } },
      select: { id: true, customerId: true, productKey: true, period: true, goal: true, customer: { select: { name: true } }, areas: { select: { quantity: true, period: true } }, orders: { where: { periodStart: { gte: new Date(month.start.getTime() - 7 * DAY), lt: month.end }, status: { in: ["paid", "processing"] } }, select: { periodStart: true, quantity: true } } },
    }),
    prisma.customerProduct.findMany({
      where: { leadGoal: { gt: 0 }, customer: { archived: false, plan: { not: "internal" } } },
      select: { customerId: true, leadGoal: true, product: { select: { name: true } }, customer: { select: { name: true } } },
    }),
    prisma.revenue.findMany({
      where: { occurredAt: { gte: from, lt: month.end > week.end ? month.end : week.end }, customer: { plan: { not: "internal" } } },
      select: { customerId: true, occurredAt: true, amount: true, cancelled: true, lead: { select: { source: true } }, customer: { select: { name: true } } },
    }),
  ]);
  const share = (r: { start: Date; end: Date }) => (now.getTime() - r.start.getTime()) / (r.end.getTime() - r.start.getTime());
  type Acc = { customerId: string; customer: string; product: string; source: "app" | "airtable"; weekOrdered: number | null; monthOrdered: number | null; weekProrate: boolean };
  const acc = new Map<string, Acc>();
  const keyOf = (c: string, p: string) => `${c}|${p}`;
  for (const s of subs) {
    const product = productKeyOf(s.productKey);
    let weekOrdered: number | null = null;
    let monthOrdered: number | null = null;
    let weekProrate = true;
    if (s.period === "week") {
      weekOrdered = s.orders.find((o) => o.periodStart.getTime() === week.start.getTime())?.quantity ?? 0;
      monthOrdered = s.orders.filter((o) => o.periodStart >= month.start).reduce((n, o) => n + o.quantity, 0);
      weekProrate = true;
    } else {
      const goal = s.goal ?? (s.areas.length ? s.areas.reduce((n, a) => n + a.quantity, 0) : null);
      monthOrdered = s.period === "month" ? goal : null;
      weekOrdered = monthOrdered != null ? Math.round((monthOrdered * 7) / ((month.end.getTime() - month.start.getTime()) / DAY)) : null;
    }
    const k = keyOf(s.customerId, product);
    const prev = acc.get(k);
    acc.set(k, {
      customerId: s.customerId,
      customer: s.customer.name,
      product,
      source: "app",
      weekOrdered: (prev?.weekOrdered ?? 0) + (weekOrdered ?? 0) || weekOrdered,
      monthOrdered: (prev?.monthOrdered ?? 0) + (monthOrdered ?? 0) || monthOrdered,
      weekProrate,
    });
  }
  // Airtable-Bezüge (Monatsziel) nur, wenn es für Kunde+Produkt keinen App-Bezug gibt
  for (const cp of cps) {
    const product = productKeyOf(cp.product.name);
    const k = keyOf(cp.customerId, product);
    if (acc.has(k)) continue;
    const days = (month.end.getTime() - month.start.getTime()) / DAY;
    acc.set(k, { customerId: cp.customerId, customer: cp.customer.name, product, source: "airtable", monthOrdered: cp.leadGoal, weekOrdered: Math.round(((cp.leadGoal ?? 0) * 7) / days), weekProrate: true });
  }
  // Kunden mit Verkäufen, aber ohne Bezug/Ziel
  for (const r of revenues) {
    const product = productKeyOf(r.lead?.source);
    const k = keyOf(r.customerId, product);
    if (!acc.has(k)) acc.set(k, { customerId: r.customerId, customer: r.customer.name, product, source: "airtable", weekOrdered: null, monthOrdered: null, weekProrate: true });
  }
  const rows: CustomerOverviewRow[] = [];
  for (const a of acc.values()) {
    const mine = revenues.filter((r) => r.customerId === a.customerId && productKeyOf(r.lead?.source) === a.product);
    const toSale = (r: (typeof mine)[number]) => ({ amount: Number(r.amount), cancelled: r.cancelled });
    const inR = (rg: { start: Date; end: Date }) => mine.filter((r) => r.occurredAt >= rg.start && r.occurredAt < rg.end).map(toSale);
    rows.push({
      customerId: a.customerId,
      customer: a.customer,
      product: a.product,
      source: a.source,
      week: periodStats(a.weekOrdered, share(week), inR(week), a.weekProrate),
      month: periodStats(a.monthOrdered, share(month), inR(month)),
    });
  }
  return rows.sort((x, y) => x.customer.localeCompare(y.customer, "de") || x.product.localeCompare(y.product, "de"));
}
