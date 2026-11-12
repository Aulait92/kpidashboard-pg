import { redirect } from "next/navigation";
import { EmpfehlungGrowthRow } from "@/components/empfehlung/server";
import { ChevronDown } from "lucide-react";
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
} from "@/lib/kpis";
import {
  formatDate,
  formatEUR,
  formatNumber,
} from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { TeamStats } from "@/components/team-stats";
import { GarantieKundeCard } from "@/components/garantie-kunde-card";
import { nowMs } from "@/lib/now";
import { includesTrail, sumProvision } from "@/lib/provision";
import { loadCustomerProvision } from "@/lib/provision-server";

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
  // Berater: Zahlen (Kosten, Gewinn) sieht nur der Inhaber.
  if (session.teamRole === "advisor") redirect("/buyer/leads");

  const sp = await searchParams;
  const { key: rangeKey, range } = parseRangeFromSearchParams(sp);
  const renderedAt = nowMs();

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
              {formatDate(range.from)} bis {formatDate(range.to)} · aktualisiert{" "}
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

        <EmpfehlungGrowthRow ctx={{ customerId: session.customerId, teamRole: session.teamRole }} />

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
          <TeamStats customerId={session.customerId} range={range} />
          <GarantieKundeCard customerId={session.customerId} />
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
        select: { closeValue: true, status: true, source: true },
      }),
      prisma.lead.findMany({
        where: {
          customerId,
          createdAt: { gte: prev.from, lte: prev.to },
        },
        select: { closeValue: true, status: true, source: true },
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

  // Geschätzte Provision (lib/provision.ts) nur aus tatsächlich
  // abgeschlossenen Leads — ein aus „Abschluss" zurückgezogener Lead darf
  // nichts tragen, auch wenn der alte Wert noch am Datensatz hängt.
  const closedRows = (rows: { closeValue: unknown; status: string | null; source: string | null }[]) =>
    rows.filter((r) => r.status?.toLowerCase() === "abschluss");
  const { rates } = await loadCustomerProvision(customerId);
  const umsatz = sumProvision(closedRows(closeValueRows), rates);
  const umsatzPrev = sumProvision(closedRows(closeValueRowsPrev), rates);
  const gewinn = umsatz - cost;
  const gewinnPrev = umsatzPrev - costPrev;

  return (
    <div className="mt-6 space-y-6">
      <FunnelHero kpis={k} />


      <section>
        <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Kosten &amp; Ertrag</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Lead-Kosten"
            value={formatEUR(cost)}
            tone="neutral"
            hint={k.nettoLeads > 0 ? `${formatEUR(cost / k.nettoLeads)} pro Lead` : costHint}
            delta={delta(cost, costPrev, true)}
          />
          <KpiCard
            label="Provision (geschätzt)"
            value={formatEUR(umsatz)}
            tone="positive"
            hint={`aus ${formatNumber(k.closedLeads)} ${k.closedLeads === 1 ? "Abschluss" : "Abschlüssen"}${includesTrail(rates) ? " · inkl. Bestandsprovision 1. Jahr" : ""}`}
            delta={delta(umsatz, umsatzPrev)}
          />
          <KpiCard
            label="Gewinn"
            value={formatEUR(gewinn)}
            tone={gewinn >= 0 ? "positive" : "negative"}
            hint="Provision minus Lead-Kosten"
            delta={delta(gewinn, gewinnPrev)}
          />
          <KpiCard
            label="Kosten pro Abschluss"
            value={formatEUR(k.closedLeads > 0 ? cost / k.closedLeads : null)}
            hint={k.terminLeads > 0 ? `${formatEUR(cost / k.terminLeads)} pro Termin` : undefined}
            delta={delta(
              k.closedLeads > 0 ? cost / k.closedLeads : null,
              p.closedLeads > 0 ? costPrev / p.closedLeads : null,
              true,
            )}
          />
        </div>
      </section>

      <details className="group rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-md)] [&>summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center justify-between px-5 py-3.5 text-[15px] font-semibold">
          Hochrechnung für diesen Monat
          <ChevronDown className="h-4 w-4 text-[color:var(--muted)] transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-[color:var(--border)] p-2 sm:p-3">
          <MonthlyForecast forecast={forecast} />
        </div>
      </details>

      {/* BuyerComparison/Leaderboard temporär ausgeblendet —
          wird wieder eingebaut, sobald der Vergleich freigegeben ist. */}
    </div>
  );
}
