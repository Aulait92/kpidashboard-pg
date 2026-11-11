// Daten der Admin-Zahlen-Seite (/admin/zahlen): lädt das Umsatzbuch und alle
// Kennzahlen in einem Rutsch und gibt ein serialisierbares Objekt zurück.
// Berechnungen ohne Datenbank stehen in revenue-ledger.ts (getestet).

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { effectiveRates, estimatedProvision } from "@/lib/provision";
import { annualMultiplier, PRICE_LIST } from "@/lib/offer-pricing";
import { monthlyBankCosts } from "@/lib/bank/server";
import { monthlyFeeCosts } from "@/lib/whatsapp/fees";
import { freeMonthsOf, type GarantieArt } from "@/lib/garantien";
import {
  activeCustomers,
  addMonths,
  avgMonthlyGrowth,
  buildLedger,
  churnRate,
  cohorts,
  concentration,
  daysInMonth,
  dayKey,
  monthKey,
  monthLabel,
  monthRange,
  mrrBridge,
  newCustomers,
  retention,
  totalsByMonth,
  type Bridge,
  type Cohort,
  type MonthInfo,
  type MonthTotals,
  type RetainerInput,
  breakdown,
  duplicateGroups,
  manualSetups,
  oneTimeByMonth,
  retentionBreakdown,
  type ManualEntry,
  type OneTimeMonth,
  type Stream,
} from "@/lib/revenue-ledger";

/** Pay-per-Lead startete im Juni 2026 – davor gibt es keine belastbaren Umsätze. */
export const FIRST_MONTH = "2026-06";
const DAY = 86_400_000;
// Nicht anerkannt storniert. Bewusst mit OR: `NOT stornoState = 'approved'`
// würde in SQL auch alle Leads ohne Storno-Status (NULL) ausschließen.
const NOT_STORNO = { OR: [{ stornoState: null }, { stornoState: { not: "approved" } }] };

export type CostPurpose = "ppl" | "software" | "akquise" | "betrieb";
export const COST_PURPOSE_LABEL: Record<CostPurpose, string> = {
  ppl: "Direkt: Pay-per-Lead",
  software: "Direkt: Software",
  akquise: "Kundengewinnung",
  betrieb: "Sonstiger Betrieb",
};

export type KpiSettingsData = {
  founderHoursPerWeek: number;
  founderHourlyRate: number;
  acquisitionCampaigns: string[];
  updateChallenges: string;
  updateNext: string;
};

export async function loadKpiSettings(): Promise<KpiSettingsData> {
  const s = await prisma.kpiSettings.findUnique({ where: { id: "default" } });
  return {
    founderHoursPerWeek: s?.founderHoursPerWeek ?? 20,
    founderHourlyRate: s ? Number(s.founderHourlyRate) : 60,
    acquisitionCampaigns: (s?.acquisitionCampaigns ?? "Allianz Lead Ads").split(",").map((x) => x.trim()).filter(Boolean),
    updateChallenges: s?.updateChallenges ?? "",
    updateNext: s?.updateNext ?? "",
  };
}

const n = (v: unknown) => (v == null ? 0 : Number(v));
const r2 = (x: number) => Math.round(x * 100) / 100;
const monthStart = (key: string) => new Date(`${key}-01T00:00:00.000Z`);

// ─── Umsatzbuch aus der Datenbank ────────────────────────────────────────

/** Felder des Kunden, die retainerInputFor braucht (auch für die Garantie-Prüfung). */
export const RETAINER_CUSTOMER_SELECT = {
  id: true,
  retainerMonthly: true,
  retainerStart: true,
  seatsBilled: true,
  seatMonthly: true,
  bestandMonthly: true,
  billingInterval: true,
  pauses: { where: { kind: "customer", status: { in: ["active", "ended"] } }, select: { startsAt: true, endsAt: true, resumedAt: true } },
} satisfies Prisma.CustomerSelect;

/** Retainer-Basis eines Kunden (Betreuung + Software + Zusätze), wie im Umsatzbuch. */
export function retainerInputFor(
  c: {
    id: string;
    retainerMonthly: unknown;
    retainerStart: Date | null;
    seatsBilled: number;
    seatMonthly: unknown;
    bestandMonthly: unknown;
    billingInterval: string;
    pauses: { startsAt: Date; endsAt: Date | null; resumedAt: Date | null }[];
  },
  offer: { softwareFee: unknown; introMonthlyFee: unknown; introMonths: number | null; annualFreeMonths: number | null } | undefined | null,
  end: Date | null,
  garantien: { art: string; monat: string }[] = [],
): RetainerInput {
  return {
    customerId: c.id,
    monthly: n(c.retainerMonthly),
    start: c.retainerStart,
    end,
    softwareShare: offer ? n(offer.softwareFee) : 0,
    intro: offer?.introMonthlyFee != null && offer.introMonths ? { amount: n(offer.introMonthlyFee), months: offer.introMonths } : null,
    // Weitere Logins und Bestandskunden-Modul zählen als Software (Stand heute, nicht historisch)
    extras: c.seatsBilled * n(c.seatMonthly) + n(c.bestandMonthly),
    // Jährlich im Voraus: MRR = Jahresbetrag / 12 (keine Spitze im Zahlungsmonat); Pausen ohne Gutschrift
    annualFactor: c.billingInterval === "year" ? annualMultiplier(offer?.annualFreeMonths ?? PRICE_LIST.annualFreeMonths) / 12 : 1,
    pauses: c.billingInterval === "year" ? [] : c.pauses.map((p) => ({ from: p.startsAt, to: p.resumedAt ?? p.endsAt })),
    freeMonths: freeMonthsOf(garantien.map((g) => ({ art: g.art as GarantieArt, monat: g.monat, status: "gewaehrt" as const }))),
  };
}

export async function loadLedger(now = new Date()) {
  const from = monthStart(addMonths(FIRST_MONTH, 0));
  // Interne Kunden (Paket „internal“, z. B. eigene Test- oder Firmenkäufer) sind keine
  // Kunden: weder Umsatz noch „Aktive Kunden“ noch MRR.
  const [ppl, retainerCustomers, acceptedOffers, manualRows] = await Promise.all([
    prisma.$queryRaw<{ customerId: string; month: string; amount: number; n: number }[]>`
      SELECT r."customerId", to_char((r."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin', 'YYYY-MM') AS month,
             SUM(r.amount)::float8 AS amount, COUNT(*)::int AS n
      FROM "Revenue" r
      LEFT JOIN "Customer" c ON c.id = r."customerId"
      WHERE r.cancelled = false AND r."occurredAt" >= ${new Date(from.getTime() - DAY)}
        AND (c.plan IS NULL OR c.plan <> 'internal')
      GROUP BY 1, 2`,
    prisma.customer.findMany({
      where: { retainerMonthly: { not: null }, plan: { not: "internal" } },
      select: {
        id: true,
        archived: true,
        retainerMonthly: true,
        retainerStart: true,
        retainerEnd: true,
        seatsBilled: true,
        seatMonthly: true,
        bestandMonthly: true,
        billingInterval: true,
        onboarding: { select: { offerId: true } },
        pauses: { where: { kind: "customer", status: { in: ["active", "ended"] } }, select: { startsAt: true, endsAt: true, resumedAt: true } },
      },
    }),
    prisma.offer.findMany({
      where: { status: "accepted" },
      select: { id: true, setupFee: true, softwareFee: true, introMonthlyFee: true, introMonths: true, subscriptionStatus: true, updatedAt: true, paidAt: true, acceptedAt: true, annualFreeMonths: true },
    }),
    prisma.manualRevenue.findMany({ orderBy: [{ month: "desc" }, { createdAt: "desc" }], include: { customer: { select: { name: true } } } }),
  ]);
  const offerById = new Map(acceptedOffers.map((o) => [o.id, o]));
  const onboardings = await prisma.onboarding.findMany({ where: { offerId: { not: null } }, select: { customerId: true, offerId: true } });
  const customerOfOffer = new Map(onboardings.map((o) => [o.offerId!, o.customerId]));

  // Ende archivierter Retainer: Monat des letzten Leads (bessere Info gibt es nicht).
  const archivedIds = retainerCustomers.filter((c) => c.archived).map((c) => c.id);
  const lastLeads = archivedIds.length
    ? await prisma.lead.groupBy({ by: ["customerId"], where: { customerId: { in: archivedIds } }, _max: { createdAt: true } })
    : [];
  const lastLeadOf = new Map(lastLeads.map((l) => [l.customerId, l._max.createdAt]));

  // Per Garantie kostenlose Monate senken den Umsatz (lib/garantien.ts)
  const granted = await prisma.garantieFall.findMany({ where: { status: "gewaehrt" }, select: { customerId: true, art: true, monat: true } });
  const retainers: RetainerInput[] = retainerCustomers.map((c) => {
    const offer = c.onboarding?.offerId ? offerById.get(c.onboarding.offerId) : undefined;
    let end: Date | null = null;
    if (c.retainerEnd) end = c.retainerEnd;
    else if (offer?.subscriptionStatus === "canceled") end = offer.updatedAt;
    else if (c.archived) end = lastLeadOf.get(c.id) ?? c.retainerStart ?? null;
    return retainerInputFor(c, offer, end, granted.filter((g) => g.customerId === c.id));
  });

  const offerSetups = acceptedOffers
    .filter((o) => n(o.setupFee) > 0 && (o.paidAt ?? o.acceptedAt))
    .map((o) => ({ customerId: customerOfOffer.get(o.id) ?? `angebot:${o.id}`, month: monthKey((o.paidAt ?? o.acceptedAt)!), amount: n(o.setupFee) }));
  // Von Hand nachgetragene Einmal-Umsätze (Admin → Zahlen) zählen ebenfalls als „setup“
  const manual: ManualEntry[] = manualRows.map((m) => ({ id: m.id, month: m.month, customerId: m.customerId, amount: n(m.amount), kind: m.kind }));
  const setups = [...offerSetups, ...manualSetups(manual)];

  const ledger = buildLedger({
    now,
    firstMonth: FIRST_MONTH,
    ppl: ppl.map((p) => ({ customerId: p.customerId, month: p.month, amount: p.amount })),
    retainers,
    setups,
  });
  return { ledger, pplCounts: ppl, offerSetups, manual, manualRows, offerOfCustomer: new Map(retainerCustomers.filter((c) => c.onboarding?.offerId && offerById.has(c.onboarding.offerId)).map((c) => [c.id, true])) };
}

// ─── Kosten je Monat und Zweck ───────────────────────────────────────────

export type MonthCosts = { month: string; ppl: number; software: number; akquise: number; betrieb: number; metaPpl: number; metaAkquise: number; whatsapp: number; /** davon aus Bank & Karten (netto) */ bank?: number };

export async function loadCosts(months: string[], settings: KpiSettingsData, now = new Date()) {
  const from = monthStart(months[0]);
  const patterns = settings.acquisitionCampaigns.length ? settings.acquisitionCampaigns.map((c) => `%${c}%`) : ["%__nie__%"];
  const [lead, other, recurring] = await Promise.all([
    prisma.$queryRaw<{ month: string; acq: number; direct: number }[]>`
      SELECT to_char(("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin', 'YYYY-MM') AS month,
             COALESCE(SUM(CASE WHEN note ILIKE ANY (${patterns}) THEN amount END), 0)::float8 AS acq,
             COALESCE(SUM(CASE WHEN note IS NULL OR NOT (note ILIKE ANY (${patterns})) THEN amount END), 0)::float8 AS direct
      FROM "Cost" WHERE kind = 'LEAD' AND "occurredAt" >= ${new Date(from.getTime() - DAY)}
      GROUP BY 1`,
    prisma.$queryRaw<{ month: string; amount: number }[]>`
      SELECT to_char(("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin', 'YYYY-MM') AS month, SUM(amount)::float8 AS amount
      FROM "Cost" WHERE kind = 'OTHER' AND "occurredAt" >= ${new Date(from.getTime() - DAY)}
      GROUP BY 1`,
    prisma.recurringCost.findMany({ orderBy: [{ purpose: "asc" }, { name: "asc" }] }),
  ]);
  // Zugeordnete Ausgaben aus Bank & Karten (netto), je Monat und Zweck
  const bank = await monthlyBankCosts(new Date(from.getTime() - DAY));
  // WhatsApp-Gebühren sind im Preis enthalten → direkte Software-Kosten (nie Umsatz).
  // Ohne Inklusiv-Preis werden sie weiterberechnet und sind durchlaufend (weder Umsatz noch Kosten).
  const waFees = PRICE_LIST.whatsappIncluded ? await monthlyFeeCosts(new Date(from.getTime() - DAY)) : new Map<string, number>();
  const current = monthKey(now);
  const costs: MonthCosts[] = months.map((m) => {
    const l = lead.find((x) => x.month === m);
    const o = other.find((x) => x.month === m);
    const c: MonthCosts = { month: m, ppl: 0, software: 0, akquise: 0, betrieb: n(o?.amount), metaPpl: n(l?.direct), metaAkquise: n(l?.acq), whatsapp: waFees.get(m) ?? 0 };
    c.ppl += c.metaPpl;
    c.software += c.whatsapp;
    c.akquise += c.metaAkquise;
    const b = bank.get(m);
    if (b) {
      c.bank = r2(b.ppl + b.software + b.akquise + b.betrieb);
      c.ppl += b.ppl;
      c.software += b.software;
      c.akquise += b.akquise;
      c.betrieb += b.betrieb;
    }
    for (const rc of recurring) {
      const share = recurringShare(rc.startsAt, rc.endsAt, m);
      if (share <= 0) continue;
      const purpose = (["ppl", "software", "akquise", "betrieb"].includes(rc.purpose) ? rc.purpose : "betrieb") as CostPurpose;
      c[purpose] += n(rc.monthlyAmount) * share;
    }
    // Laufender Monat: Meta-Kosten wie der Umsatz hochrechnen
    if (m === current) {
      const day = Number(dayKey(now).slice(8, 10));
      const f = daysInMonth(m) / Math.max(1, day);
      c.ppl += c.metaPpl * (f - 1);
      c.akquise += c.metaAkquise * (f - 1);
      c.metaPpl *= f;
      c.metaAkquise *= f;
    }
    for (const k of ["ppl", "software", "akquise", "betrieb", "metaPpl", "metaAkquise", "whatsapp"] as const) c[k] = r2(c[k]);
    return c;
  });
  return { costs, recurring };
}

/** Anteil eines Monats, in dem eine laufende Kosten-Position gilt (0–1). */
export function recurringShare(startsAt: Date, endsAt: Date | null, month: string): number {
  const dim = daysInMonth(month);
  const first = Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
  const last = first + (dim - 1) * DAY;
  const s = Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate());
  const e = endsAt ? Date.UTC(endsAt.getUTCFullYear(), endsAt.getUTCMonth(), endsAt.getUTCDate()) : Infinity;
  const a = Math.max(first, s);
  const b = Math.min(last, e);
  return b < a ? 0 : (Math.round((b - a) / DAY) + 1) / dim;
}

// ─── Seite ───────────────────────────────────────────────────────────────

export type ZahlenData = {
  generatedAt: string;
  months: MonthInfo[];
  current: string;
  lastComplete: string;
  totals: MonthTotals[];
  headline: {
    mrr: number;
    mrrPrev: number;
    contractual: number;
    arr: number;
    growth: number | null;
    avgGrowth: number | null;
    retention: { pct: number; customers: number; lag: number } | null;
    early: boolean;
    grossMargin: number | null;
    grossMarginPrev: number | null;
    active: number;
    activePrev: number;
    churnedTotal: number;
  };
  bridge: Bridge | null;
  cohorts: Cohort[];
  customersByStream: { ppl: number; service: number; software: number };
  churn: { rate: number; churned: number; avgActive: number } | null;
  concentration: { top: { name: string; pct: number }[]; topPct: number; largestPct: number; rest: number } | null;
  unit: {
    window: string[];
    newCustomers: number;
    acquisitionCosts: number;
    founderMonthly: number;
    cac: number | null;
    cacFounder: number | null;
    grossProfitPerCustomer: number | null;
    payback: number | null;
    paybackFounder: number | null;
    ltv: number | null;
    ltvCac: number | null;
    settings: { hours: number; rate: number };
  };
  margins: { ppl: number | null; service: number | null; software: number | null; total: number | null };
  costTable: { name: string; purpose: CostPurpose; amount: number; share: number | null }[];
  costTotal: number;
  impact: {
    window: string[];
    qualifying: number;
    totalCustomers: number;
    provision: number;
    revenue: number;
    perEuro: number | null;
    closes: number;
    leadsOfQualifying: number;
    funnel: { name: string; v: number }[];
    speedMedianSec: number | null;
    automatedShare: number | null;
  };
  sales: {
    funnel: { name: string; v: number }[];
    openOffers: number;
    openMrr: number;
    winRate: number | null;
    weighted: number | null;
    cycleDays: number | null;
    channels: { name: string; v: number }[];
  };
  ppl: {
    months: { month: string; leads: number; revenue: number; meta: number }[];
    avgPrice: number | null;
    costPerLead: number | null;
    leadMargin: number | null;
    stornoQuote: number | null;
    parked: number;
  };
  settings: KpiSettingsData;
  /** „Woraus besteht das?“ für die Kopfzahlen (nur Admin). */
  drill: {
    current: DrillMonth;
    last: DrillMonth;
    retention: { base: string; month: string; rows: { customerId: string; name: string; link: boolean; then: number; now: number }[] } | null;
    directCosts: { name: string; amount: number }[];
  };
  /** Live-Kunden mit Paket Betreuung/Software, aber ohne Betreuungsgebühr und ohne Angebot. */
  missingRetainer: { customerId: string; name: string; plan: string; liveSince: string | null }[];
  oneTime: {
    months: OneTimeMonth[];
    currentMonth: number;
    year: number;
    yearKey: string;
    entries: { id: string; month: string; customerId: string | null; customerName: string | null; amount: number; kind: string; note: string | null; createdBy: string | null }[];
  };
  customers: { id: string; name: string }[];
};

export type DrillCustomer = {
  customerId: string;
  name: string;
  /** Kundenakte verlinkbar (nicht bei Angebot ohne Kunde oder Nachtrag ohne Kunde) */
  link: boolean;
  total: number;
  /** Verkaufte Leads im Monat (nicht stornierte Revenue-Zeilen) */
  leads: number;
  streams: { stream: Stream; amount: number; source: string }[];
  /** Hinweise auf mögliche Nicht-Kunden (intern, Test, archiviert, wenige Leads, Dublette) */
  flags: string[];
};
export type DrillMonth = { month: string; projected: boolean; total: number; customers: DrillCustomer[] };

const PPL_SOURCE: Record<string, string> = {
  airtable: "Airtable-Abgleich",
  engine: "Pay-per-Lead-Engine",
  eingang: "Lead-Eingang",
  ohne: "Umsatz ohne Lead",
};
const TEST_NAME = /\b(test|demo|sandbox|muster|beispiel)\b/i;

const CHANNEL_LABEL: Record<string, string> = {
  COLD_CALL: "Kaltakquise Telefon",
  COLD_MAIL: "Cold Mail (Instantly)",
  LINKEDIN: "LinkedIn",
  META_ADS: "Meta-Anzeigen",
  EMPFEHLUNG: "Empfehlung",
  INBOUND: "Website/Inbound",
  NETZWERK: "Netzwerk",
  SONSTIGES: "Sonstiges",
};

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function loadZahlen(now = new Date()): Promise<ZahlenData> {
  const settings = await loadKpiSettings();
  const { ledger, pplCounts, offerSetups, manual, manualRows, offerOfCustomer } = await loadLedger(now);
  const keys = ledger.months.map((m) => m.key);
  const { costs, recurring } = await loadCosts(keys, settings, now);
  const { rows, current, lastComplete } = ledger;
  const totals = totalsByMonth(rows, keys);
  const tot = (m: string) => totals.find((t) => t.month === m);
  const cost = (m: string) => costs.find((c) => c.month === m);
  const complete = keys.filter((k) => k < current);

  // ── Kopfzeile ──
  const mrr = tot(current)?.recurring ?? 0;
  const mrrPrev = tot(lastComplete)?.recurring ?? 0;
  const firstWithRevenue = totals.find((t) => t.recurring > 0 && t.month < current);
  const avgGrowth = firstWithRevenue && firstWithRevenue.month < lastComplete
    ? avgMonthlyGrowth(firstWithRevenue.recurring, mrrPrev, monthRange(firstWithRevenue.month, lastComplete).length - 1)
    : null;
  const historyMonths = complete.filter((k) => (tot(k)?.recurring ?? 0) > 0).length;
  const lag = historyMonths >= 13 ? 12 : 3;
  const ret = historyMonths > lag ? retention(rows, lastComplete, lag) : null;
  const gm = (m: string) => {
    const t = tot(m);
    const c = cost(m);
    return t && t.recurring > 0 && c ? (t.recurring - c.ppl - c.software) / t.recurring : null;
  };
  const churn = churnRate(rows, complete);

  // ── Kunden ──
  const conc = concentration(rows, lastComplete);
  const names = conc
    ? new Map((await prisma.customer.findMany({ where: { id: { in: conc.top.map((t) => t.customerId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]))
    : new Map<string, string>();

  // ── Wirtschaftlichkeit (letzte 3 abgeschlossenen Monate) ──
  const window = complete.slice(-3);
  const newC = window.reduce((s, m) => s + newCustomers(rows, m), 0);
  const acq = window.reduce((s, m) => s + (cost(m)?.akquise ?? 0), 0);
  const founderMonthly = (settings.founderHoursPerWeek * 52 * settings.founderHourlyRate) / 12;
  const activeLast = activeCustomers(rows, lastComplete);
  const tLast = tot(lastComplete);
  const cLast = cost(lastComplete);
  const gpPerCustomer = tLast && cLast && activeLast ? (tLast.recurring - cLast.ppl - cLast.software) / activeLast : null;
  const cac = newC ? acq / newC : null;
  const cacFounder = newC ? (acq + founderMonthly * window.length) / newC : null;
  const lifetime = churn && churn.rate > 0 ? Math.min(24, 1 / churn.rate) : 24;
  const ltv = gpPerCustomer != null ? gpPerCustomer * lifetime : null;
  const margin = (rev: number, c: number) => (rev > 0 ? (rev - c) / rev : null);

  const costTable: ZahlenData["costTable"] = [];
  if (cLast) {
    const share = (a: number) => (tLast && tLast.recurring > 0 ? a / tLast.recurring : null);
    if (cLast.metaPpl) costTable.push({ name: "Meta-Werbung für Kunden-Leads", purpose: "ppl", amount: cLast.metaPpl, share: share(cLast.metaPpl) });
    if (cLast.whatsapp) costTable.push({ name: "WhatsApp-Gebühren (Meta, im Preis enthalten)", purpose: "software", amount: cLast.whatsapp, share: share(cLast.whatsapp) });
    if (cLast.metaAkquise) costTable.push({ name: `Meta-Werbung eigene Kundengewinnung (${settings.acquisitionCampaigns.join(", ")})`, purpose: "akquise", amount: cLast.metaAkquise, share: share(cLast.metaAkquise) });
    for (const rc of recurring) {
      const s = recurringShare(rc.startsAt, rc.endsAt, lastComplete);
      if (s <= 0) continue;
      const amount = r2(n(rc.monthlyAmount) * s);
      costTable.push({ name: rc.name, purpose: rc.purpose as CostPurpose, amount, share: share(amount) });
    }
    const other = r2(cLast.betrieb - costTable.filter((c) => c.purpose === "betrieb").reduce((s, c) => s + c.amount, 0));
    if (other > 0) costTable.push({ name: "Weitere Kosten (aus dem Dashboard)", purpose: "betrieb", amount: other, share: share(other) });
  }

  // ── Wirkung (gleiche 3 Monate, nach Lead-Eingang) ──
  const wFrom = window.length ? monthStart(window[0]) : monthStart(lastComplete);
  const wTo = monthStart(addMonths(lastComplete, 1));
  const [statusGroups, closedLeads, funnelReached, funnelAppt, speedRows, autoRows, waCustomers] = await Promise.all([
    prisma.lead.groupBy({
      by: ["customerId", "status"],
      where: { createdAt: { gte: wFrom, lt: wTo }, ...NOT_STORNO },
      _count: { _all: true },
    }),
    prisma.lead.findMany({
      where: { createdAt: { gte: wFrom, lt: wTo }, status: "Abschluss", ...NOT_STORNO },
      select: { customerId: true, source: true, closeValue: true },
    }),
    prisma.lead.count({ where: { createdAt: { gte: wFrom, lt: wTo }, reached: true, ...NOT_STORNO } }),
    prisma.appointment.findMany({ where: { lead: { createdAt: { gte: wFrom, lt: wTo } }, leadId: { not: null } }, distinct: ["leadId"], select: { leadId: true } }),
    prisma.$queryRaw<{ sec: number }[]>`
      SELECT EXTRACT(EPOCH FROM ("firstContactAt" - "createdAt"))::float8 AS sec FROM "Lead"
      WHERE "createdAt" >= ${wFrom} AND "createdAt" < ${wTo} AND "firstContactAt" IS NOT NULL AND "firstContactAt" >= "createdAt"`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(DISTINCT c."leadId")::int AS n FROM "Conversation" c
      JOIN "Lead" l ON l.id = c."leadId"
      WHERE l."createdAt" >= ${wFrom} AND l."createdAt" < ${wTo}
        AND EXISTS (SELECT 1 FROM "Message" m WHERE m."conversationId" = c.id AND m."sentBy" = 'bot' AND m.direction = 'outbound')`,
    prisma.whatsAppAccount.findMany({ select: { customerId: true } }),
  ]);
  const perCustomer = new Map<string, { total: number; withResult: number }>();
  let leadsTotal = 0;
  for (const g of statusGroups) {
    const c = perCustomer.get(g.customerId) ?? { total: 0, withResult: 0 };
    c.total += g._count._all;
    if (g.status && g.status !== "Neuer Lead") c.withResult += g._count._all;
    perCustomer.set(g.customerId, c);
    leadsTotal += g._count._all;
  }
  const qualifying = [...perCustomer.entries()].filter(([, c]) => c.total >= 5 && c.withResult / c.total >= 0.8).map(([id]) => id);
  const rateRows = qualifying.length
    ? await prisma.customer.findMany({ where: { id: { in: qualifying } }, select: { id: true, vermittlerTyp: true, provisionRates: true } })
    : [];
  const ratesOf = new Map(rateRows.map((c) => [c.id, effectiveRates(c.vermittlerTyp, c.provisionRates)]));
  const qSet = new Set(qualifying);
  const qClosed = closedLeads.filter((l) => qSet.has(l.customerId));
  const provision = qClosed.reduce((s, l) => s + (estimatedProvision(l.source, l.closeValue, ratesOf.get(l.customerId)) ?? 0), 0);
  const qRevenue = rows.filter((r) => r.recurring && qSet.has(r.customerId) && window.includes(r.month)).reduce((s, r) => s + r.amount, 0);
  const waSet = new Set(waCustomers.map((w) => w.customerId));
  const waLeads = [...perCustomer.entries()].filter(([id]) => waSet.has(id)).reduce((s, [, c]) => s + c.total, 0);

  // ── Vertrieb (90 Tage) ──
  const s90 = new Date(now.getTime() - 90 * DAY);
  const [contacted, replied, meetings, offersSent, offersAccepted, openOffers, cycleRows, channelRows] = await Promise.all([
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(DISTINCT id)::int AS n FROM (
        SELECT "contactId" AS id FROM "SalesEmail" WHERE direction = 'OUT' AND "sentAt" >= ${s90}
        UNION SELECT "contactId" FROM "SalesActivity" WHERE "occurredAt" >= ${s90} AND type IN ('ANRUF','EMAIL','COLD_MAIL','LINKEDIN')
      ) x`,
    prisma.salesEmail.findMany({ where: { direction: "IN", sentAt: { gte: s90 } }, distinct: ["contactId"], select: { contactId: true } }),
    prisma.salesMeeting.findMany({ where: { startAt: { gte: s90 } }, distinct: ["contactId"], select: { contactId: true } }),
    prisma.offer.findMany({ where: { sentAt: { gte: s90 }, status: { not: "superseded" } }, select: { status: true } }),
    prisma.offer.count({ where: { acceptedAt: { gte: s90 } } }),
    prisma.offer.findMany({ where: { status: "sent", validUntil: { gte: now } }, select: { monthlyFee: true } }),
    prisma.offer.findMany({
      where: { acceptedAt: { gte: new Date(now.getTime() - 180 * DAY) }, salesContactId: { not: null } },
      select: { acceptedAt: true, salesContact: { select: { createdAt: true } } },
    }),
    prisma.salesContact.groupBy({ by: ["customerSource"], where: { customerStage: { not: null } }, _count: { _all: true } }),
  ]);
  const decided = offersSent.filter((o) => o.status === "accepted" || o.status === "declined" || o.status === "sent").length;
  const won = offersSent.filter((o) => o.status === "accepted").length;
  const winRate = decided ? won / decided : null;
  const openMrr = openOffers.reduce((s, o) => s + n(o.monthlyFee), 0);
  const channelTotal = channelRows.reduce((s, c) => s + c._count._all, 0);

  // ── Pay-per-Lead ──
  const cancelled = await prisma.$queryRaw<{ month: string; n: number }[]>`
    SELECT to_char(("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin', 'YYYY-MM') AS month, COUNT(*)::int AS n
    FROM "Revenue" WHERE cancelled = true AND "occurredAt" >= ${monthStart(keys[0])} GROUP BY 1`;
  const pplMonths = keys.map((m) => {
    const rowsM = pplCounts.filter((p) => p.month === m);
    return { month: m, leads: rowsM.reduce((s, p) => s + p.n, 0), revenue: r2(rowsM.reduce((s, p) => s + p.amount, 0)), meta: cost(m)?.metaPpl ?? 0 };
  });
  const lastP = pplMonths.find((p) => p.month === lastComplete);
  const cancelledLast = cancelled.find((c) => c.month === lastComplete)?.n ?? 0;
  const parked = await prisma.poolLead.count({ where: { status: "parked" } });

  // ── Nachvollziehbarkeit: Woraus bestehen die Kopfzahlen? ──
  const drillMonths = [current, lastComplete];
  const pplSources = await prisma.$queryRaw<{ customerId: string; month: string; src: string; n: number }[]>`
    SELECT r."customerId", to_char((r."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin', 'YYYY-MM') AS month,
           CASE WHEN r."leadId" IS NULL THEN 'ohne'
                WHEN l."airtableId" IS NOT NULL THEN 'airtable'
                WHEN l."subscriptionId" IS NOT NULL OR l."orderId" IS NOT NULL THEN 'engine'
                ELSE 'eingang' END AS src,
           COUNT(*)::int AS n
    FROM "Revenue" r LEFT JOIN "Lead" l ON l.id = r."leadId"
    WHERE r.cancelled = false AND r."occurredAt" >= ${new Date(monthStart(lastComplete).getTime() - DAY)}
    GROUP BY 1, 2, 3`;
  const allCustomers = await prisma.customer.findMany({
    select: {
      id: true,
      name: true,
      plan: true,
      archived: true,
      users: { where: { role: "BUYER" }, select: { email: true } },
      salesContact: { select: { email: true } },
      leadSubscriptions: { select: { status: true, active: true } },
    },
    orderBy: { name: "asc" },
  });
  const custById = new Map(allCustomers.map((c) => [c.id, c]));
  const dupes = duplicateGroups(
    allCustomers.filter((c) => c.plan !== "internal").map((c) => ({ id: c.id, name: c.name, emails: [...c.users.map((u) => u.email), c.salesContact?.email ?? ""] })),
  );
  const nameOf = (id: string) => custById.get(id)?.name ?? (id.startsWith("nachtrag:") ? "Nachtrag ohne Kunde" : id.startsWith("angebot:") ? "Angebot ohne Kundenakte" : "Unbekannt");
  const leadsIn = (id: string, m: string) => pplCounts.filter((p) => p.customerId === id && p.month === m).reduce((a, p) => a + p.n, 0);
  const sourceOf = (id: string, m: string, stream: Stream) => {
    if (stream === "ppl") {
      const srcs = pplSources.filter((p) => p.customerId === id && p.month === m).sort((a, b) => b.n - a.n);
      return srcs.map((x) => (srcs.length > 1 ? `${PPL_SOURCE[x.src] ?? x.src} (${x.n})` : PPL_SOURCE[x.src] ?? x.src)).join(", ") || "Revenue";
    }
    if (stream === "setup") return id.startsWith("nachtrag:") ? "Nachtrag" : "Angebot";
    return offerOfCustomer.get(id) ? "Angebot" : "Retainer in Kundenakte";
  };
  const flagsOf = (id: string, m: string, streams: Stream[]) => {
    const c = custById.get(id);
    const f: string[] = [];
    if (!c) return f;
    if (c.plan === "internal") f.push("intern");
    if (TEST_NAME.test(c.name)) f.push("Test?");
    if (c.leadSubscriptions.length && c.leadSubscriptions.every((x) => x.status === "test")) f.push("nur Test-Bezug");
    if (c.archived) f.push("archiviert");
    const leads = leadsIn(id, m);
    if (streams.length === 1 && streams[0] === "ppl" && leads <= 2) f.push(`nur ${leads} ${leads === 1 ? "Lead" : "Leads"}`);
    for (const other of dupes.get(id) ?? []) f.push(`doppelt? wie „${nameOf(other)}“`);
    return f;
  };
  const drillMonth = (m: string): DrillMonth => {
    const customers = breakdown(rows, m).map((b) => ({
      customerId: b.customerId,
      name: nameOf(b.customerId),
      link: custById.has(b.customerId),
      total: b.total,
      leads: leadsIn(b.customerId, m),
      streams: b.streams.map((x) => ({ stream: x.stream, amount: x.amount, source: sourceOf(b.customerId, m, x.stream) })),
      flags: flagsOf(b.customerId, m, b.streams.map((x) => x.stream)),
    }));
    return { month: m, projected: m === current, total: r2(customers.reduce((a, c) => a + c.total, 0)), customers };
  };
  const retRows = ret ? retentionBreakdown(rows, lastComplete, lag) : [];

  // ── Hinweis: live, Paket Betreuung/Software, aber keine Betreuungsgebühr und kein Angebot ──
  const missingRows = await prisma.customer.findMany({
    where: {
      archived: false,
      plan: { in: ["software", "service"] },
      retainerMonthly: null,
      OR: [{ onboarding: { liveAt: { not: null } } }, { retainerStart: { lte: now } }],
    },
    select: { id: true, name: true, plan: true, retainerStart: true, onboarding: { select: { liveAt: true, offerId: true } } },
    orderBy: { name: "asc" },
  });
  const acceptedOfferIds = new Set((await prisma.offer.findMany({ where: { status: "accepted" }, select: { id: true } })).map((o) => o.id));
  const missingRetainer = missingRows
    .filter((c) => !(c.onboarding?.offerId && acceptedOfferIds.has(c.onboarding.offerId)))
    .map((c) => ({ customerId: c.id, name: c.name, plan: c.plan, liveSince: (c.onboarding?.liveAt ?? c.retainerStart)?.toISOString() ?? null }));

  // ── Einmal-Umsätze je Monat (eigener Zeitraum, auch vor Juni 2026) ──
  const oneTimeFrom = [FIRST_MONTH, ...manual.map((x) => x.month), ...offerSetups.map((x) => x.month)].filter((x) => x <= current).sort()[0];
  const oneTimeMonths = oneTimeByMonth(offerSetups, manual, monthRange(oneTimeFrom < addMonths(current, -23) ? addMonths(current, -23) : oneTimeFrom, current));
  const yearKey = current.slice(0, 4);
  const yearSum = oneTimeByMonth(offerSetups, manual, monthRange(`${yearKey}-01`, current)).reduce((a, m) => a + m.total, 0);

  return {
    generatedAt: now.toISOString(),
    months: ledger.months,
    current,
    lastComplete,
    totals,
    headline: {
      mrr,
      mrrPrev,
      contractual: r2((tot(current)?.service ?? 0) + (tot(current)?.software ?? 0)),
      arr: r2(mrr * 12),
      growth: mrrPrev > 0 ? mrr / mrrPrev - 1 : null,
      avgGrowth,
      retention: ret ? { ...ret, lag } : null,
      early: historyMonths < 13,
      grossMargin: gm(lastComplete),
      grossMarginPrev: gm(addMonths(lastComplete, -1)),
      active: activeLast,
      activePrev: activeCustomers(rows, addMonths(lastComplete, -1)),
      churnedTotal: churn?.churned ?? 0,
    },
    bridge: complete.length >= 2 ? mrrBridge(rows, addMonths(lastComplete, -1), lastComplete) : null,
    cohorts: cohorts(rows, complete),
    customersByStream: {
      ppl: activeCustomers(rows, lastComplete, "ppl"),
      service: activeCustomers(rows, lastComplete, "service"),
      software: activeCustomers(rows, lastComplete, "software"),
    },
    churn,
    concentration: conc ? { top: conc.top.map((t) => ({ name: names.get(t.customerId) ?? "Kunde", pct: t.pct })), topPct: conc.topPct, largestPct: conc.largestPct, rest: conc.rest } : null,
    unit: {
      window,
      newCustomers: newC,
      acquisitionCosts: r2(acq),
      founderMonthly: r2(founderMonthly),
      cac: cac == null ? null : r2(cac),
      cacFounder: cacFounder == null ? null : r2(cacFounder),
      grossProfitPerCustomer: gpPerCustomer == null ? null : r2(gpPerCustomer),
      payback: cac != null && gpPerCustomer ? cac / gpPerCustomer : null,
      paybackFounder: cacFounder != null && gpPerCustomer ? cacFounder / gpPerCustomer : null,
      ltv: ltv == null ? null : r2(ltv),
      ltvCac: ltv != null && cacFounder ? ltv / cacFounder : null,
      settings: { hours: settings.founderHoursPerWeek, rate: settings.founderHourlyRate },
    },
    margins: {
      ppl: tLast && cLast ? margin(tLast.ppl, cLast.ppl) : null,
      service: tLast ? margin(tLast.service, 0) : null,
      software: tLast && cLast ? margin(tLast.software, cLast.software) : null,
      total: gm(lastComplete),
    },
    costTable,
    costTotal: r2(costTable.reduce((s, c) => s + c.amount, 0)),
    impact: {
      window,
      qualifying: qualifying.length,
      totalCustomers: perCustomer.size,
      provision: r2(provision),
      revenue: r2(qRevenue),
      perEuro: qRevenue > 0 && provision > 0 ? provision / qRevenue : null,
      closes: qClosed.length,
      leadsOfQualifying: qualifying.reduce((s, id) => s + (perCustomer.get(id)?.total ?? 0), 0),
      funnel: [
        { name: "Leads", v: leadsTotal },
        { name: "Erreicht", v: funnelReached },
        { name: "Termin", v: funnelAppt.length },
        { name: "Abschluss", v: closedLeads.length },
      ],
      speedMedianSec: median(speedRows.map((r) => r.sec)),
      automatedShare: waLeads > 0 ? Math.min(1, (autoRows[0]?.n ?? 0) / waLeads) : null,
    },
    sales: {
      funnel: [
        { name: "Angeschrieben/angerufen", v: contacted[0]?.n ?? 0 },
        { name: "Geantwortet", v: replied.length },
        { name: "Termin", v: meetings.length },
        { name: "Angebot", v: offersSent.length },
        { name: "Gewonnen", v: offersAccepted },
      ],
      openOffers: openOffers.length,
      openMrr: r2(openMrr),
      winRate,
      weighted: winRate != null ? r2(openMrr * winRate) : null,
      cycleDays: median(cycleRows.filter((c) => c.acceptedAt && c.salesContact).map((c) => (c.acceptedAt!.getTime() - c.salesContact!.createdAt.getTime()) / DAY)),
      channels: channelRows
        .map((c) => ({ name: CHANNEL_LABEL[c.customerSource ?? ""] ?? "Ohne Angabe", v: channelTotal ? Math.round((c._count._all / channelTotal) * 100) : 0 }))
        .sort((a, b) => b.v - a.v),
    },
    ppl: {
      months: pplMonths,
      avgPrice: lastP && lastP.leads ? r2(lastP.revenue / lastP.leads) : null,
      costPerLead: lastP && lastP.leads && lastP.meta ? r2(lastP.meta / lastP.leads) : null,
      leadMargin: lastP && lastP.revenue > 0 && cLast ? (lastP.revenue - cLast.ppl) / lastP.revenue : null,
      stornoQuote: lastP && lastP.leads + cancelledLast > 0 ? cancelledLast / (lastP.leads + cancelledLast) : null,
      parked,
    },
    settings,
    drill: {
      current: drillMonth(drillMonths[0]),
      last: drillMonth(drillMonths[1]),
      retention: ret
        ? { base: addMonths(lastComplete, -lag), month: lastComplete, rows: retRows.map((x) => ({ ...x, name: nameOf(x.customerId), link: custById.has(x.customerId) })) }
        : null,
      directCosts: costTable.filter((c) => c.purpose === "ppl" || c.purpose === "software").map((c) => ({ name: c.name, amount: c.amount })),
    },
    missingRetainer,
    oneTime: {
      months: oneTimeMonths,
      currentMonth: oneTimeMonths.find((m) => m.month === current)?.total ?? 0,
      year: r2(yearSum),
      yearKey,
      entries: manualRows.map((m) => ({ id: m.id, month: m.month, customerId: m.customerId, customerName: m.customer?.name ?? null, amount: n(m.amount), kind: m.kind, note: m.note, createdBy: m.createdBy })),
    },
    customers: allCustomers.filter((c) => c.plan !== "internal").map((c) => ({ id: c.id, name: c.archived ? `${c.name} (archiviert)` : c.name })),
  };
}

export { monthLabel };
