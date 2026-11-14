"use client";

// „So wächst Ihr Bestand“ (Ole, 14.11.2026): Bestandsprovision je Jahr über 5 Jahre, wenn im
// aktuellen Tempo weiter abgeschlossen wird (lib/provision.bestandGrowth). CI-Farben wie die
// übrigen Diagramme auf /buyer/zahlen.

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatEUR } from "@/lib/format";

export type GrowthPoint = { year: number; existing: number; added: number; total: number };

export function BestandGrowthChart({ points }: { points: GrowthPoint[] }) {
  const data = points.map((p) => ({ ...p, label: `${p.year}. Jahr` }));
  return (
    <div className="h-56" data-bestand-chart>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="2 4" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => formatEUR(v)} />
          <Tooltip
            formatter={(v, name) => [formatEUR(Number(v)), name === "existing" ? "aus bisherigen Verträgen" : "aus neuen Verträgen"]}
            labelFormatter={(l) => `Bestandsprovision im ${String(l)}`}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Legend formatter={(v) => (v === "existing" ? "aus bisherigen Verträgen" : "aus neuen Verträgen im gleichen Tempo")} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="existing" stackId="b" fill="var(--brand-dark)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="added" stackId="b" fill="var(--brand)" fillOpacity={0.45} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
