"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CancellationBreakdown } from "@/lib/kpis";
import { formatNumber, formatPercent } from "@/lib/format";

// Rosé-Palette — Stornos sind ein „negativer" Indikator, aber wir
// differenzieren die Gründe trotzdem klar.
const COLORS = [
  "#e11d48",
  "#f97316",
  "#f59e0b",
  "#a855f7",
  "#6366f1",
  "#0ea5e9",
  "#14b8a6",
  "#84cc16",
];

export function CancellationReasons({
  breakdown,
  closedLeads,
}: {
  breakdown: CancellationBreakdown;
  closedLeads: number;
}) {
  const { total, reasons } = breakdown;
  const rate = closedLeads > 0 ? total / closedLeads : null;

  return (
    <section className="rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
            Stornos · Gründe
          </div>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            Warum Kunden stornieren
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 sm:text-right">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
              Stornos
            </div>
            <div className="text-lg font-bold tabular-nums sm:text-xl">
              {formatNumber(total)}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
              Stornoquote
            </div>
            <div className="text-lg font-bold tabular-nums sm:text-xl">
              {formatPercent(rate)}
            </div>
          </div>
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--brand-soft)]/20 px-4 py-8 text-center text-sm text-[color:var(--muted)]">
          Im gewählten Zeitraum gab es keine Stornierungen. 🎉
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={reasons}
                  dataKey="count"
                  nameKey="reason"
                  innerRadius="55%"
                  outerRadius="90%"
                  paddingAngle={2}
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {reasons.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    fontSize: 12,
                  }}
                  formatter={(value, _name, item) => {
                    const n = typeof value === "number" ? value : Number(value);
                    const pct = total > 0 ? n / total : 0;
                    const reason =
                      (item?.payload as { reason?: string } | undefined)
                        ?.reason ?? "";
                    return [
                      `${formatNumber(n)} (${formatPercent(pct)})`,
                      reason,
                    ];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <ul className="flex flex-col gap-2 self-center">
            {reasons.map((r, i) => {
              const pct = total > 0 ? r.count / total : 0;
              const color = COLORS[i % COLORS.length];
              return (
                <li
                  key={r.reason}
                  className="flex items-center gap-3 text-sm"
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[color:var(--foreground)]">
                    {r.reason}
                  </span>
                  <span className="shrink-0 tabular-nums text-[color:var(--muted)]">
                    {formatNumber(r.count)}
                  </span>
                  <span className="w-12 shrink-0 text-right text-[11px] tabular-nums font-semibold text-[color:var(--brand-dark)]">
                    {formatPercent(pct)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
