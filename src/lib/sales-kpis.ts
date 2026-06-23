import {
  endOfDay,
  endOfMonth,
  startOfMonth,
  differenceInCalendarDays,
  subMonths,
} from "date-fns";
import { prisma } from "@/lib/prisma";
import {
  SALES_PIPELINE_PHASES,
  findSalesPhaseForStatus,
  winProbabilityFor,
} from "@/lib/sales-phases";

// Aggregierte Sales-KPIs für /admin/kpis. Liest komplett aus der DB
// (Sync füllt sie), keine Airtable-Round-Trips.
//
// Begriffe:
//   pipeline-deals  = aktive Deals, weder gewonnen noch verloren
//   decided-deals   = wonAt != null OR lostAt != null
//   pipeline-value  = Σ value(pipeline-deals)
//   weighted-value  = Σ value × winProbability je Phase
//   win-rate        = wonCount / (wonCount + lostCount)
//   sales-velocity  = (qualified × ø-deal-value × win-rate) / ø-cycle-time-tage
//   cycle-time      = Tage von createdAt bis wonAt (nur Wins berücksichtigt)
//
// Optional Range-Filter für „neu im Zeitraum" und „abgeschlossen im
// Zeitraum"-Sub-Kacheln.

export type SalesPhaseStats = {
  key: string;
  label: string;
  count: number;
  value: number;
  weightedValue: number;
  avgDaysInPhase: number | null;
};

export type LostReasonStat = {
  reason: string;
  count: number;
};

export type SalesForecastRow = {
  label: string;
  mtd: number;
  projected: number;
  previousFull: number;
  format: "number" | "currency";
};

export type SalesKpis = {
  totalDeals: number;
  pipelineDeals: number;
  pipelineValue: number;
  weightedValue: number;
  wonCount: number;
  lostCount: number;
  wonValue: number;
  avgDealValue: number | null;
  winRate: number | null;
  avgCycleTimeDays: number | null;
  salesVelocityPerDay: number | null;
  phaseStats: SalesPhaseStats[];
  lostReasons: LostReasonStat[];
  forecast: {
    monthLabel: string;
    daysElapsed: number;
    daysTotal: number;
    rows: SalesForecastRow[];
  };
};

export async function computeSalesKpis(now: Date = new Date()): Promise<SalesKpis> {
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const mtdEnd = endOfDay(now);
  const prevDate = subMonths(now, 1);
  const prevStart = startOfMonth(prevDate);
  const prevEnd = endOfMonth(prevDate);

  const deals = await prisma.deal.findMany({
    select: {
      id: true,
      value: true,
      status: true,
      wonAt: true,
      lostAt: true,
      lostReason: true,
      createdAt: true,
    },
  });

  let pipelineValue = 0;
  let weightedValue = 0;
  let wonCount = 0;
  let lostCount = 0;
  let wonValue = 0;
  let pipelineDeals = 0;
  let totalDealValue = 0;
  let totalDealValueCount = 0;
  const cycleTimes: number[] = [];

  // Phase aggregieren.
  const phaseAgg = new Map<
    string,
    { count: number; value: number; weighted: number; ages: number[] }
  >();
  for (const p of SALES_PIPELINE_PHASES) {
    phaseAgg.set(p.key, { count: 0, value: 0, weighted: 0, ages: [] });
  }
  const lostReasonMap = new Map<string, number>();

  for (const d of deals) {
    const value = d.value != null ? Number(d.value) : 0;
    if (value > 0) {
      totalDealValue += value;
      totalDealValueCount += 1;
    }
    const phase = findSalesPhaseForStatus(d.status);
    const isWon = phase?.terminal === "won" || d.wonAt != null;
    const isLost = phase?.terminal === "lost" || d.lostAt != null;

    if (isWon) {
      wonCount += 1;
      wonValue += value;
      if (d.wonAt) {
        const days = differenceInCalendarDays(d.wonAt, d.createdAt);
        if (days >= 0) cycleTimes.push(days);
      }
    } else if (isLost) {
      lostCount += 1;
      const r = d.lostReason?.trim();
      if (r) lostReasonMap.set(r, (lostReasonMap.get(r) ?? 0) + 1);
    } else {
      pipelineDeals += 1;
      pipelineValue += value;
      const w = winProbabilityFor(d.status);
      weightedValue += value * w;
    }

    if (phase) {
      const bucket = phaseAgg.get(phase.key)!;
      bucket.count += 1;
      bucket.value += value;
      bucket.weighted += value * phase.winProbability;
      const days = differenceInCalendarDays(now, d.createdAt);
      if (days >= 0) bucket.ages.push(days);
    }
  }

  const decided = wonCount + lostCount;
  const winRate = decided > 0 ? wonCount / decided : null;
  const avgDealValue =
    totalDealValueCount > 0 ? totalDealValue / totalDealValueCount : null;
  const avgCycleTime =
    cycleTimes.length > 0
      ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
      : null;
  // Sales-Velocity = (#Qualified-and-up × ø-Deal-Wert × Win-Rate) / Cycle-Time
  // Wenn ein Faktor null/0 ist → null (nicht aussagekräftig).
  const qualifiedCount = SALES_PIPELINE_PHASES.filter(
    (p) => !p.terminal && p.winProbability >= 0.25,
  ).reduce((sum, p) => sum + (phaseAgg.get(p.key)?.count ?? 0), 0);
  const salesVelocity =
    avgDealValue != null && winRate != null && avgCycleTime && avgCycleTime > 0
      ? (qualifiedCount * avgDealValue * winRate) / avgCycleTime
      : null;

  // Phase-Stats für Anzeige.
  const phaseStats: SalesPhaseStats[] = SALES_PIPELINE_PHASES.map((p) => {
    const b = phaseAgg.get(p.key)!;
    return {
      key: p.key,
      label: p.label,
      count: b.count,
      value: b.value,
      weightedValue: b.weighted,
      avgDaysInPhase:
        b.ages.length > 0
          ? b.ages.reduce((a, c) => a + c, 0) / b.ages.length
          : null,
    };
  });

  const lostReasons: LostReasonStat[] = Array.from(lostReasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // ─── Forecast (monatlich) ──────────────────────────────────────────
  const newMtd = deals.filter(
    (d) => d.createdAt >= monthStart && d.createdAt <= mtdEnd,
  ).length;
  const newPrev = deals.filter(
    (d) => d.createdAt >= prevStart && d.createdAt <= prevEnd,
  ).length;
  const wonMtd = deals.filter(
    (d) => d.wonAt != null && d.wonAt >= monthStart && d.wonAt <= mtdEnd,
  );
  const wonMtdCount = wonMtd.length;
  const wonMtdValue = wonMtd.reduce(
    (s, d) => s + (d.value != null ? Number(d.value) : 0),
    0,
  );
  const wonPrev = deals.filter(
    (d) => d.wonAt != null && d.wonAt >= prevStart && d.wonAt <= prevEnd,
  );
  const wonPrevCount = wonPrev.length;
  const wonPrevValue = wonPrev.reduce(
    (s, d) => s + (d.value != null ? Number(d.value) : 0),
    0,
  );
  const daysElapsed = Math.max(
    1,
    differenceInCalendarDays(now, monthStart) + 1,
  );
  const daysTotal = differenceInCalendarDays(monthEnd, monthStart) + 1;
  function project(value: number, round = true): number {
    const v = (value / daysElapsed) * daysTotal;
    return round ? Math.round(v) : v;
  }

  const monthFmt = new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
  });

  return {
    totalDeals: deals.length,
    pipelineDeals,
    pipelineValue,
    weightedValue,
    wonCount,
    lostCount,
    wonValue,
    avgDealValue,
    winRate,
    avgCycleTimeDays: avgCycleTime,
    salesVelocityPerDay: salesVelocity,
    phaseStats,
    lostReasons,
    forecast: {
      monthLabel: monthFmt.format(now),
      daysElapsed,
      daysTotal,
      rows: [
        {
          label: "Neue Deals",
          mtd: newMtd,
          projected: project(newMtd),
          previousFull: newPrev,
          format: "number",
        },
        {
          label: "Abschlüsse",
          mtd: wonMtdCount,
          projected: project(wonMtdCount),
          previousFull: wonPrevCount,
          format: "number",
        },
        {
          label: "Umsatz (Won)",
          mtd: wonMtdValue,
          projected: project(wonMtdValue, false),
          previousFull: wonPrevValue,
          format: "currency",
        },
      ],
    },
  };
}
