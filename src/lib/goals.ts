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
  // Im Cockpit editierbar? Leads kommen aus Airtable (read-only); in der
  // Gesamt-Ansicht sind Leads/Abschlüsse/Umsatz Summen (read-only).
  editable: boolean;
};

export type MonthlyGoalProgress = {
  monthKey: string;
  monthLabel: string;
  // null = Gesamt, sonst der Produktname.
  product: string | null;
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

// "" = Gesamt; sonst der Produktname.
function productKeyOf(product: string | null): string {
  return product ?? "";
}

export async function getMonthlyGoal(monthKey: string, product: string | null) {
  return prisma.monthlyGoal.findUnique({
    where: { monthKey_product: { monthKey, product: productKeyOf(product) } },
  });
}

export async function upsertMonthlyGoal(
  monthKey: string,
  product: string | null,
  goals: {
    closedGoal: number | null;
    revenueGoal: number | null;
    marginGoal: number | null;
  },
) {
  const key = productKeyOf(product);
  return prisma.monthlyGoal.upsert({
    where: { monthKey_product: { monthKey, product: key } },
    create: {
      monthKey,
      product: key,
      closedGoal: goals.closedGoal,
      revenueGoal: goals.revenueGoal,
      marginGoal: goals.marginGoal,
    },
    update: {
      closedGoal: goals.closedGoal,
      revenueGoal: goals.revenueGoal,
      marginGoal: goals.marginGoal,
    },
  });
}

// Lead-Ziele je Produkt = Summe der Airtable-Werte über alle Kunden.
async function airtableLeadGoals(): Promise<{
  Wechsel: number;
  "Neugeschäft": number;
  Kinderwunsch: number;
  total: number;
}> {
  const customers = await prisma.customer.findMany({
    select: {
      leadGoalWechsel: true,
      leadGoalNeugeschaeft: true,
      leadGoalKinderwunsch: true,
    },
  });
  let w = 0;
  let n = 0;
  let k = 0;
  for (const c of customers) {
    w += c.leadGoalWechsel ?? 0;
    n += c.leadGoalNeugeschaeft ?? 0;
    k += c.leadGoalKinderwunsch ?? 0;
  }
  return { Wechsel: w, "Neugeschäft": n, Kinderwunsch: k, total: w + n + k };
}

export async function computeMonthlyGoalProgress(params: {
  now?: Date;
  // null = Gesamt, sonst Produktname (Wechsel/Neugeschäft/Kinderwunsch).
  product?: string | null;
} = {}): Promise<MonthlyGoalProgress> {
  const now = params.now ?? new Date();
  const product = params.product ?? null;
  const isTotal = product == null;
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const mtdEnd = endOfDay(now);

  const monthKey = monthKeyFor(monthStart);
  const monthLabel = monthLabelFmt.format(monthStart);

  const [allGoalRows, mtd, leadGoals] = await Promise.all([
    prisma.monthlyGoal.findMany({ where: { monthKey } }),
    computeKpis({
      range: { from: monthStart, to: mtdEnd },
      customerId: null,
      product,
    }) as Promise<Kpis>,
    airtableLeadGoals(),
  ]);

  // Ziele zusammensetzen. Lead-Ziele kommen immer aus Airtable. Abschlüsse/
  // Umsatz/Marge: pro Produkt aus der jeweiligen Zeile; gesamt sind Abschlüsse/
  // Umsatz die Summe der Produkte, die Gesamt-Marge wird eigenständig gesetzt.
  const byProduct = new Map(allGoalRows.map((r) => [r.product, r]));
  const productRows = allGoalRows.filter((r) => r.product !== "");

  const leadsGoal = isTotal
    ? leadGoals.total
    : leadGoals[product as keyof typeof leadGoals] ?? 0;

  let closedGoal: number | null;
  let revenueGoal: number | null;
  let marginGoal: number | null;
  if (isTotal) {
    const closedSum = productRows.reduce((s, r) => s + (r.closedGoal ?? 0), 0);
    const revenueSum = productRows.reduce(
      (s, r) => s + (decToNumber(r.revenueGoal) ?? 0),
      0,
    );
    closedGoal = closedSum > 0 ? closedSum : null;
    revenueGoal = revenueSum > 0 ? revenueSum : null;
    marginGoal = decToNumber(byProduct.get("")?.marginGoal);
  } else {
    const row = byProduct.get(product);
    closedGoal = row?.closedGoal ?? null;
    revenueGoal = decToNumber(row?.revenueGoal);
    marginGoal = decToNumber(row?.marginGoal);
  }

  const daysElapsed = Math.max(
    1,
    differenceInCalendarDays(now, monthStart) + 1,
  );
  const daysTotal = differenceInCalendarDays(monthEnd, monthStart) + 1;
  // Pace nicht über Kalender-Tage rechnen, sondern über exakt vergangene
  // Zeit: mitten am Tag X soll der Sollwert auch nur "halbtags-X" sein,
  // nicht "Ende-Tag-X". Sonst wirkt der Pace eine ganze Tagesportion zu hoch.
  const monthMs = Math.max(1, monthEnd.getTime() - monthStart.getTime());
  const elapsedMs = Math.max(0, now.getTime() - monthStart.getTime());
  const paceFraction = Math.min(1, elapsedMs / monthMs);

  function buildVolumeRow(
    key: GoalKey,
    label: string,
    format: GoalRow["format"],
    goalValue: number | null,
    current: number,
    editable: boolean,
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
        editable,
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
      editable,
    };
  }

  function buildQualityRow(
    key: GoalKey,
    label: string,
    format: GoalRow["format"],
    goalValue: number | null,
    current: number | null,
    editable: boolean,
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
        editable,
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
        editable,
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
      editable,
    };
  }

  const rows: GoalRow[] = [
    // Leads: immer aus Airtable → read-only.
    buildVolumeRow(
      "leads",
      "Leads",
      "number",
      leadsGoal > 0 ? leadsGoal : null,
      mtd.totalLeads,
      false,
    ),
    // Abschlüsse/Umsatz: pro Produkt editierbar, gesamt = Summe (read-only).
    buildVolumeRow(
      "closed",
      "Abschlüsse",
      "number",
      closedGoal,
      mtd.closedLeads,
      !isTotal,
    ),
    buildVolumeRow(
      "revenue",
      "Umsatz",
      "currency",
      revenueGoal,
      mtd.revenue,
      !isTotal,
    ),
    // Marge: pro Produkt und gesamt jeweils eigenständig setzbar.
    buildQualityRow(
      "margin",
      "Marge vor weiteren Kosten",
      "percent",
      marginGoal,
      mtd.marginBeforeOther,
      true,
    ),
  ];

  return {
    monthKey,
    monthLabel,
    product,
    daysElapsed,
    daysTotal,
    rows,
  };
}
