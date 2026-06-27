import {
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  startOfMonth,
} from "date-fns";
import { computeKpis, type Kpis } from "@/lib/kpis";
import { prisma } from "@/lib/prisma";
import { canonicalProductKey } from "@/lib/products";

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
    // Abschlussquote-Ziel (0..1) und Marge-Ziel (0..1).
    closedRateGoal: number | null;
    marginGoal: number | null;
  },
) {
  const key = productKeyOf(product);
  return prisma.monthlyGoal.upsert({
    where: { monthKey_product: { monthKey, product: key } },
    create: {
      monthKey,
      product: key,
      closedRateGoal: goals.closedRateGoal,
      marginGoal: goals.marginGoal,
    },
    update: {
      closedRateGoal: goals.closedRateGoal,
      marginGoal: goals.marginGoal,
    },
  });
}

type AirtableGoals = {
  // Lead- bzw. Umsatzziel je kanonischem Produkt-Key (Legacy oder neu).
  leads: Map<string, number>;
  revenue: Map<string, number>;
  leadsTotal: number;
  revenueTotal: number;
};

// Lead- und Umsatzziele je Produkt aus der CustomerProduct-Join-Tabelle.
//   Lead-Ziel   = Σ Lead-Ziel über alle Kunden-Produkt-Bezüge
//   Umsatzziel  = Σ (Lead-Ziel × Preis pro Lead) über alle Bezüge
// Pro Bezug gerechnet, damit unterschiedliche Kundenpreise korrekt einfließen.
// Aggregiert über den kanonischen Produkt-Key, sodass mehrere Airtable-
// Produkte mit gleichem Key (z. B. "PKV-Wechsel" + "PKV-Tarifoptimierung")
// in denselben Topf laufen — synchron zu Lead.source / den Pool-Keys.
async function airtableGoals(): Promise<AirtableGoals> {
  const rows = await prisma.customerProduct.findMany({
    select: {
      leadGoal: true,
      leadPrice: true,
      product: { select: { name: true } },
    },
  });
  const leads = new Map<string, number>();
  const revenue = new Map<string, number>();
  let leadsTotal = 0;
  let revenueTotal = 0;
  for (const r of rows) {
    const goal = r.leadGoal ?? 0;
    if (goal <= 0) continue;
    const key = canonicalProductKey(r.product.name);
    const rev = goal * (decToNumber(r.leadPrice) ?? 0);
    leads.set(key, (leads.get(key) ?? 0) + goal);
    revenue.set(key, (revenue.get(key) ?? 0) + rev);
    leadsTotal += goal;
    revenueTotal += rev;
  }
  return { leads, revenue, leadsTotal, revenueTotal };
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

  const [allGoalRows, mtd, atGoals] = await Promise.all([
    prisma.monthlyGoal.findMany({ where: { monthKey } }),
    computeKpis({
      range: { from: monthStart, to: mtdEnd },
      customerId: null,
      product,
    }) as Promise<Kpis>,
    airtableGoals(),
  ]);

  // Ziele zusammensetzen. Lead- UND Umsatzziele kommen aus Airtable
  // (Lead-Ziel bzw. Lead-Ziel × Preis). Abschlüsse/Marge werden manuell
  // gesetzt: pro Produkt aus der jeweiligen Zeile; gesamt sind Abschlüsse die
  // Summe der Produkte, die Gesamt-Marge wird eigenständig gesetzt.
  const byProduct = new Map(allGoalRows.map((r) => [r.product, r]));

  const leadsGoal = isTotal
    ? atGoals.leadsTotal
    : (atGoals.leads.get(product as string) ?? 0);
  const revenueRaw = isTotal
    ? atGoals.revenueTotal
    : (atGoals.revenue.get(product as string) ?? 0);
  const revenueGoal = revenueRaw > 0 ? revenueRaw : null;

  // Abschlussquote & Marge sind Qualitätskennzahlen — je Produkt bzw. gesamt
  // eigenständig gesetzt (nicht summiert).
  const settingsRow = byProduct.get(isTotal ? "" : (product as string));
  const closedRateGoal = decToNumber(settingsRow?.closedRateGoal);
  const marginGoal = decToNumber(settingsRow?.marginGoal);

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
    // Leads: immer aus Airtable → read-only. Ist-Wert = Netto-Leads (Stornos
    // raus), damit das Monatsziel nicht durch stornierte Leads erfüllt wird.
    buildVolumeRow(
      "leads",
      "Leads",
      "number",
      leadsGoal > 0 ? leadsGoal : null,
      mtd.nettoLeads,
      false,
    ),
    // Abschlussquote (Abschlüsse / Leads): Qualitätskennzahl in %, je Produkt
    // und gesamt eigenständig setzbar.
    buildQualityRow(
      "closed",
      "Abschlussquote",
      "percent",
      closedRateGoal,
      mtd.closingRate,
      true,
    ),
    // Umsatz: automatisch aus Lead-Ziel × Preis (Airtable) → read-only.
    buildVolumeRow(
      "revenue",
      "Umsatz",
      "currency",
      revenueGoal,
      mtd.revenue,
      false,
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
