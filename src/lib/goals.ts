import {
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  startOfMonth,
} from "date-fns";
import { computeKpis, type Kpis } from "@/lib/kpis";
import { prisma } from "@/lib/prisma";

export type GoalKey = "leads" | "closed" | "revenue" | "margin";

export type GoalRow = {
  key: GoalKey;
  label: string;
  format: "number" | "currency" | "percent";
  // Quality-Metriken (Marge) haben kein Pacing — sind ein Niveau, kein
  // Volumen über die Zeit.
  isQualityMetric: boolean;
  // null = noch kein Ziel gesetzt.
  goal: number | null;
  current: number;
  // Linearer Soll-Stand zum heutigen Tag. null wenn kein Ziel oder
  // Quality-Metrik.
  pace: number | null;
  // 0..1 (Vergleich Current vs. Goal). Kann > 1 sein bei Übererfüllung.
  progress: number | null;
  status: "ahead" | "ontrack" | "behind" | "no-goal";
};

export type MonthlyGoalProgress = {
  monthKey: string;
  monthLabel: string;
  daysElapsed: number;
  daysTotal: number;
  rows: GoalRow[];
};

const monthLabelFmt = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
});

function monthKeyFor(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// Schwellen für die Volumen-Metriken:
// ≥ 100% des Pace = ahead, 85-100% = ontrack, < 85% = behind.
function statusFor(volumeRatio: number): "ahead" | "ontrack" | "behind" {
  if (volumeRatio >= 1) return "ahead";
  if (volumeRatio >= 0.85) return "ontrack";
  return "behind";
}

function decToNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  const obj = v as { toNumber?: () => number };
  if (typeof obj.toNumber === "function") return obj.toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getMonthlyGoal(monthKey: string) {
  return prisma.monthlyGoal.findUnique({ where: { monthKey } });
}

export async function upsertMonthlyGoal(
  monthKey: string,
  goals: {
    leadsGoal: number | null;
    closedGoal: number | null;
    revenueGoal: number | null;
    marginGoal: number | null;
  },
) {
  return prisma.monthlyGoal.upsert({
    where: { monthKey },
    create: {
      monthKey,
      leadsGoal: goals.leadsGoal,
      closedGoal: goals.closedGoal,
      revenueGoal: goals.revenueGoal,
      marginGoal: goals.marginGoal,
    },
    update: {
      leadsGoal: goals.leadsGoal,
      closedGoal: goals.closedGoal,
      revenueGoal: goals.revenueGoal,
      marginGoal: goals.marginGoal,
    },
  });
}

export async function computeMonthlyGoalProgress(params: {
  now?: Date;
} = {}): Promise<MonthlyGoalProgress> {
  const now = params.now ?? new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const mtdEnd = endOfDay(now);

  const monthKey = monthKeyFor(monthStart);
  const monthLabel = monthLabelFmt.format(monthStart);

  const [goal, mtd] = await Promise.all([
    getMonthlyGoal(monthKey),
    computeKpis({
      range: { from: monthStart, to: mtdEnd },
      customerId: null,
      product: null,
    }) as Promise<Kpis>,
  ]);

  const daysElapsed = Math.max(
    1,
    differenceInCalendarDays(now, monthStart) + 1,
  );
  const daysTotal = differenceInCalendarDays(monthEnd, monthStart) + 1;
  const paceFraction = daysElapsed / daysTotal;

  function buildVolumeRow(
    key: GoalKey,
    label: string,
    format: GoalRow["format"],
    goalValue: number | null,
    current: number,
  ): GoalRow {
    if (goalValue == null || goalValue <= 0) {
      return {
        key,
        label,
        format,
        isQualityMetric: false,
        goal: goalValue,
        current,
        pace: null,
        progress: null,
        status: "no-goal",
      };
    }
    const pace = goalValue * paceFraction;
    const progress = current / goalValue;
    const status = statusFor(pace > 0 ? current / pace : 0);
    return {
      key,
      label,
      format,
      isQualityMetric: false,
      goal: goalValue,
      current,
      pace,
      progress,
      status,
    };
  }

  function buildQualityRow(
    key: GoalKey,
    label: string,
    format: GoalRow["format"],
    goalValue: number | null,
    current: number | null,
  ): GoalRow {
    if (goalValue == null) {
      return {
        key,
        label,
        format,
        isQualityMetric: true,
        goal: null,
        current: current ?? 0,
        pace: null,
        progress: null,
        status: "no-goal",
      };
    }
    if (current == null) {
      return {
        key,
        label,
        format,
        isQualityMetric: true,
        goal: goalValue,
        current: 0,
        pace: null,
        progress: 0,
        status: "behind",
      };
    }
    return {
      key,
      label,
      format,
      isQualityMetric: true,
      goal: goalValue,
      current,
      pace: null,
      progress: goalValue > 0 ? current / goalValue : null,
      status: current >= goalValue ? "ahead" : "behind",
    };
  }

  const rows: GoalRow[] = [
    buildVolumeRow(
      "leads",
      "Leads",
      "number",
      goal?.leadsGoal ?? null,
      mtd.totalLeads,
    ),
    buildVolumeRow(
      "closed",
      "Abschlüsse",
      "number",
      goal?.closedGoal ?? null,
      mtd.closedLeads,
    ),
    buildVolumeRow(
      "revenue",
      "Umsatz",
      "currency",
      decToNumber(goal?.revenueGoal),
      mtd.revenue,
    ),
    buildQualityRow(
      "margin",
      "Marge vor weiteren Kosten",
      "percent",
      decToNumber(goal?.marginGoal),
      mtd.marginBeforeOther,
    ),
  ];

  return {
    monthKey,
    monthLabel,
    daysElapsed,
    daysTotal,
    rows,
  };
}
