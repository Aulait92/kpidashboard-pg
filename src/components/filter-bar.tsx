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
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center gap-2">
        {RANGE_ORDER.map((key) => {
          const active = currentRange === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => update({ range: key })}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium transition",
                active
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
              )}
            >
              {RANGE_LABELS[key]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-sm">
          <span className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Kunde
          </span>
          <select
            value={currentCustomerId ?? ""}
            onChange={(e) =>
              update({ customerId: e.target.value === "" ? null : e.target.value })
            }
            className="min-w-[200px] rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
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
          <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Eigener Zeitraum
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={customFrom ?? ""}
              onChange={(e) => update({ range: "custom", from: e.target.value })}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <span className="text-zinc-500">–</span>
            <input
              type="date"
              value={customTo ?? ""}
              onChange={(e) => update({ range: "custom", to: e.target.value })}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
        </fieldset>

        {isPending ? (
          <span className="text-xs text-zinc-500">Aktualisiere…</span>
        ) : null}
      </div>
    </div>
  );
}
