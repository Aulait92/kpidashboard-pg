import { Suspense } from "react";
import { FilterBar } from "@/components/filter-bar";
import { KpiCard } from "@/components/kpi-card";
import { SyncButton } from "@/components/sync-button";
import { parseRangeFromSearchParams } from "@/lib/date-ranges";
import { computeKpis, listCustomers } from "@/lib/kpis";
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

  const sp = await searchParams;
  const { key: rangeKey, range } = parseRangeFromSearchParams(sp);
  const customerId =
    sp.customerId && sp.customerId.length > 0 ? sp.customerId : null;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            KPI-Dashboard
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Zeitraum: {formatDate(range.from)} – {formatDate(range.to)}
          </p>
        </div>
        <SyncButton />
      </header>

      <Suspense fallback={<div className="text-sm text-zinc-500">Lade Filter…</div>}>
        <FiltersSection
          currentRange={rangeKey}
          currentCustomerId={customerId}
          customFrom={sp.from}
          customTo={sp.to}
        />
      </Suspense>

      <Suspense
        fallback={
          <div className="mt-6 text-sm text-zinc-500">Lade Kennzahlen…</div>
        }
      >
        <KpiGrid range={range} customerId={customerId} />
      </Suspense>
    </main>
  );
}

function SetupNotice() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16 sm:px-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        <h1 className="text-xl font-semibold">Setup erforderlich</h1>
        <p className="mt-2 text-sm">
          Die Umgebungsvariable <code className="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-900">DATABASE_URL</code> ist nicht gesetzt.
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
  customFrom,
  customTo,
}: {
  currentRange: ReturnType<typeof parseRangeFromSearchParams>["key"];
  currentCustomerId: string | null;
  customFrom?: string;
  customTo?: string;
}) {
  const customers = await listCustomers();
  return (
    <div className="mb-6">
      <FilterBar
        customers={customers}
        currentRange={currentRange}
        currentCustomerId={currentCustomerId}
        customFrom={customFrom}
        customTo={customTo}
      />
    </div>
  );
}

async function KpiGrid({
  range,
  customerId,
}: {
  range: { from: Date; to: Date };
  customerId: string | null;
}) {
  const k = await computeKpis({ range, customerId });

  return (
    <>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Erreichbarkeitsquote"
          value={formatPercent(k.reachabilityRate)}
          hint={`${k.reachedLeads} von ${k.totalLeads} Leads erreicht`}
        />
        <KpiCard
          label="Kontaktversuche / Lead"
          value={formatNumber(k.avgContactAttempts)}
          hint="Durchschnitt im Zeitraum"
        />
        <KpiCard
          label="Zeit bis Erstkontakt"
          value={formatDuration(k.avgHoursToFirstContact)}
          hint="Durchschnitt"
        />
        <KpiCard
          label="Closing Rate"
          value={formatPercent(k.closingRate)}
          hint={`${k.closedLeads} von ${k.totalLeads} abgeschlossen`}
        />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Umsatz" value={formatEUR(k.revenue)} tone="positive" />
        <KpiCard
          label="Cost per Lead"
          value={formatEUR(k.costPerLead)}
          hint={`Lead-Kosten gesamt: ${formatEUR(k.leadCosts)}`}
        />
        <KpiCard
          label="Gewinn vor weiteren Kosten"
          value={formatEUR(k.profitBeforeOther)}
          tone={k.profitBeforeOther >= 0 ? "positive" : "negative"}
        />
        <KpiCard
          label="Gewinn nach weiteren Kosten"
          value={formatEUR(k.profitAfterOther)}
          hint={`Weitere Kosten: ${formatEUR(k.otherCosts)}`}
          tone={k.profitAfterOther >= 0 ? "positive" : "negative"}
        />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Marge vor weiteren Kosten"
          value={formatPercent(k.marginBeforeOther)}
          tone={
            k.marginBeforeOther != null && k.marginBeforeOther >= 0
              ? "positive"
              : "negative"
          }
        />
        <KpiCard
          label="Marge nach weiteren Kosten"
          value={formatPercent(k.marginAfterOther)}
          tone={
            k.marginAfterOther != null && k.marginAfterOther >= 0
              ? "positive"
              : "negative"
          }
        />
        <KpiCard
          label="Leads gesamt"
          value={formatNumber(k.totalLeads)}
          tone="neutral"
        />
        <KpiCard
          label="Abschlüsse"
          value={formatNumber(k.closedLeads)}
          tone="neutral"
        />
      </section>
    </>
  );
}
