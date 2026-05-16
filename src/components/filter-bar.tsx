"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  Dropdown,
  DropdownDivider,
  DropdownItem,
} from "@/components/dropdown";
import { RANGE_LABELS, type RangeKey } from "@/lib/date-ranges";
import { PRODUCTS } from "@/lib/products";

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
  "max",
];

export type Customer = { id: string; name: string };

export function FilterBar({
  customers,
  currentRange,
  currentCustomerId,
  currentProduct,
  customFrom,
  customTo,
}: {
  customers: Customer[];
  currentRange: RangeKey;
  currentCustomerId: string | null;
  currentProduct: string | null;
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

  const rangeLabel =
    currentRange === "custom"
      ? customFrom && customTo
        ? `${customFrom} – ${customTo}`
        : "Eigener Zeitraum"
      : RANGE_LABELS[currentRange];

  const customerName =
    currentCustomerId
      ? customers.find((c) => c.id === currentCustomerId)?.name ?? "Alle Kunden"
      : "Alle Kunden";

  return (
    <>
      <Dropdown label="Zeitraum" value={rangeLabel}>
        {(close) => (
          <>
            {RANGE_ORDER.map((key) => (
              <DropdownItem
                key={key}
                active={currentRange === key}
                onClick={() => {
                  update({ range: key });
                  close();
                }}
              >
                {RANGE_LABELS[key]}
              </DropdownItem>
            ))}
            <DropdownDivider />
            <div className="px-2 pt-1 pb-2">
              <div className="mb-1.5 px-1 text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
                Eigener Zeitraum
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={customFrom ?? ""}
                  onChange={(e) =>
                    update({ range: "custom", from: e.target.value })
                  }
                  className="min-w-0 flex-1 rounded-md border border-[color:var(--border)] bg-white px-2 py-1 text-xs focus:border-[color:var(--brand)] focus:outline-none"
                />
                <span className="text-[color:var(--muted)]">–</span>
                <input
                  type="date"
                  value={customTo ?? ""}
                  onChange={(e) =>
                    update({ range: "custom", to: e.target.value })
                  }
                  className="min-w-0 flex-1 rounded-md border border-[color:var(--border)] bg-white px-2 py-1 text-xs focus:border-[color:var(--brand)] focus:outline-none"
                />
              </div>
            </div>
          </>
        )}
      </Dropdown>

      <Dropdown label="Produkt" value={currentProduct ?? "Alle"}>
        {(close) => (
          <>
            <DropdownItem
              active={currentProduct === null}
              onClick={() => {
                update({ product: null });
                close();
              }}
            >
              Alle
            </DropdownItem>
            {PRODUCTS.map((p) => (
              <DropdownItem
                key={p}
                active={currentProduct === p}
                onClick={() => {
                  update({ product: p });
                  close();
                }}
              >
                {p}
              </DropdownItem>
            ))}
          </>
        )}
      </Dropdown>

      <Dropdown label="Kunde" value={customerName}>
        {(close) => (
          <div className="max-h-72 overflow-y-auto">
            <DropdownItem
              active={currentCustomerId === null}
              onClick={() => {
                update({ customerId: null });
                close();
              }}
            >
              Alle Kunden
            </DropdownItem>
            {customers.length > 0 ? <DropdownDivider /> : null}
            {customers.map((c) => (
              <DropdownItem
                key={c.id}
                active={currentCustomerId === c.id}
                onClick={() => {
                  update({ customerId: c.id });
                  close();
                }}
              >
                {c.name}
              </DropdownItem>
            ))}
          </div>
        )}
      </Dropdown>

      {isPending ? (
        <span className="text-[11px] text-[color:var(--brand)]">
          Aktualisiere…
        </span>
      ) : null}
    </>
  );
}
