"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import type { CustomerKpiRow, ProductKpiRow } from "@/lib/kpis";
import {
  formatEUR,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type Mode = "customer" | "product";

type Row = {
  id: string;
  name: string;
  totalLeads: number;
  reachedLeads: number;
  closedLeads: number;
  cancelledLeads: number;
  cancellationRate: number | null;
  reachabilityRate: number | null;
  closingRate: number | null;
  revenue: number;
  leadCosts: number;
  costPerLead: number | null;
  profit: number;
  margin: number | null;
};

function toRowsFromCustomers(rows: CustomerKpiRow[]): Row[] {
  return rows.map((r) => ({
    id: r.customerId,
    name: r.customerName,
    totalLeads: r.totalLeads,
    reachedLeads: r.reachedLeads,
    closedLeads: r.closedLeads,
    cancelledLeads: r.cancelledLeads,
    cancellationRate: r.cancellationRate,
    reachabilityRate: r.reachabilityRate,
    closingRate: r.closingRate,
    revenue: r.revenue,
    leadCosts: r.leadCosts,
    costPerLead: r.costPerLead,
    profit: r.profit,
    margin: r.margin,
  }));
}

function toRowsFromProducts(rows: ProductKpiRow[]): Row[] {
  return rows.map((r) => ({
    id: r.product,
    name: r.product,
    totalLeads: r.totalLeads,
    reachedLeads: r.reachedLeads,
    closedLeads: r.closedLeads,
    cancelledLeads: r.cancelledLeads,
    cancellationRate: r.cancellationRate,
    reachabilityRate: r.reachabilityRate,
    closingRate: r.closingRate,
    revenue: r.revenue,
    leadCosts: r.leadCosts,
    costPerLead: r.costPerLead,
    profit: r.profit,
    margin: r.margin,
  }));
}

type SortKey =
  | "name"
  | "totalLeads"
  | "reachedLeads"
  | "closedLeads"
  | "cancelledLeads"
  | "cancellationRate"
  | "closingRate"
  | "revenue"
  | "margin";

type SortDir = "asc" | "desc";

const COLUMNS: {
  key: SortKey;
  label: string;
  numeric: boolean;
  defaultDir: SortDir;
}[] = [
  { key: "name", label: "Name", numeric: false, defaultDir: "asc" },
  { key: "totalLeads", label: "Leads", numeric: true, defaultDir: "desc" },
  { key: "reachedLeads", label: "Erreicht", numeric: true, defaultDir: "desc" },
  {
    key: "closedLeads",
    label: "Abschlüsse",
    numeric: true,
    defaultDir: "desc",
  },
  { key: "closingRate", label: "Closing", numeric: true, defaultDir: "desc" },
  {
    key: "cancelledLeads",
    label: "Stornos",
    numeric: true,
    defaultDir: "desc",
  },
  {
    key: "cancellationRate",
    label: "Stornoquote",
    numeric: true,
    defaultDir: "desc",
  },
  { key: "revenue", label: "Umsatz", numeric: true, defaultDir: "desc" },
  { key: "margin", label: "Marge", numeric: true, defaultDir: "desc" },
];

function compare(a: Row, b: Row, key: SortKey, dir: SortDir): number {
  const av = a[key];
  const bv = b[key];
  const mult = dir === "asc" ? 1 : -1;
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (typeof av === "string" && typeof bv === "string") {
    return av.localeCompare(bv, "de") * mult;
  }
  return ((av as number) - (bv as number)) * mult;
}

const COLOR_PRESETS = [
  "bg-emerald-500",
  "bg-rose-500",
  "bg-blue-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-teal-500",
  "bg-pink-500",
  "bg-indigo-500",
];

export function PerformanceTable({
  customerRows,
  productRows,
}: {
  customerRows: CustomerKpiRow[];
  productRows: ProductKpiRow[];
}) {
  const [mode, setMode] = useState<Mode>("customer");
  const [sortKey, setSortKey] = useState<SortKey>("totalLeads");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows: Row[] = useMemo(
    () =>
      mode === "customer"
        ? toRowsFromCustomers(customerRows)
        : toRowsFromProducts(productRows),
    [mode, customerRows, productRows],
  );

  const sorted = useMemo(
    () => [...rows].sort((a, b) => compare(a, b, sortKey, sortDir)),
    [rows, sortKey, sortDir],
  );

  const totalLeadsAll = useMemo(
    () => sorted.reduce((acc, r) => acc + r.totalLeads, 0),
    [sorted],
  );

  function onHeaderClick(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(COLUMNS.find((c) => c.key === key)?.defaultDir ?? "desc");
    }
  }

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
            Leaderboard
          </div>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            {mode === "customer" ? "Performance pro Kunde" : "Performance pro Produkt"}
          </h2>
        </div>
        <div className="inline-flex rounded-full border border-[color:var(--border)] bg-white p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode("customer")}
            className={cn(
              "rounded-full px-3 py-1 transition",
              mode === "customer"
                ? "bg-[color:var(--brand)] text-white shadow-sm"
                : "text-[color:var(--foreground)] hover:text-[color:var(--brand)]",
            )}
          >
            Kunden
          </button>
          <button
            type="button"
            onClick={() => setMode("product")}
            className={cn(
              "rounded-full px-3 py-1 transition",
              mode === "product"
                ? "bg-[color:var(--brand)] text-white shadow-sm"
                : "text-[color:var(--foreground)] hover:text-[color:var(--brand)]",
            )}
          >
            Produkte
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="px-5 py-8 text-sm text-[color:var(--muted)]">
          Keine Aktivität im gewählten Zeitraum.
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[860px] text-sm">
            <thead className="bg-[color:var(--brand-soft)]/30 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
              <tr>
                {COLUMNS.map((col) => {
                  const active = sortKey === col.key;
                  const Icon = !active
                    ? ChevronsUpDown
                    : sortDir === "asc"
                      ? ChevronUp
                      : ChevronDown;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      className={cn(
                        "border-b border-[color:var(--border)] px-3 py-2.5",
                        col.numeric ? "text-right" : "text-left",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onHeaderClick(col.key)}
                        className={cn(
                          "inline-flex items-center gap-1 transition hover:text-[color:var(--brand)]",
                          active && "text-[color:var(--brand)]",
                        )}
                      >
                        {col.label}
                        <Icon className="h-3 w-3" />
                      </button>
                    </th>
                  );
                })}
                <th
                  scope="col"
                  className="w-[140px] border-b border-[color:var(--border)] px-3 py-2.5 text-left"
                >
                  Verteilung
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, idx) => {
                const share =
                  totalLeadsAll > 0 ? r.totalLeads / totalLeadsAll : 0;
                const dotColor = COLOR_PRESETS[idx % COLOR_PRESETS.length];
                return (
                  <tr
                    key={r.id}
                    className="border-b border-[color:var(--border)] last:border-b-0 hover:bg-[color:var(--brand-soft)]/20"
                  >
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={cn("h-2 w-2 rounded-full", dotColor)}
                          aria-hidden
                        />
                        <span className="font-medium">{r.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatNumber(r.totalLeads)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatNumber(r.reachedLeads)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatNumber(r.closedLeads)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatPercent(r.closingRate)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums",
                        r.cancelledLeads > 0 && "text-rose-600",
                      )}
                    >
                      {formatNumber(r.cancelledLeads)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums",
                        r.cancellationRate != null && r.cancellationRate > 0
                          ? "text-rose-600"
                          : "text-zinc-500",
                      )}
                    >
                      {formatPercent(r.cancellationRate)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatEUR(r.revenue)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums font-semibold",
                        r.margin != null && r.margin >= 0
                          ? "text-emerald-600"
                          : r.margin == null
                            ? "text-zinc-500"
                            : "text-rose-600",
                      )}
                    >
                      {formatPercent(r.margin)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className={cn("h-full", dotColor)}
                            style={{ width: `${share * 100}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-[11px] tabular-nums text-[color:var(--muted)]">
                          {formatPercent(share)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-5 pb-4 pt-2 text-[11px] text-[color:var(--muted)]">
        Lead-Kosten enthalten den anteiligen Meta-Spend (nach Lead-Anteil pro
        Monat × Produkt).
      </div>
    </div>
  );
}
