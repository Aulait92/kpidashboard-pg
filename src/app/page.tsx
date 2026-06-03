import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { FilterBar } from "@/components/filter-bar";
import { FunnelHero } from "@/components/funnel-hero";
import { KpiCard, type Delta } from "@/components/kpi-card";
import { LiveUpdated } from "@/components/live-updated";
import { MonthlyForecast } from "@/components/monthly-forecast";
import { MonthlyGoalsCard } from "@/components/monthly-goals";
import { NotificationsButton } from "@/components/notifications-button";
import { PerformanceTable } from "@/components/performance-table";
import { PnLStatement } from "@/components/pnl-statement";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { SpeedToLeadCard } from "@/components/speed-to-lead-card";
import { TrendCharts } from "@/components/trend-charts";
import { UserMenu } from "@/components/user-menu";
import { getCurrentSession } from "@/lib/auth";
import { computeMonthlyForecast } from "@/lib/forecast";
import { computeMonthlyGoalProgress } from "@/lib/goals";
import { computeSpeedToLeadAnalysis } from "@/lib/speed-to-lead";
import { parseRangeFromSearchParams, previousRange } from "@/lib/date-ranges";
import {
  computeCustomerLeaderboard,
  computeKpis,
  computeLeadSpendByChannel,
  computePnL,
  computeProductBreakdown,
  computeTimeSeries,
  listCustomers,
  PRODUCTS,
  type ChannelSpend,
  type Kpis,
  type TimeSeriesPoint,
} from "@/lib/kpis";
import {
  formatDate,
  formatDuration,
  formatEUR,
  formatNumber,
  formatPercent,
} from "@/lib/format";

type SearchParams = Promise<{
  range?: string;
  from?: string;
  to?: string;
  customerId?: string;
  product?: string;
}>;

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!process.env.DATABASE_URL) {
    return <SetupNotice />;
  }

  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role === "BUYER") {
    redirect("/buyer");
  }

  const sp = await searchParams;
  const { key: rangeKey, range } = parseRangeFromSearchParams(sp);
  const customerId =
    sp.customerId && sp.customerId.length > 0 ? sp.customerId : null;
  const product =
    sp.product && (PRODUCTS as readonly string[]).includes(sp.product)
      ? sp.product
      : null;
  const renderedAt = Date.now();

  return (
    <PullToRefresh>
      <AutoRefresh />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--brand-soft)] px-3 py-1 text-xs font-medium text-[color:var(--brand-dark)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--brand)]" />
              Live · aktualisiert <LiveUpdated since={renderedAt} />
            </span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              KPI-<span className="text-[color:var(--brand)]">Dashboard</span>.
            </h1>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              Zeitraum: {formatDate(range.from)} – {formatDate(range.to)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Suspense
              fallback={
                <div className="text-xs text-[color:var(--muted)]">Lade Filter…</div>
              }
            >
              <FiltersSection
                currentRange={rangeKey}
                currentCustomerId={customerId}
                currentProduct={product}
                customFrom={sp.from}
                customTo={sp.to}
              />
            </Suspense>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <NotificationsButton />
              <UserMenu />
            </div>
          </div>
        </header>

        <Suspense
          fallback={
            <div className="mt-6 text-sm text-[color:var(--muted)]">Lade Dashboard…</div>
          }
        >
          <DashboardBody
            range={range}
            customerId={customerId}
            product={product}
          />
        </Suspense>
      </main>
    </PullToRefresh>
  );
}

async function DashboardBody({
  range,
  customerId,
  product,
}: {
  range: { from: Date; to: Date };
  customerId: string | null;
  product: string | null;
}) {
  const prev = previousRange(range);
  const [
    k,
    p,
    ts,
    customerRows,
    productRows,
    pnl,
    forecast,
    speed,
    goals,
    channelSpend,
    channelSpendPrev,
  ] = await Promise.all([
    computeKpis({ range, customerId, product }),
    computeKpis({ range: prev, customerId, product }) as Promise<Kpis>,
    computeTimeSeries({ range, customerId, product }),
    computeCustomerLeaderboard({ range, product }),
    computeProductBreakdown({ range, customerId }),
    computePnL({ range, customerId, product }),
    computeMonthlyForecast({
      customerId,
      product,
      revenueLabel: "Umsatz",
    }),
    computeSpeedToLeadAnalysis({ range, customerId, product }),
    computeMonthlyGoalProgress({ product }),
    computeLeadSpendByChannel({ range, product }),
    computeLeadSpendByChannel({ range: prev, product }),
  ]);

  return (
    <div className="mt-6 space-y-8">
      <FunnelHero kpis={k} />
      <MonthlyGoalsCard progress={goals} />
      <KpiGrid kpis={k} prev={p} points={ts.points} customerId={customerId} />
      <ChannelSpendGrid current={channelSpend} previous={channelSpendPrev} />
      <PnLStatement pnl={pnl} />
      <MonthlyForecast forecast={forecast} />
      <SpeedToLeadCard data={speed} />
      <PerformanceTable customerRows={customerRows} productRows={productRows} />
      <TrendCharts points={ts.points} granularity={ts.granularity} />
    </div>
  );
}

function SetupNotice() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16 sm:px-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900 shadow-sm">
        <h1 className="text-xl font-semibold">Setup erforderlich</h1>
        <p className="mt-2 text-sm">
          Die Umgebungsvariable <code className="rounded bg-amber-100 px-1 py-0.5">DATABASE_URL</code> ist nicht gesetzt.
          Bitte verbinde den App-Service mit deiner PostgreSQL-Datenbank
          (z.&nbsp;B. via Variable Reference auf den Postgres-Service in Railway)
          und starte den Service neu.
        </p>
      </div>
    </main>
  );
}

async function FiltersSection({
  currentRange,
  currentCustomerId,
  currentProduct,
  customFrom,
  customTo,
}: {
  currentRange: ReturnType<typeof parseRangeFromSearchParams>["key"];
  currentCustomerId: string | null;
  currentProduct: string | null;
  customFrom?: string;
  customTo?: string;
}) {
  const customers = await listCustomers();
  return (
    <FilterBar
      customers={customers}
      currentRange={currentRange}
      currentCustomerId={currentCustomerId}
      currentProduct={currentProduct}
      customFrom={customFrom}
      customTo={customTo}
    />
  );
}

// Δ-Berechnung: relative Veränderung gegenüber Vorperiode. Bei Raten
// (closingRate etc.) ist es ebenfalls relative Änderung — Prozentpunkte
// wären präziser, aber für Sparkline-Cards genügt eine Richtungsanzeige.
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

function KpiGrid({
  kpis: k,
  prev: p,
  points,
  customerId,
}: {
  kpis: Kpis;
  prev: Kpis;
  points: TimeSeriesPoint[];
  customerId: string | null;
}) {
  return (
    <div className="space-y-6">
      <KpiSection eyebrow="Sektion · Funnel" title="Wie performt dein Funnel">
        <KpiCard
          label="Erreichbarkeitsquote"
          value={formatPercent(k.reachabilityRate)}
          hint={`${k.reachedLeads} von ${k.nettoLeads} Leads erreicht${k.cancelledLeads > 0 ? ` (${k.cancelledLeads} Stornos exkl.)` : ""}`}
          delta={delta(k.reachabilityRate, p.reachabilityRate)}
          sparkline={{ points, dataKey: "reachabilityRate" }}
        />
        <KpiCard
          label="Kontaktversuche / Lead"
          value={formatNumber(k.avgContactAttempts)}
          hint="Durchschnitt im Zeitraum"
          delta={delta(k.avgContactAttempts, p.avgContactAttempts, true)}
          sparkline={{ points, dataKey: "avgContactAttempts" }}
        />
        <KpiCard
          label="Zeit bis Erstkontakt"
          value={formatDuration(k.avgHoursToFirstContact)}
          hint="Median über Zeitraum"
          delta={delta(k.avgHoursToFirstContact, p.avgHoursToFirstContact, true)}
          sparkline={{ points, dataKey: "avgHoursToFirstContact" }}
        />
        <KpiCard
          label="Closing Rate"
          value={formatPercent(k.closingRate)}
          hint={`${k.closedLeads} von ${k.nettoLeads} abgeschlossen${k.cancelledLeads > 0 ? ` (${k.cancelledLeads} Stornos exkl.)` : ""}`}
          delta={delta(k.closingRate, p.closingRate)}
          sparkline={{ points, dataKey: "closingRate" }}
        />
      </KpiSection>

      <KpiSection
        eyebrow="Sektion · Wirtschaftlichkeit"
        title="Umsatz & Profit"
      >
        <KpiCard
          label="Umsatz"
          value={formatEUR(k.revenue)}
          hint={
            k.cancelledLeads > 0
              ? `Netto im Zeitraum · Stornos abgezogen`
              : "Brutto im Zeitraum"
          }
          tone="positive"
          delta={delta(k.revenue, p.revenue)}
          sparkline={{ points, dataKey: "revenue" }}
        />
        <KpiCard
          label="Stornos"
          value={formatEUR(k.cancelledRevenue)}
          hint={`${formatNumber(k.cancelledLeads)} stornierte ${
            k.cancelledLeads === 1 ? "Lead" : "Leads"
          } im Zeitraum (vom Umsatz abgezogen)`}
          tone={k.cancelledRevenue > 0 ? "negative" : undefined}
          delta={delta(k.cancelledRevenue, p.cancelledRevenue, true)}
        />
        <KpiCard
          label="Kosten / Netto-Lead"
          value={formatEUR(k.costPerLead)}
          hint={`Lead-Kosten gesamt: ${formatEUR(k.leadCosts)}${
            customerId ? " (anteilig)" : ""
          }`}
          delta={delta(k.costPerLead, p.costPerLead, true)}
          sparkline={{ points, dataKey: "costPerLead" }}
        />
        <KpiCard
          label="Kosten / Termin"
          value={formatEUR(
            k.terminLeads > 0 ? k.leadCosts / k.terminLeads : null,
          )}
          hint={`Aus ${formatNumber(k.terminLeads)} Terminen`}
          delta={delta(
            k.terminLeads > 0 ? k.leadCosts / k.terminLeads : null,
            p.terminLeads > 0 ? p.leadCosts / p.terminLeads : null,
            true,
          )}
          sparkline={{ points, dataKey: "costPerTermin" }}
        />
        <KpiCard
          label="Kosten / Abschluss"
          value={formatEUR(
            k.closedLeads > 0 ? k.leadCosts / k.closedLeads : null,
          )}
          hint={`Aus ${formatNumber(k.closedLeads)} Abschlüssen`}
          delta={delta(
            k.closedLeads > 0 ? k.leadCosts / k.closedLeads : null,
            p.closedLeads > 0 ? p.leadCosts / p.closedLeads : null,
            true,
          )}
          sparkline={{ points, dataKey: "costPerClosed" }}
        />
      </KpiSection>

      <KpiSection
        eyebrow="Sektion · Margen & Volumen"
        title="Effizienz im Überblick"
      >
        <KpiCard
          label="Marge vor weiteren Kosten"
          value={formatPercent(k.marginBeforeOther)}
          hint="Operativ vor Fixkosten"
          tone={
            k.marginBeforeOther != null && k.marginBeforeOther >= 0
              ? "positive"
              : "negative"
          }
          delta={delta(k.marginBeforeOther, p.marginBeforeOther)}
          sparkline={{ points, dataKey: "marginBeforeOther" }}
        />
        <KpiCard
          label="Marge nach weiteren Kosten"
          value={formatPercent(k.marginAfterOther)}
          hint="Nach Werbe- & Toolkosten"
          tone={
            k.marginAfterOther != null && k.marginAfterOther >= 0
              ? "positive"
              : "negative"
          }
          delta={delta(k.marginAfterOther, p.marginAfterOther)}
          sparkline={{ points, dataKey: "marginAfterOther" }}
        />
        <KpiCard
          label="Gewinn vor weiteren Kosten"
          value={formatEUR(k.profitBeforeOther)}
          hint="Vor Werbe- & Toolkosten"
          tone={k.profitBeforeOther >= 0 ? "positive" : "negative"}
          delta={delta(k.profitBeforeOther, p.profitBeforeOther)}
          sparkline={{ points, dataKey: "profitBeforeOther" }}
        />
        <KpiCard
          label="Gewinn nach weiteren Kosten"
          value={formatEUR(k.profitAfterOther)}
          hint={`Weitere Kosten: ${formatEUR(k.otherCosts)}`}
          tone={k.profitAfterOther >= 0 ? "positive" : "negative"}
          delta={delta(k.profitAfterOther, p.profitAfterOther)}
          sparkline={{ points, dataKey: "profitAfterOther" }}
        />
      </KpiSection>
    </div>
  );
}

function ChannelSpendGrid({
  current,
  previous,
}: {
  current: ChannelSpend;
  previous: ChannelSpend;
}) {
  const hasAny = current.total > 0 || previous.total > 0;
  // Section trotzdem rendern, wenn Outbrain noch keine Daten liefert — so
  // bleibt der Platz im Dashboard reserviert.
  return (
    <KpiSection
      eyebrow="Sektion · Werbekanäle"
      title="Spend pro Kanal"
    >
      <KpiCard
        label="Meta"
        value={formatEUR(current.meta)}
        hint="Facebook & Instagram Ads"
        delta={delta(current.meta, previous.meta, true)}
      />
      <KpiCard
        label="Outbrain"
        value={formatEUR(current.outbrain)}
        hint={
          current.outbrain === 0 && previous.outbrain === 0
            ? "noch keine Daten — API-Freischaltung ausstehend"
            : "Amplify Native Ads"
        }
        delta={delta(current.outbrain, previous.outbrain, true)}
      />
      <KpiCard
        label="Werbespend gesamt"
        value={formatEUR(current.total)}
        hint={
          hasAny
            ? `Meta + Outbrain${current.other > 0 ? " + Sonstige" : ""}`
            : "Brutto im Zeitraum"
        }
        tone="neutral"
        delta={delta(current.total, previous.total, true)}
      />
    </KpiSection>
  );
}

function KpiSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
          {eyebrow}
        </div>
        <h2 className="mt-0.5 text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {children}
      </div>
    </section>
  );
}
