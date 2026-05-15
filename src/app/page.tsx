import { Suspense } from "react";
import { FilterBar } from "@/components/filter-bar";
import { KpiCard, type Delta } from "@/components/kpi-card";
import { SyncButton } from "@/components/sync-button";
import { parseRangeFromSearchParams, previousRange } from "@/lib/date-ranges";
import { computeKpis, listCustomers, PRODUCTS, type Kpis } from "@/lib/kpis";
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

  const sp = await searchParams;
  const { key: rangeKey, range } = parseRangeFromSearchParams(sp);
  const customerId =
    sp.customerId && sp.customerId.length > 0 ? sp.customerId : null;
  const product =
    sp.product && (PRODUCTS as readonly string[]).includes(sp.product)
      ? sp.product
      : null;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--brand-soft)] px-3 py-1 text-xs font-medium text-[color:var(--brand-dark)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--brand)]" />
            Live KPI-Übersicht
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            KPI-<span className="text-[color:var(--brand)]">Dashboard</span>.
          </h1>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            Zeitraum: {formatDate(range.from)} – {formatDate(range.to)}
          </p>
        </div>
        <SyncButton />
      </header>

      <Suspense fallback={<div className="text-sm text-[color:var(--muted)]">Lade Filter…</div>}>
        <FiltersSection
          currentRange={rangeKey}
          currentCustomerId={customerId}
          currentProduct={product}
          customFrom={sp.from}
          customTo={sp.to}
        />
      </Suspense>

      <Suspense
        fallback={
          <div className="mt-6 text-sm text-[color:var(--muted)]">Lade Kennzahlen…</div>
        }
      >
        <KpiGrid range={range} customerId={customerId} product={product} />
      </Suspense>
    </main>
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
    <div className="mb-6">
      <FilterBar
        customers={customers}
        currentRange={currentRange}
        currentCustomerId={currentCustomerId}
        currentProduct={currentProduct}
        customFrom={customFrom}
        customTo={customTo}
      />
    </div>
  );
}

// Δ-Berechnung: relative Veränderung gegenüber Vorperiode.
// null, wenn Vorperiode 0 ist (Division durch 0) oder beide Werte nicht
// vergleichbar. Bei Raten (z.B. closingRate) liefert sie ebenfalls
// relative Änderung.
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

async function KpiGrid({
  range,
  customerId,
  product,
}: {
  range: { from: Date; to: Date };
  customerId: string | null;
  product: string | null;
}) {
  const prev = previousRange(range);
  const [k, p] = await Promise.all([
    computeKpis({ range, customerId, product }),
    computeKpis({ range: prev, customerId, product }) as Promise<Kpis>,
  ]);

  return (
    <div className="mt-8 space-y-8">
      <KpiSection
        eyebrow="Lead-Performance"
        title="Wie performt dein Funnel"
      >
        <KpiCard
          label="Erreichbarkeitsquote"
          value={formatPercent(k.reachabilityRate)}
          hint={`${k.reachedLeads} von ${k.totalLeads} Leads erreicht`}
          delta={delta(k.reachabilityRate, p.reachabilityRate)}
        />
        <KpiCard
          label="Kontaktversuche / Lead"
          value={formatNumber(k.avgContactAttempts)}
          hint="Durchschnitt im Zeitraum"
          delta={delta(k.avgContactAttempts, p.avgContactAttempts, true)}
        />
        <KpiCard
          label="Zeit bis Erstkontakt"
          value={formatDuration(k.avgHoursToFirstContact)}
          hint="Durchschnitt"
          delta={delta(k.avgHoursToFirstContact, p.avgHoursToFirstContact, true)}
        />
        <KpiCard
          label="Closing Rate"
          value={formatPercent(k.closingRate)}
          hint={`${k.closedLeads} von ${k.totalLeads} abgeschlossen`}
          delta={delta(k.closingRate, p.closingRate)}
        />
      </KpiSection>

      <KpiSection
        eyebrow="Wirtschaftlichkeit"
        title="Umsatz & Profit"
      >
        <KpiCard
          label="Umsatz"
          value={formatEUR(k.revenue)}
          tone="positive"
          delta={delta(k.revenue, p.revenue)}
        />
        <KpiCard
          label="Cost per Lead"
          value={formatEUR(k.costPerLead)}
          hint={`Lead-Kosten gesamt: ${formatEUR(k.leadCosts)}${
            customerId ? " (anteilig nach Lead-Anteil)" : ""
          }`}
          delta={delta(k.costPerLead, p.costPerLead, true)}
        />
        <KpiCard
          label="Gewinn vor weiteren Kosten"
          value={formatEUR(k.profitBeforeOther)}
          tone={k.profitBeforeOther >= 0 ? "positive" : "negative"}
          delta={delta(k.profitBeforeOther, p.profitBeforeOther)}
        />
        <KpiCard
          label="Gewinn nach weiteren Kosten"
          value={formatEUR(k.profitAfterOther)}
          hint={`Weitere Kosten: ${formatEUR(k.otherCosts)}`}
          tone={k.profitAfterOther >= 0 ? "positive" : "negative"}
          delta={delta(k.profitAfterOther, p.profitAfterOther)}
        />
      </KpiSection>

      <KpiSection
        eyebrow="Margen & Volumen"
        title="Effizienz im Überblick"
      >
        <KpiCard
          label="Marge vor weiteren Kosten"
          value={formatPercent(k.marginBeforeOther)}
          tone={
            k.marginBeforeOther != null && k.marginBeforeOther >= 0
              ? "positive"
              : "negative"
          }
          delta={delta(k.marginBeforeOther, p.marginBeforeOther)}
        />
        <KpiCard
          label="Marge nach weiteren Kosten"
          value={formatPercent(k.marginAfterOther)}
          tone={
            k.marginAfterOther != null && k.marginAfterOther >= 0
              ? "positive"
              : "negative"
          }
          delta={delta(k.marginAfterOther, p.marginAfterOther)}
        />
        <KpiCard
          label="Leads gesamt"
          value={formatNumber(k.totalLeads)}
          tone="neutral"
          delta={delta(k.totalLeads, p.totalLeads)}
        />
        <KpiCard
          label="Abschlüsse"
          value={formatNumber(k.closedLeads)}
          tone="neutral"
          delta={delta(k.closedLeads, p.closedLeads)}
        />
      </KpiSection>
    </div>
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
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand)]">
          {eyebrow}
        </div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {children}
      </div>
    </section>
  );
}
