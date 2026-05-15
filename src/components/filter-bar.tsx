"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { RANGE_LABELS, type RangeKey } from "@/lib/date-ranges";
import { cn } from "@/lib/utils";

const RANGE_ORDER: Exclude<RangeKey, "custom">[] = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "thisYear",
];

export type Customer = { id: string; name: string };

export function FilterBar({
  customers,
  currentRange,
  currentCustomerId,
  customFrom,
  customTo,
}: {
  customers: Customer[];
  currentRange: RangeKey;
  currentCustomerId: string | null;
  customFrom?: string;
  customTo?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function update(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    if (patch.range && patch.range !== "custom") {
      params.delete("from");
      params.delete("to");
    }
    startTransition(() => {
      router.replace(`/?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <div className="flex flex-wrap items-center gap-2">
        {RANGE_ORDER.map((key) => {
          const active = currentRange === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => update({ range: key })}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
                active
                  ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white shadow-sm hover:bg-[color:var(--brand-dark)]"
                  : "border-[color:var(--border)] bg-white text-[color:var(--foreground)] hover:border-[color:var(--brand)] hover:text-[color:var(--brand)]",
              )}
            >
              {RANGE_LABELS[key]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-4 border-t border-[color:var(--border)] pt-4">
        <label className="flex flex-col text-sm">
          <span className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
            Kunde
          </span>
          <select
            value={currentCustomerId ?? ""}
            onChange={(e) =>
              update({ customerId: e.target.value === "" ? null : e.target.value })
            }
            className="min-w-[220px] rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm transition focus:border-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-soft)]"
          >
            <option value="">Alle Kunden</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="flex flex-col">
          <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
            Eigener Zeitraum
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={customFrom ?? ""}
              onChange={(e) => update({ range: "custom", from: e.target.value })}
              className="rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm transition focus:border-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-soft)]"
            />
            <span className="text-[color:var(--muted)]">–</span>
            <input
              type="date"
              value={customTo ?? ""}
              onChange={(e) => update({ range: "custom", to: e.target.value })}
              className="rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm transition focus:border-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-soft)]"
            />
          </div>
        </fieldset>

        {isPending ? (
          <span className="text-xs text-[color:var(--brand)]">Aktualisiere…</span>
        ) : null}
      </div>
    </div>
  );
}
