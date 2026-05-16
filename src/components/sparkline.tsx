"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import type { TimeSeriesPoint } from "@/lib/kpis";

// Pflückt die letzten N Datenpunkte für eine einzelne Metrik. null-Werte
// werden auf 0 gemapped damit die Linie zusammenhängend bleibt.
function seriesFor(
  points: TimeSeriesPoint[],
  key: keyof TimeSeriesPoint,
): { value: number }[] {
  return points.map((p) => {
    const v = p[key];
    const n = typeof v === "number" ? v : 0;
    return { value: Number.isFinite(n) ? n : 0 };
  });
}

export function Sparkline({
  points,
  dataKey,
  tone = "positive",
  height = 36,
}: {
  points: TimeSeriesPoint[];
  dataKey: keyof TimeSeriesPoint;
  tone?: "positive" | "negative" | "neutral";
  height?: number;
}) {
  const data = seriesFor(points, dataKey);
  const stroke =
    tone === "negative"
      ? "#dc2626"
      : tone === "neutral"
        ? "#64748b"
        : "#10b981";
  const fill =
    tone === "negative"
      ? "rgba(220, 38, 38, 0.10)"
      : tone === "neutral"
        ? "rgba(100, 116, 139, 0.10)"
        : "rgba(16, 185, 129, 0.12)";

  if (data.length === 0) return null;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <Area
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={1.5}
            fill={fill}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
