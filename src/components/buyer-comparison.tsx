"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import type { CustomerKpiRow } from "@/lib/kpis";
import { formatDuration, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type Row = {
  customerId: string;
  displayName: string; // "Du" oder "Buyer A", "Buyer B", …
  isSelf: boolean;
  totalLeads: number;
  reachabilityRate: number | null;
  terminLeads: number;
  terminRate: number | null;
  closingRate: number | null;
  avgHoursToFirstContact: number | null;
};

type SortKey =
  | "totalLeads"
  | "reachabilityRate"
  | "terminRate"
  | "closingRate"
  | "avgHoursToFirstContact";

type SortDir = "asc" | "desc";

const COLUMNS: {
  key: SortKey;
  label: string;
  defaultDir: SortDir;
  // niedriger ist besser? (relevant für die Rang-Berechnung + Pfeil)
  lowerIsBetter?: boolean;
}[] = [
  { key: "totalLeads", label: "Leads", defaultDir: "desc" },
  { key: "reachabilityRate", label: "Erreichbarkeit", defaultDir: "desc" },
  { key: "terminRate", label: "Termin-Rate", defaultDir: "desc" },
  { key: "closingRate", label: "Closing", defaultDir: "desc" },
  {
    key: "avgHoursToFirstContact",
    label: "Ø Zeit bis Erstkontakt",
    defaultDir: "asc",
    lowerIsBetter: true,
  },
];

function compare(a: Row, b: Row, key: SortKey, dir: SortDir): number {
  const av = a[key];
  const bv = b[key];
  const mult = dir === "asc" ? 1 : -1;
  if (av == null && bv == null) return 0;
  if (av == null) return 1; // nulls last
  if (bv == null) return -1;
  return ((av as number) - (bv as number)) * mult;
}

export function BuyerComparison({
  rows,
  selfCustomerId,
}: {
  rows: CustomerKpiRow[];
  selfCustomerId: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("closingRate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Stable Letter pro Customer-ID, basierend auf alphabetischer Reihenfolge
  // der echten Namen. Die eigene Zeile zeigt "Du", alle anderen "Buyer X".
  const anonymized: Row[] = useMemo(() => {
    const others = rows
      .filter((r) => r.customerId !== selfCustomerId)
      .slice()
      .sort((a, b) => a.customerName.localeCompare(b.customerName, "de"));
    const letterFor = new Map<string, string>();
    others.forEach((r, i) => {
      // 26 Buyer = A..Z, dann AA, AB … falls je viele werden
      const letter =
        i < 26
          ? String.fromCharCode(65 + i)
          : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`;
      letterFor.set(r.customerId, letter);
    });

    return rows.map((r) => {
      const terminRate =
        r.reachedLeads > 0 ? r.terminLeads / r.reachedLeads : null;
      const isSelf = r.customerId === selfCustomerId;
      return {
        customerId: r.customerId,
        displayName: isSelf
          ? "Du"
          : `Buyer ${letterFor.get(r.customerId) ?? "?"}`,
        isSelf,
        totalLeads: r.totalLeads,
        reachabilityRate: r.reachabilityRate,
        terminLeads: r.terminLeads,
        terminRate,
        closingRate: r.closingRate,
        avgHoursToFirstContact: r.avgHoursToFirstContact,
      };
    });
  }, [rows, selfCustomerId]);

  const sorted = useMemo(
    () => [...anonymized].sort((a, b) => compare(a, b, sortKey, sortDir)),
    [anonymized, sortKey, sortDir],
  );

  // Rang des eigenen Buyers nach aktuellem Sort. Wenn lowerIsBetter und sort
  // ist asc, ist Platz 1 der beste — also einfach Index + 1 verwenden.
  const selfRank = sorted.findIndex((r) => r.isSelf) + 1;
  const total = sorted.length;

  function onHeaderClick(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(COLUMNS.find((c) => c.key === key)?.defaultDir ?? "desc");
    }
  }

  if (total <= 1) {
    return (
      <div className="rounded-2xl border border-[color:var(--border)] bg-white p-5 text-sm text-[color:var(--muted)] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
        Aktuell gibt es keine vergleichbaren Buyer im Zeitraum.
      </div>
    );
  }

  const sortedCol = COLUMNS.find((c) => c.key === sortKey);

  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
            Benchmark
          </div>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            Wie du im Vergleich liegst
          </h2>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            Andere Buyer sind anonymisiert. Sortierung bestimmt deinen
            aktuellen Rang.
          </p>
        </div>
        {selfRank > 0 ? (
          <div className="inline-flex items-center gap-2 rounded-full bg-[color:var(--brand-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-dark)]">
            <Trophy className="h-3.5 w-3.5" />
            Platz {selfRank} von {total}
            {sortedCol ? (
              <span className="font-normal text-[color:var(--muted)]">
                · {sortedCol.label}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[560px] w-full text-sm">
          <thead className="bg-[color:var(--brand-soft)]/30 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
            <tr>
              <th className="px-3 py-2.5 text-left">#</th>
              <th className="px-3 py-2.5 text-left">Buyer</th>
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
                    className="px-3 py-2.5 text-right"
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
            {sorted.map((r, idx) => (
              <tr
                key={r.customerId}
                className={cn(
                  "border-b border-[color:var(--border)] last:border-b-0",
                  r.isSelf
                    ? "bg-[color:var(--brand-soft)]/50"
                    : "hover:bg-zinc-50",
                )}
              >
                <td className="px-3 py-2.5 tabular-nums text-[color:var(--muted)]">
                  {idx + 1}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5",
                    r.isSelf
                      ? "font-bold text-[color:var(--brand-dark)]"
                      : "text-[color:var(--foreground)]",
                  )}
                >
                  {r.displayName}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatNumber(r.totalLeads)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatPercent(r.reachabilityRate)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatPercent(r.terminRate)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatPercent(r.closingRate)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatDuration(r.avgHoursToFirstContact)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 pb-4 pt-2 text-[11px] text-[color:var(--muted)]">
        Andere Buyer-Namen werden niemals offengelegt — nur deren Werte.
      </div>
    </div>
  );
}
