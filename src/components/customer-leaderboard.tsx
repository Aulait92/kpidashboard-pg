"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import type { CustomerKpiRow } from "@/lib/kpis";
import {
  formatEUR,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type SortKey =
  | "customerName"
  | "totalLeads"
  | "revenue"
  | "leadCosts"
  | "costPerLead"
  | "reachabilityRate"
  | "closingRate"
  | "profit"
  | "margin";

type SortDir = "asc" | "desc";

const COLUMNS: {
  key: SortKey;
  label: string;
  numeric: boolean;
  defaultDir: SortDir;
}[] = [
  { key: "customerName", label: "Buyer", numeric: false, defaultDir: "asc" },
  { key: "totalLeads", label: "Leads", numeric: true, defaultDir: "desc" },
  { key: "revenue", label: "Umsatz", numeric: true, defaultDir: "desc" },
  { key: "leadCosts", label: "Lead-Kosten", numeric: true, defaultDir: "desc" },
  {
    key: "costPerLead",
    label: "Cost / Lead",
    numeric: true,
    defaultDir: "asc",
  },
  {
    key: "reachabilityRate",
    label: "Erreichbarkeit",
    numeric: true,
    defaultDir: "desc",
  },
  {
    key: "closingRate",
    label: "Closing",
    numeric: true,
    defaultDir: "desc",
  },
  { key: "profit", label: "Profit", numeric: true, defaultDir: "desc" },
  { key: "margin", label: "Marge", numeric: true, defaultDir: "desc" },
];

function compare(
  a: CustomerKpiRow,
  b: CustomerKpiRow,
  key: SortKey,
  dir: SortDir,
): number {
  const av = a[key];
  const bv = b[key];
  const mult = dir === "asc" ? 1 : -1;
  if (av == null && bv == null) return 0;
  if (av == null) return 1; // nulls last
  if (bv == null) return -1;
  if (typeof av === "string" && typeof bv === "string") {
    return av.localeCompare(bv, "de") * mult;
  }
  return ((av as number) - (bv as number)) * mult;
}

export function CustomerLeaderboard({ rows }: { rows: CustomerKpiRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("profit");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => compare(a, b, sortKey, sortDir));
  }, [rows, sortKey, sortDir]);

  function onHeaderClick(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(COLUMNS.find((c) => c.key === key)?.defaultDir ?? "desc");
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-[color:var(--border)] bg-white p-6 text-sm text-[color:var(--muted)]">
        Keine Buyer-Aktivität im gewählten Zeitraum.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-[color:var(--brand-soft)]/40 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
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
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.customerId}
                className="border-b border-[color:var(--border)] last:border-b-0 hover:bg-[color:var(--brand-soft)]/30"
              >
                <td className="px-3 py-2.5 font-medium">{r.customerName}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatNumber(r.totalLeads)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatEUR(r.revenue)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatEUR(r.leadCosts)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatEUR(r.costPerLead)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatPercent(r.reachabilityRate)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatPercent(r.closingRate)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right tabular-nums font-semibold",
                    r.profit >= 0 ? "text-emerald-600" : "text-rose-600",
                  )}
                >
                  {formatEUR(r.profit)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right tabular-nums",
                    r.margin != null && r.margin >= 0
                      ? "text-emerald-600"
                      : "text-rose-600",
                  )}
                >
                  {formatPercent(r.margin)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
