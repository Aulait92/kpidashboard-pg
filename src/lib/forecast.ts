import {
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  startOfMonth,
  subMonths,
} from "date-fns";
import { computeKpis, type Kpis } from "@/lib/kpis";

export type ForecastRow = {
  label: string;
  mtd: number;
  projected: number;
  previousFull: number;
  format: "number" | "currency";
};

export type Forecast = {
  monthStart: Date;
  monthEnd: Date;
  daysElapsed: number;
  daysTotal: number;
  rows: ForecastRow[];
  previousMonthLabel: string;
};

const monthFmt = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
});

export async function computeMonthlyForecast(params: {
  customerId: string | null;
  product?: string | null;
  // Label für die Umsatz-Zeile — aus Admin-Sicht „Umsatz", aus
  // Kunden-Sicht „Lead-Kosten" (sie zahlen die Summe an uns).
  revenueLabel?: string;
  // Tageszahlung: optional injizierbar für Tests, default = jetzt.
  now?: Date;
}): Promise<Forecast> {
  const now = params.now ?? new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // MTD-Range geht bis Ende des aktuellen Tages, nicht bis zur exakten
  // Sekunde. Sonst werden Airtable-Leads, deren "Datum" als UTC-Mitternacht
  // geparst ist und die für später am heutigen Tag stehen, fälschlich nicht
  // mitgezählt.
  const mtdEnd = endOfDay(now);

  const prevDate = subMonths(now, 1);
  const prevStart = startOfMonth(prevDate);
  const prevEnd = endOfMonth(prevDate);

  // MTD und Vormonat parallel rechnen, beide via existierender computeKpis
  // (die respektiert customerId und liefert die uns interessierenden Zahlen).
  const [mtd, prevFull] = await Promise.all([
    computeKpis({
      range: { from: monthStart, to: mtdEnd },
      customerId: params.customerId,
      product: params.product ?? null,
    }) as Promise<Kpis>,
    computeKpis({
      range: { from: prevStart, to: prevEnd },
      customerId: params.customerId,
      product: params.product ?? null,
    }) as Promise<Kpis>,
  ]);

  // Kalendertage statt 24h-Intervallen: heute zählt als ein voller Tag,
  // die Gesamtmenge ist die Anzahl Tage des Monats (28-31).
  const daysElapsed = Math.max(
    1,
    differenceInCalendarDays(now, monthStart) + 1,
  );
  const daysTotal = differenceInCalendarDays(monthEnd, monthStart) + 1;

  function project(value: number): number {
    return Math.round((value / daysElapsed) * daysTotal);
  }

  const rows: ForecastRow[] = [
    {
      label: "Leads",
      mtd: mtd.totalLeads,
      projected: project(mtd.totalLeads),
      previousFull: prevFull.totalLeads,
      format: "number",
    },
    {
      label: "Termine",
      mtd: mtd.terminLeads,
      projected: project(mtd.terminLeads),
      previousFull: prevFull.terminLeads,
      format: "number",
    },
    {
      label: "Abschlüsse",
      mtd: mtd.closedLeads,
      projected: project(mtd.closedLeads),
      previousFull: prevFull.closedLeads,
      format: "number",
    },
    {
      label: params.revenueLabel ?? "Lead-Kosten",
      mtd: mtd.revenue,
      projected: (mtd.revenue / daysElapsed) * daysTotal,
      previousFull: prevFull.revenue,
      format: "currency",
    },
  ];

  return {
    monthStart,
    monthEnd,
    daysElapsed,
    daysTotal,
    rows,
    previousMonthLabel: monthFmt.format(prevDate),
  };
}
