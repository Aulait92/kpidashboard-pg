import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/admin-tabs";
import { KpiCard } from "@/components/kpi-card";
import { getCurrentSession } from "@/lib/auth";
import { formatEUR, formatNumber, formatPercent } from "@/lib/format";
import { computeSalesKpis } from "@/lib/sales-kpis";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sales-KPIs | KPI-Dashboard",
};

export default async function AdminKpisPage() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/login");
  }

  const k = await computeSalesKpis();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Sales-KPIs
        </h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Performance unserer eigenen Pipeline (CRM → Deal-Pipeline).
        </p>
      </header>

      <AdminTabs />

      {k.totalDeals === 0 ? (
        <div className="mt-6 rounded-2xl border border-[color:var(--border)] bg-white p-6 text-sm text-[color:var(--muted)]">
          Noch keine Deals in der DB. Setze `AIRTABLE_SALES_BASE_ID` in
          Railway, stoße einen Sync an, und die KPIs füllen sich.
        </div>
      ) : (
        <>
          <Section title="Pipeline">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard
                label="Deals in Pipeline"
                value={formatNumber(k.pipelineDeals)}
                hint={`${formatNumber(k.totalDeals)} gesamt`}
              />
              <KpiCard
                label="Pipeline-Wert"
                value={formatEUR(k.pipelineValue)}
                hint="Summe offener Deal-Werte"
              />
              <KpiCard
                label="Gewichtete Pipeline"
                value={formatEUR(k.weightedValue)}
                hint="Wert × Win-Wahrscheinlichkeit je Phase"
              />
              <KpiCard
                label="Ø Deal-Wert"
                value={formatEUR(k.avgDealValue)}
                hint="Über alle Deals mit Wert"
              />
            </div>
          </Section>

          <Section title="Performance">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard
                label="Gewonnen"
                value={formatNumber(k.wonCount)}
                tone="positive"
                hint={formatEUR(k.wonValue)}
              />
              <KpiCard
                label="Verloren"
                value={formatNumber(k.lostCount)}
                tone="negative"
                hint="Closed-Lost"
              />
              <KpiCard
                label="Win-Rate"
                value={formatPercent(k.winRate)}
                hint={`${k.wonCount} von ${k.wonCount + k.lostCount} entschieden`}
              />
              <KpiCard
                label="Ø Cycle Time"
                value={
                  k.avgCycleTimeDays != null
                    ? `${Math.round(k.avgCycleTimeDays)} Tage`
                    : "—"
                }
                hint="Erstellung → Gewonnen"
              />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <KpiCard
                label="Sales-Velocity"
                value={
                  k.salesVelocityPerDay != null
                    ? `${formatEUR(k.salesVelocityPerDay)} / Tag`
                    : "—"
                }
                hint="(Qualified-Deals × Ø-Wert × Win-Rate) / Cycle-Time"
              />
              <KpiCard
                label="Umsatz aus Won (gesamt)"
                value={formatEUR(k.wonValue)}
                hint={`${formatNumber(k.wonCount)} Abschlüsse`}
              />
            </div>
          </Section>

          <Section title="Phasen-Aufschlüsselung">
            <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[color:var(--brand-soft)]/30 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
                  <tr>
                    <th className="px-5 py-2.5 text-left">Phase</th>
                    <th className="px-5 py-2.5 text-right">Deals</th>
                    <th className="px-5 py-2.5 text-right">Wert</th>
                    <th className="px-5 py-2.5 text-right">Gewichtet</th>
                    <th className="px-5 py-2.5 text-right">Ø Tage</th>
                  </tr>
                </thead>
                <tbody>
                  {k.phaseStats.map((p) => (
                    <tr
                      key={p.key}
                      className="border-t border-[color:var(--border)]"
                    >
                      <td className="px-5 py-2.5 font-medium">{p.label}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">
                        {p.count}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums">
                        {p.value > 0 ? formatEUR(p.value) : "—"}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-[color:var(--muted)]">
                        {p.weightedValue > 0 ? formatEUR(p.weightedValue) : "—"}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-[color:var(--muted)]">
                        {p.avgDaysInPhase != null
                          ? `${Math.round(p.avgDaysInPhase)} d`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {k.lostReasons.length > 0 ? (
            <Section title="Verlust-Gründe">
              <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[color:var(--brand-soft)]/30 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
                    <tr>
                      <th className="px-5 py-2.5 text-left">Grund</th>
                      <th className="px-5 py-2.5 text-right">Deals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {k.lostReasons.map((r) => (
                      <tr
                        key={r.reason}
                        className="border-t border-[color:var(--border)]"
                      >
                        <td className="px-5 py-2.5">{r.reason}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums">
                          {r.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}

          <Section title={`Hochrechnung ${k.forecast.monthLabel}`}>
            <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[color:var(--brand-soft)]/30 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
                  <tr>
                    <th className="px-5 py-2.5 text-left">Kennzahl</th>
                    <th className="px-5 py-2.5 text-right">
                      MTD (Tag {k.forecast.daysElapsed} / {k.forecast.daysTotal})
                    </th>
                    <th className="px-5 py-2.5 text-right">Hochrechnung</th>
                    <th className="px-5 py-2.5 text-right">Vormonat (voll)</th>
                  </tr>
                </thead>
                <tbody>
                  {k.forecast.rows.map((r) => (
                    <tr
                      key={r.label}
                      className="border-t border-[color:var(--border)]"
                    >
                      <td className="px-5 py-2.5 font-medium">{r.label}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">
                        {r.format === "currency"
                          ? formatEUR(r.mtd)
                          : formatNumber(r.mtd)}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-[color:var(--muted)]">
                        {r.format === "currency"
                          ? formatEUR(r.projected)
                          : formatNumber(r.projected)}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-[color:var(--muted)]">
                        {r.format === "currency"
                          ? formatEUR(r.previousFull)
                          : formatNumber(r.previousFull)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}
