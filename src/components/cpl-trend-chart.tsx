"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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

// Dual-Axis-Chart: Lead-Menge als Balken (links), CPL als Linie (rechts).
// Hilft schnell zu erkennen, ob CPL steigt während die Menge fällt
// (Verschwendung) oder ob beides gleichmäßig läuft.
export function CplTrendChart({
  points,
  granularity,
}: {
  points: TimeSeriesPoint[];
  granularity: Granularity;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
          CPL · {GRANULARITY_LABEL[granularity]}
        </div>
        <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
          Lead-Menge und Cost-per-Lead im Verlauf
        </h2>
        <p className="mt-1 text-xs text-[color:var(--muted)]">
          Balken = Netto-Leads, Linie = Ø Lead-Kosten pro Lead, Fläche =
          Gesamt-Spend. Steigende Linie bei sinkenden Balken = Effizienz fällt.
        </p>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={points}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barCategoryGap="30%"
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
              yAxisId="leads"
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={false}
              width={40}
              allowDecimals={false}
            />
            <YAxis
              yAxisId="cpl"
              orientation="right"
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) =>
                typeof v === "number" && Number.isFinite(v)
                  ? `${Math.round(v)} €`
                  : ""
              }
            />
            {/* Eigene, ausgeblendete Achse für den Gesamt-Spend — er ist
                betragsmäßig viel größer als der CPL und würde dessen Achse
                sonst zusammenstauchen. Werte stehen im Tooltip. */}
            <YAxis
              yAxisId="spend"
              orientation="right"
              hide
              domain={[0, "dataMax"]}
            />
            <Tooltip
              cursor={{ fill: "rgba(37, 99, 235, 0.06)" }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                fontSize: 12,
              }}
              labelStyle={{ color: "#64748b", fontSize: 11 }}
              formatter={(value, name) => {
                if (typeof value !== "number") return ["–", name];
                if (name === "Ø CPL" || name === "Gesamt-Spend")
                  return [formatEUR(value), name];
                return [formatNumber(value), name];
              }}
            />
            <Legend
              align="right"
              verticalAlign="top"
              height={24}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11 }}
            />
            <Area
              yAxisId="spend"
              type="monotone"
              dataKey="leadCosts"
              name="Gesamt-Spend"
              stroke="#10b981"
              strokeWidth={1.5}
              fill="#10b981"
              fillOpacity={0.12}
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Bar
              yAxisId="leads"
              dataKey="leads"
              name="Leads"
              fill="#2563eb"
              radius={[4, 4, 0, 0]}
            />
            <Line
              yAxisId="cpl"
              type="monotone"
              dataKey="costPerLead"
              name="Ø CPL"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 3, fill: "#f59e0b" }}
              activeDot={{ r: 4 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
