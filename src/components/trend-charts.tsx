"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Granularity, TimeSeriesPoint } from "@/lib/kpis";
import { formatNumber } from "@/lib/format";

const GRANULARITY_LABEL: Record<Granularity, string> = {
  day: "pro Tag",
  week: "pro Woche",
  month: "pro Monat",
};

export function TrendCharts({
  points,
  granularity,
}: {
  points: TimeSeriesPoint[];
  granularity: Granularity;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
            Trend · {GRANULARITY_LABEL[granularity]}
          </div>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            Verlauf im Zeitraum
          </h2>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={points}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barCategoryGap="30%"
            barGap={2}
          >
            <CartesianGrid
              vertical={false}
              stroke="#e5e7eb"
              strokeDasharray="2 4"
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={false}
              width={40}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(37, 99, 235, 0.06)" }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                fontSize: 12,
              }}
              labelStyle={{ color: "#64748b", fontSize: 11 }}
              formatter={(value, name) => [
                typeof value === "number" ? formatNumber(value) : "–",
                name,
              ]}
            />
            <Legend
              align="right"
              verticalAlign="top"
              height={24}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11 }}
            />
            <Bar
              dataKey="leads"
              name="Leads"
              fill="#2563eb"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="closedLeads"
              name="Abschlüsse"
              fill="#10b981"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
