import {
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  startOfMonth,
  subMonths,
} from "date-fns";
import { computeCustomerSpend, loadRetainerConfig } from "@/lib/customer-spend";
import { computeKpis, type Kpis } from "@/lib/kpis";
import { ertragForRange, loadErtragData } from "@/lib/ertrag";

export type ForecastRow = {
  label: string;
  mtd: number;
  projected: number;
  previousFull: number;
  format: "number" | "currency";
  /** Kosten: Anstieg ist schlecht (Pfeil rot). */
  lowerIsBetter?: boolean;
};

export type Forecast = {
  monthStart: Date;
  monthEnd: Date;
  daysElapsed: number;
  daysTotal: number;
  rows: ForecastRow[];
  previousMonthLabel: string;
  /** Kundensicht: hochgerechneter Gewinn (für die Tipps-Karte) und Zusatzzeile Bestand. */
  buyer?: { gewinnProjected: number; bestandPerYearMtd: number };
};

const monthFmt = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
});

export async function computeMonthlyForecast(params: {
  customerId: string | null;
  product?: string | null;
  // Label für die Lead-Kosten-Zeile — aus Admin-Sicht „Umsatz" (unsere
  // Einnahmen aus Lead-Verkauf), aus Kunden-Sicht „Lead-Kosten" (was
  // der Kunde an uns zahlt).
  revenueLabel?: string;
  // Buyer-Modus (Kundensicht, lib/ertrag): Abschlussprovision bzw. Courtage 1. Jahr, Lead-Kosten,
  // Agenturkosten und Gewinn wie auf /buyer/zahlen; Leads/Termine/Abschlüsse nur bezahlte Leads.
  // Dafür entfällt die admin-zentrische "Bruttogewinn"-Zeile (= unsere Marge).
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
  const origin = params.includeCloseValue ? ("paid" as const) : null;
  const [mtd, prevFull] = await Promise.all([
    computeKpis({
      range: { from: monthStart, to: mtdEnd },
      customerId: params.customerId,
      product: params.product ?? null,
      origin,
    }) as Promise<Kpis>,
    computeKpis({
      range: { from: prevStart, to: prevEnd },
      customerId: params.customerId,
      product: params.product ?? null,
      origin,
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

  // Kunden-Sicht bei Retainer-Kunden: Lead-Kosten = Werbebudget + Retainer
  // statt Lead-Preis (der ist bei Retainer 0).
  let costMtd = mtd.revenue;
  let costPrev = prevFull.revenue;
  if (params.includeCloseValue && params.customerId) {
    const cfg = await loadRetainerConfig(params.customerId);
    if (cfg) {
      const [a, b] = await Promise.all([
        computeCustomerSpend(params.customerId, { from: monthStart, to: mtdEnd }, cfg),
        computeCustomerSpend(params.customerId, { from: prevStart, to: prevEnd }, cfg),
      ]);
      costMtd = a?.total ?? 0;
      costPrev = b?.total ?? 0;
    }
  }

  const leadKostenRow: ForecastRow = {
    label: params.revenueLabel ?? "Lead-Kosten",
    mtd: costMtd,
    projected: projectCurrency(costMtd),
    previousFull: costPrev,
    format: "currency",
  };

  let buyer: Forecast["buyer"];
  if (params.includeCloseValue && params.customerId) {
    // Reihenfolge im Buyer-Block: Provision → Lead-Kosten → Agenturkosten → Gewinn, damit sich
    // der Gewinn aus den Zeilen darüber ergibt (gleiche Rechnung wie die Karten, lib/ertrag).
    const data = await loadErtragData(params.customerId);
    const [a, b] = await Promise.all([
      ertragForRange(params.customerId, data, { from: monthStart, to: mtdEnd }, now, costMtd),
      ertragForRange(params.customerId, data, { from: prevStart, to: prevEnd }, now, costPrev),
    ]);
    const gewinnProjected = projectCurrency(a.provision.firstYear) - projectCurrency(costMtd) - projectCurrency(a.agency.total);
    rows.push(
      {
        label: data.typ === "makler" ? "Courtage 1. Jahr (geschätzt)" : "Abschlussprovision (geschätzt)",
        mtd: a.provision.firstYear,
        projected: projectCurrency(a.provision.firstYear),
        previousFull: b.provision.firstYear,
        format: "currency",
      },
      { ...leadKostenRow, lowerIsBetter: true },
      {
        label: "Betreuung & Software (inkl. USt.)",
        lowerIsBetter: true,
        mtd: a.agency.total,
        projected: projectCurrency(a.agency.total),
        previousFull: b.agency.total,
        format: "currency",
      },
      {
        label: "Gewinn",
        mtd: a.gewinn,
        projected: gewinnProjected,
        previousFull: b.gewinn,
        format: "currency",
      },
    );
    buyer = { gewinnProjected, bestandPerYearMtd: a.provision.trailPerYear };
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
    ...(buyer ? { buyer } : {}),
  };
}
