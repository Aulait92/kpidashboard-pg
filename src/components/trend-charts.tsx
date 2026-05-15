"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Granularity, TimeSeriesPoint } from "@/lib/kpis";
import { formatEUR, formatNumber } from "@/lib/format";

const GRANULARITY_LABEL: Record<Granularity, string> = {
  day: "pro Tag",
  week: "pro Woche",
  month: "pro Monat",
};

function compactEUR(v: number): string {
  if (!Number.isFinite(v)) return "–";
  const abs = Math.abs(v);
  if (abs >= 1000) return `${(v / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}k €`;
  return `${Math.round(v)} €`;
}

function ChartCard({
  title,
  hint,
  points,
  dataKey,
  formatValue,
  yTickFormatter,
}: {
  title: string;
  hint: string;
  points: TimeSeriesPoint[];
  dataKey: keyof TimeSeriesPoint;
  formatValue: (v: number) => string;
  yTickFormatter?: (v: number) => string;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
          {title}
        </div>
        <div className="text-[10px] text-[color:var(--muted)]">{hint}</div>
      </div>
      <div className="mt-3 h-48 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={points}
            margin={{ top: 8, right: 10, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id={`grad-${String(dataKey)}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="#e5e7eb"
              strokeDasharray="2 4"
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#64748b" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#64748b" }}
              tickLine={false}
              axisLine={false}
              width={50}
              tickFormatter={yTickFormatter}
            />
            <Tooltip
              cursor={{ stroke: "#94a3b8", strokeDasharray: "2 4" }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                fontSize: 12,
              }}
              formatter={(value) => [
                typeof value === "number" ? formatValue(value) : "–",
                title,
              ]}
              labelStyle={{ color: "#64748b", fontSize: 11 }}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke="#2563eb"
              strokeWidth={2}
              fill={`url(#grad-${String(dataKey)})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function TrendCharts({
  points,
  granularity,
}: {
  points: TimeSeriesPoint[];
  granularity: Granularity;
}) {
  const hint = GRANULARITY_LABEL[granularity];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        title="Leads"
        hint={hint}
        points={points}
        dataKey="leads"
        formatValue={(v) => formatNumber(v)}
        yTickFormatter={(v) => `${v}`}
      />
      <ChartCard
        title="Umsatz"
        hint={hint}
        points={points}
        dataKey="revenue"
        formatValue={(v) => formatEUR(v)}
        yTickFormatter={compactEUR}
      />
      <ChartCard
        title="Lead-Kosten"
        hint={hint}
        points={points}
        dataKey="leadCosts"
        formatValue={(v) => formatEUR(v)}
        yTickFormatter={compactEUR}
      />
      <ChartCard
        title="Cost per Lead"
        hint={hint}
        points={points}
        dataKey="costPerLead"
        formatValue={(v) => formatEUR(v)}
        yTickFormatter={compactEUR}
      />
    </div>
  );
}
