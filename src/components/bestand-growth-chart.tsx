"use client";

// „So wächst Ihr Bestand“ (Ole, 14.11.2026): Bestandsprovision je Jahr über 5 Jahre, wenn im
// aktuellen Tempo weiter abgeschlossen wird (lib/provision.bestandGrowth). CI-Farben wie die
// übrigen Diagramme auf /buyer/zahlen. Zum Aufklappen; das Diagramm entsteht erst beim Öffnen,
// damit es die richtige Breite bekommt.

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatEUR } from "@/lib/format";

export type GrowthPoint = { year: number; existing: number; added: number; total: number };

export function BestandGrowthSection({ points, intro }: { points: GrowthPoint[]; intro: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="group rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-md)] [&>summary::-webkit-details-marker]:hidden"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      data-bestand-wachstum
    >
      <summary className="flex cursor-pointer items-center justify-between px-5 py-3.5 text-[15px] font-semibold">
        So wächst Ihr Bestand
        <ChevronDown className="h-4 w-4 text-[color:var(--muted)] transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-[color:var(--border)] p-4 sm:p-5">
        <p className="mb-3 text-sm text-[color:var(--muted)]">{intro}</p>
        {open ? <BestandGrowthChart points={points} /> : <div className="h-56" />}
      </div>
    </details>
  );
}

export function BestandGrowthChart({ points }: { points: GrowthPoint[] }) {
  const data = points.map((p) => ({ ...p, label: `${p.year}. Jahr` }));
  return (
    <div className="h-56 min-w-0" data-bestand-chart>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="2 4" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => formatEUR(v)} />
          <Tooltip
            formatter={(v, name) => [formatEUR(Number(v)), name === "existing" ? "aus bisherigen Verträgen" : "aus neuen Verträgen"]}
            labelFormatter={(l) => `Bestandsprovision im ${String(l)}`}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Legend formatter={(v) => (v === "existing" ? "aus bisherigen Verträgen" : "aus neuen Verträgen im gleichen Tempo")} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="existing" stackId="b" fill="var(--brand-dark)" />
          <Bar dataKey="added" stackId="b" fill="var(--brand)" fillOpacity={0.45} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
