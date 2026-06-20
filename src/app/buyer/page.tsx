import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { BuyerFilterBar } from "@/components/buyer-filter-bar";
import { BuyerTabs } from "@/components/buyer-tabs";
import { FunnelHero } from "@/components/funnel-hero";
import { KpiCard, type Delta } from "@/components/kpi-card";
import { LiveUpdated } from "@/components/live-updated";
import { MonthlyForecast } from "@/components/monthly-forecast";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { SpeedToLeadCard } from "@/components/speed-to-lead-card";
import { logoutAction } from "@/app/login/actions";
import { getCurrentSession } from "@/lib/auth";
import { parseRangeFromSearchParams, previousRange } from "@/lib/date-ranges";
import { computeMonthlyForecast } from "@/lib/forecast";
import {
  computeKpis,
  computeTimeSeries,
  type Kpis,
  type TimeSeriesPoint,
} from "@/lib/kpis";
import { computeSpeedToLeadAnalysis } from "@/lib/speed-to-lead";
import {
  formatDate,
  formatDuration,
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
  const session = await getCurrentSession();
  if (!session || session.role !== "BUYER" || !session.customerId) {
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--brand-soft)] px-3 py-1 text-xs font-medium text-[color:var(--brand-dark)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--brand)]" />
              Live · aktualisiert <LiveUpdated since={renderedAt} />
            </span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Hallo,{" "}
              <span className="text-[color:var(--brand)]">
                {customer?.name ?? session.email}
              </span>
              .
            </h1>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              Zeitraum: {formatDate(range.from)} – {formatDate(range.to)}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-2">
            <BuyerFilterBar
              currentRange={rangeKey}
              customFrom={sp.from}
              customTo={sp.to}
            />
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label="Abmelden"
                title="Abmelden"
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm transition hover:border-[color:var(--brand)] sm:min-h-0 sm:py-1.5"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Abmelden</span>
              </button>
            </form>
          </div>
        </header>

        <BuyerTabs />

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
  const [k, p, ts, speedAnalysis, forecast, closeValueRows, closeValueRowsPrev] =
    await Promise.all([
      computeKpis({ range, customerId, product: null }) as Promise<Kpis>,
      computeKpis({ range: prev, customerId, product: null }) as Promise<Kpis>,
      computeTimeSeries({ range, customerId, product: null }),
      computeSpeedToLeadAnalysis({ range, customerId }),
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
    ]);

  function sumCloseValue(
    rows: { closeValue: unknown; status: string | null }[],
  ): number {
    let sum = 0;
    for (const r of rows) {
      if (r.closeValue == null) continue;
      if (r.status && r.status.toLowerCase().startsWith("storno")) continue;
      const n = Number(r.closeValue);
      if (Number.isFinite(n)) sum += n;
    }
    return sum;
  }
  const umsatz = sumCloseValue(closeValueRows);
  const umsatzPrev = sumCloseValue(closeValueRowsPrev);
  const gewinn = umsatz - Number(k.revenue);
  const gewinnPrev = umsatzPrev - Number(p.revenue);

  return (
    <div className="mt-6 space-y-6">
      <FunnelHero kpis={k} />

      <MonthlyForecast forecast={forecast} />

      <SpeedToLeadCard data={speedAnalysis} />

      <section>
        <div className="mb-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
            Lead-Performance
          </div>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            Deine Zahlen
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
            label="Closing Rate"
            value={formatPercent(k.closingRate)}
            hint={`${k.closedLeads} Abschlüsse`}
            delta={delta(k.closingRate, p.closingRate)}
            sparkline={{ points: ts.points, dataKey: "closingRate" }}
          />
          <KpiCard
            label="Zeit bis Erstkontakt"
            value={formatDuration(k.avgHoursToFirstContact)}
            hint="Durchschnitt"
            delta={delta(
              k.avgHoursToFirstContact,
              p.avgHoursToFirstContact,
              true,
            )}
            sparkline={{
              points: ts.points,
              dataKey: "avgHoursToFirstContact",
            }}
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
            value={formatEUR(k.revenue)}
            tone="neutral"
            hint="Brutto im Zeitraum"
            delta={delta(k.revenue, p.revenue, true)}
            sparkline={{ points: ts.points, dataKey: "revenue" }}
          />
          <KpiCard
            label="Ø Lead-Kosten / Lead"
            value={formatEUR(
              k.nettoLeads > 0 ? k.revenue / k.nettoLeads : null,
            )}
            hint={`Pro Netto-Lead (${formatNumber(k.nettoLeads)})`}
            delta={delta(
              k.nettoLeads > 0 ? k.revenue / k.nettoLeads : null,
              p.nettoLeads > 0 ? p.revenue / p.nettoLeads : null,
              true,
            )}
          />
          <KpiCard
            label="Kosten / Termin"
            value={formatEUR(
              k.terminLeads > 0 ? k.revenue / k.terminLeads : null,
            )}
            hint={`Aus ${formatNumber(k.terminLeads)} Terminen`}
            delta={delta(
              k.terminLeads > 0 ? k.revenue / k.terminLeads : null,
              p.terminLeads > 0 ? p.revenue / p.terminLeads : null,
              true,
            )}
          />
          <KpiCard
            label="Kosten / Abschluss"
            value={formatEUR(
              k.closedLeads > 0 ? k.revenue / k.closedLeads : null,
            )}
            hint={`Aus ${formatNumber(k.closedLeads)} Abschlüssen`}
            delta={delta(
              k.closedLeads > 0 ? k.revenue / k.closedLeads : null,
              p.closedLeads > 0 ? p.revenue / p.closedLeads : null,
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
            Aus den Abschlusswerten, die du in der Pipeline-Ansicht beim
            Drop auf „Abschluss" eingibst.
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
            label="Umsatz / Lead"
            value={formatEUR(
              k.totalLeads > 0 ? umsatz / k.totalLeads : null,
            )}
            hint="Pro eingehendem Lead"
            delta={delta(
              k.totalLeads > 0 ? umsatz / k.totalLeads : null,
              p.totalLeads > 0 ? umsatzPrev / p.totalLeads : null,
            )}
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
        </div>
      </section>

      {/* BuyerComparison/Leaderboard temporär ausgeblendet —
          wird wieder eingebaut, sobald der Vergleich freigegeben ist. */}
    </div>
  );
}
