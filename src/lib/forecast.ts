import {
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  startOfMonth,
  subMonths,
} from "date-fns";
import { computeKpis, type Kpis } from "@/lib/kpis";
import { prisma } from "@/lib/prisma";

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

function sumCloseValue(
  rows: { closeValue: unknown; status: string | null }[],
): number {
  let sum = 0;
  for (const r of rows) {
    if (r.closeValue == null) continue;
    // Nur tatsächlich abgeschlossene Leads — ein zurückgezogener Lead trägt
    // keinen Umsatz, auch wenn der alte Abschlusswert noch am Datensatz hängt.
    if (!r.status || r.status.toLowerCase() !== "abschluss") continue;
    const n = Number(r.closeValue);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

export async function computeMonthlyForecast(params: {
  customerId: string | null;
  product?: string | null;
  // Label für die Lead-Kosten-Zeile — aus Admin-Sicht „Umsatz" (unsere
  // Einnahmen aus Lead-Verkauf), aus Kunden-Sicht „Lead-Kosten" (was
  // der Kunde an uns zahlt).
  revenueLabel?: string;
  // Buyer-Modus: zusätzlich "Umsatz" (Σ Lead.closeValue im Zeitraum) +
  // "Gewinn" (Umsatz − Lead-Kosten) ausweisen. Dafür entfällt die
  // admin-zentrische "Bruttogewinn"-Zeile (= unsere Marge).
  includeCloseValue?: boolean;
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
  function projectCurrency(value: number): number {
    return (value / daysElapsed) * daysTotal;
  }

  // Im Buyer-Modus zusätzlich Σ Abschlusswerte für MTD + Vormonat ziehen.
  // Stornos rausfiltern, damit die Umsatzzeile konsistent zum nettoLeads-
  // Counter im Rest der Kachelreihe ist.
  let umsatzMtd = 0;
  let umsatzPrev = 0;
  if (params.includeCloseValue) {
    const where = {
      ...(params.customerId ? { customerId: params.customerId } : {}),
      ...(params.product ? { source: params.product } : {}),
    };
    const [mtdRows, prevRows] = await Promise.all([
      prisma.lead.findMany({
        where: { ...where, createdAt: { gte: monthStart, lte: mtdEnd } },
        select: { closeValue: true, status: true },
      }),
      prisma.lead.findMany({
        where: { ...where, createdAt: { gte: prevStart, lte: prevEnd } },
        select: { closeValue: true, status: true },
      }),
    ]);
    umsatzMtd = sumCloseValue(mtdRows);
    umsatzPrev = sumCloseValue(prevRows);
  }

  const rows: ForecastRow[] = [
    {
      label: "Leads",
      mtd: mtd.nettoLeads,
      projected: project(mtd.nettoLeads),
      previousFull: prevFull.nettoLeads,
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
  ];

  const leadKostenRow: ForecastRow = {
    label: params.revenueLabel ?? "Lead-Kosten",
    mtd: mtd.revenue,
    projected: projectCurrency(mtd.revenue),
    previousFull: prevFull.revenue,
    format: "currency",
  };

  if (params.includeCloseValue) {
    // Reihenfolge im Buyer-Block: Umsatz → Lead-Kosten → Gewinn, damit
    // sich der Gewinn visuell aus den beiden Zeilen darüber ergibt.
    const gewinnMtd = umsatzMtd - mtd.revenue;
    const gewinnPrev = umsatzPrev - prevFull.revenue;
    rows.push(
      {
        label: "Umsatz",
        mtd: umsatzMtd,
        projected: projectCurrency(umsatzMtd),
        previousFull: umsatzPrev,
        format: "currency",
      },
      leadKostenRow,
      {
        label: "Gewinn",
        mtd: gewinnMtd,
        projected: projectCurrency(gewinnMtd),
        previousFull: gewinnPrev,
        format: "currency",
      },
    );
  } else {
    rows.push(leadKostenRow, {
      label: "Bruttogewinn",
      mtd: mtd.profitBeforeOther,
      projected: projectCurrency(mtd.profitBeforeOther),
      previousFull: prevFull.profitBeforeOther,
      format: "currency",
    });
  }

  return {
    monthStart,
    monthEnd,
    daysElapsed,
    daysTotal,
    rows,
    previousMonthLabel: monthFmt.format(prevDate),
  };
}
