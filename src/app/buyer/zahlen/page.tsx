import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { BuyerFilterBar } from "@/components/buyer-filter-bar";
import { PageHeader } from "@/components/buyer-shell";
import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import { FunnelHero } from "@/components/funnel-hero";
import { KpiCard, type Delta } from "@/components/kpi-card";
import { LiveUpdated } from "@/components/live-updated";
import { MonthlyForecast } from "@/components/monthly-forecast";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { getBuyerContext } from "@/lib/buyer-context";
import { parseRangeFromSearchParams, previousRange } from "@/lib/date-ranges";
import {
  computeCustomerSpend,
  customerSpendForBuckets,
  loadRetainerConfig,
} from "@/lib/customer-spend";
import { computeMonthlyForecast } from "@/lib/forecast";
import {
  computeKpis,
  computeTimeSeries,
  type Kpis,
  type TimeSeriesPoint,
} from "@/lib/kpis";
import {
  formatDate,
  formatEUR,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<{
  range?: string;
  from?: string;
  to?: string;
}>;

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mein Dashboard | performancegrowth",
};

export default async function BuyerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getBuyerContext();
  if (!session) {
    redirect("/login");
  }

  const sp = await searchParams;
  const { key: rangeKey, range } = parseRangeFromSearchParams(sp);
  const renderedAt = Date.now();

  const customer = await prisma.customer.findUnique({
    where: { id: session.customerId },
    select: { name: true },
  });

  return (
    <PullToRefresh>
      <AutoRefresh />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          title="Zahlen"
          subtitle={
            <>
              Guten Tag, {(customer?.name ?? "").replace(/^Allianz\s+/i, "").split(" ")[0] || "willkommen"} ·{" "}
              {formatDate(range.from)} – {formatDate(range.to)} · aktualisiert{" "}
              <LiveUpdated since={renderedAt} />
            </>
          }
          actions={
            <BuyerFilterBar
              currentRange={rangeKey}
              customFrom={sp.from}
              customTo={sp.to}
            />
          }
        />

        <Suspense
          fallback={
            <div className="text-sm text-[color:var(--muted)]">
              Lade Dashboard…
            </div>
          }
        >
          <BuyerDashboardBody
            customerId={session.customerId}
            range={range}
          />
        </Suspense>
      </main>
    </PullToRefresh>
  );
}

function delta(
  current: number | null,
  previous: number | null,
  lowerIsBetter = false,
): Delta {
  if (current == null || previous == null) return { pct: null, lowerIsBetter };
  if (previous === 0) {
    if (current === 0) return { pct: 0, lowerIsBetter };
    return { pct: null, lowerIsBetter };
  }
  return { pct: (current - previous) / Math.abs(previous), lowerIsBetter };
}

async function BuyerDashboardBody({
  customerId,
  range,
}: {
  customerId: string;
  range: { from: Date; to: Date };
}) {
  const prev = previousRange(range);
  // BuyerComparison/Leaderboard ist aktuell ausgeblendet — die Berechnung
  // (computeCustomerLeaderboard) sparen wir uns hier, bis der Vergleich
  // wieder eingeblendet wird.
  const retainerCfg = await loadRetainerConfig(customerId);
  const [
    k,
    p,
    ts,
    forecast,
    closeValueRows,
    closeValueRowsPrev,
    spend,
    spendPrev,
  ] = await Promise.all([
      computeKpis({ range, customerId, product: null }) as Promise<Kpis>,
      computeKpis({ range: prev, customerId, product: null }) as Promise<Kpis>,
      computeTimeSeries({ range, customerId, product: null }),
      computeMonthlyForecast({ customerId, includeCloseValue: true }),
      // Abschlusswerte aus dem Lead-Modell direkt aggregieren — eine eigene
      // Spalte am Lead, getrennt vom Lead-Einkaufspreis (Revenue.amount).
      // Stornierte Leads ausschließen, damit Umsatz konsistent zu nettoLeads
      // gerechnet wird.
      prisma.lead.findMany({
        where: {
          customerId,
          createdAt: { gte: range.from, lte: range.to },
        },
        select: { closeValue: true, status: true },
      }),
      prisma.lead.findMany({
        where: {
          customerId,
          createdAt: { gte: prev.from, lte: prev.to },
        },
        select: { closeValue: true, status: true },
      }),
      retainerCfg ? computeCustomerSpend(customerId, range, retainerCfg) : null,
      retainerCfg ? computeCustomerSpend(customerId, prev, retainerCfg) : null,
    ]);

  // Lead-Kosten aus Kundensicht: Pro-Lead-Kunden = Lead-Preis (Revenue),
  // Retainer-Kunden = eigenes Werbebudget + Retainer.
  const cost = spend ? spend.total : Number(k.revenue);
  const costPrev = spendPrev ? spendPrev.total : Number(p.revenue);
  if (retainerCfg) {
    const series = await customerSpendForBuckets(
      customerId,
      ts.points.map((pt) => pt.bucket),
      range.to,
      retainerCfg,
    );
    ts.points.forEach((pt, i) => {
      pt.revenue = series[i] ?? 0;
    });
  }
  const costHint = spend
    ? `Werbebudget ${formatEUR(spend.adSpend)} + Retainer ${formatEUR(spend.retainer)}`
    : "Brutto im Zeitraum";

  function sumCloseValue(
    rows: { closeValue: unknown; status: string | null }[],
  ): number {
    let sum = 0;
    for (const r of rows) {
      if (r.closeValue == null) continue;
      // Umsatz nur aus tatsächlich abgeschlossenen Leads — ein aus „Abschluss"
      // zurückgezogener Lead (z. B. wieder „Neuer Lead") darf keinen Umsatz
      // tragen, auch wenn der alte Abschlusswert noch am Datensatz hängt.
      if (!r.status || r.status.toLowerCase() !== "abschluss") continue;
      const n = Number(r.closeValue);
      if (Number.isFinite(n)) sum += n;
    }
    return sum;
  }
  const umsatz = sumCloseValue(closeValueRows);
  const umsatzPrev = sumCloseValue(closeValueRowsPrev);
  const gewinn = umsatz - cost;
  const gewinnPrev = umsatzPrev - costPrev;

  return (
    <div className="mt-6 space-y-6">
      <FunnelHero kpis={k} />

      <MonthlyForecast forecast={forecast} />

      <section>
        <div className="mb-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
            Lead-Performance
          </div>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            Deine Zahlen
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            label="Leads"
            value={formatNumber(k.nettoLeads)}
            hint={`${k.totalLeads} brutto${k.cancelledLeads > 0 ? ` (${k.cancelledLeads} Storno${k.cancelledLeads === 1 ? "" : "s"} exkl.)` : ""}`}
            delta={delta(k.nettoLeads, p.nettoLeads)}
            sparkline={{ points: ts.points as TimeSeriesPoint[], dataKey: "leads", tone: "neutral" }}
          />
          <KpiCard
            label="Erreichbarkeit"
            value={formatPercent(k.reachabilityRate)}
            hint={`${k.reachedLeads} von ${k.nettoLeads} erreicht${k.cancelledLeads > 0 ? ` (${k.cancelledLeads} Stornos exkl.)` : ""}`}
            delta={delta(k.reachabilityRate, p.reachabilityRate)}
            sparkline={{ points: ts.points, dataKey: "reachabilityRate" }}
          />
          <KpiCard
            label="Abschlussquote"
            value={formatPercent(k.closingRate)}
            hint={`${k.closedLeads} Abschlüsse`}
            delta={delta(k.closingRate, p.closingRate)}
            sparkline={{ points: ts.points, dataKey: "closingRate" }}
          />
        </div>
      </section>

      <section>
        <div className="mb-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
            Investment
          </div>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            Was du für Leads bezahlt hast
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Lead-Kosten"
            value={formatEUR(cost)}
            tone="neutral"
            hint={costHint}
            delta={delta(cost, costPrev, true)}
            sparkline={{ points: ts.points, dataKey: "revenue" }}
          />
          <KpiCard
            label="Ø Lead-Kosten / Lead"
            value={formatEUR(
              k.nettoLeads > 0 ? cost / k.nettoLeads : null,
            )}
            hint={`Pro Netto-Lead (${formatNumber(k.nettoLeads)})`}
            delta={delta(
              k.nettoLeads > 0 ? cost / k.nettoLeads : null,
              p.nettoLeads > 0 ? costPrev / p.nettoLeads : null,
              true,
            )}
          />
          <KpiCard
            label="Kosten / Termin"
            value={formatEUR(
              k.terminLeads > 0 ? cost / k.terminLeads : null,
            )}
            hint={`Aus ${formatNumber(k.terminLeads)} Terminen`}
            delta={delta(
              k.terminLeads > 0 ? cost / k.terminLeads : null,
              p.terminLeads > 0 ? costPrev / p.terminLeads : null,
              true,
            )}
          />
          <KpiCard
            label="Kosten / Abschluss"
            value={formatEUR(
              k.closedLeads > 0 ? cost / k.closedLeads : null,
            )}
            hint={`Aus ${formatNumber(k.closedLeads)} Abschlüssen`}
            delta={delta(
              k.closedLeads > 0 ? cost / k.closedLeads : null,
              p.closedLeads > 0 ? costPrev / p.closedLeads : null,
              true,
            )}
          />
        </div>
      </section>

      <section>
        <div className="mb-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
            Ertrag
          </div>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            Was du verdient hast
          </h2>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            Aus den Abschlusswerten, die du einträgst, wenn du einen Lead auf
            „Abschluss“ setzt.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Umsatz"
            value={formatEUR(umsatz)}
            tone="positive"
            hint={`Σ Abschlusswerte aus ${formatNumber(k.closedLeads)} Abschlüssen`}
            delta={delta(umsatz, umsatzPrev)}
          />
          <KpiCard
            label="Gewinn"
            value={formatEUR(gewinn)}
            tone={gewinn >= 0 ? "positive" : "negative"}
            hint="Umsatz minus Lead-Kosten"
            delta={delta(gewinn, gewinnPrev)}
          />
          <KpiCard
            label="Gewinn / Lead"
            value={formatEUR(
              k.totalLeads > 0 ? gewinn / k.totalLeads : null,
            )}
            hint="Pro eingehendem Lead"
            delta={delta(
              k.totalLeads > 0 ? gewinn / k.totalLeads : null,
              p.totalLeads > 0 ? gewinnPrev / p.totalLeads : null,
            )}
          />
          <KpiCard
            label="Gewinn / Abschluss"
            value={formatEUR(
              k.closedLeads > 0 ? gewinn / k.closedLeads : null,
            )}
            hint={`Aus ${formatNumber(k.closedLeads)} Abschlüssen`}
            delta={delta(
              k.closedLeads > 0 ? gewinn / k.closedLeads : null,
              p.closedLeads > 0 ? gewinnPrev / p.closedLeads : null,
            )}
          />
        </div>
      </section>

      {/* BuyerComparison/Leaderboard temporär ausgeblendet —
          wird wieder eingebaut, sobald der Vergleich freigegeben ist. */}
    </div>
  );
}
