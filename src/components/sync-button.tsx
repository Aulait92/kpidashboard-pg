"use client";

import { ChevronDown, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { useTransition, useState } from "react";
import { runAirtableSync, type SyncActionResult } from "@/lib/actions";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

type MetaResult = Extract<
  SyncActionResult,
  { ok: true }
>["meta"] extends infer M
  ? M extends { ok: true; result: infer R }
    ? R
    : never
  : never;

function aggregateByCampaign<T extends { campaign: string; spend: number }>(
  rows: T[],
): (T & { spend: number })[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const existing = map.get(row.campaign);
    if (existing) {
      existing.spend += row.spend;
    } else {
      map.set(row.campaign, { ...row });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.spend - a.spend);
}

function MetaCampaignDetails({ meta }: { meta: MetaResult }) {
  const matched = aggregateByCampaign(meta.matched);
  const unmatched = aggregateByCampaign(meta.unmatched);

  if (matched.length === 0 && unmatched.length === 0) return null;

  return (
    <div className="mt-3 w-full space-y-3 rounded-xl border border-[color:var(--border)] bg-white p-4 text-xs">
      {matched.length > 0 && (
        <div>
          <div className="mb-1.5 font-semibold text-emerald-700">
            Klassifiziert ({matched.length})
          </div>
          <ul className="space-y-1">
            {matched.map((m) => (
              <li
                key={m.campaign}
                className="flex items-baseline justify-between gap-2"
              >
                <span className="truncate">
                  <span
                    className={cn(
                      "mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      "product" in m && m.product === "Wechsel"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-violet-100 text-violet-700",
                    )}
                  >
                    {"product" in m ? m.product : ""}
                  </span>
                  {m.campaign}
                </span>
                <span className="shrink-0 tabular-nums text-[color:var(--muted)]">
                  {formatEUR(m.spend)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {unmatched.length > 0 && (
        <div>
          <div className="mb-1.5 font-semibold text-amber-700">
            Ohne Produkt-Match ({unmatched.length}) – fließen nicht in
            Lead-Kosten
          </div>
          <ul className="space-y-1">
            {unmatched.map((m) => (
              <li
                key={m.campaign}
                className="flex items-baseline justify-between gap-2"
              >
                <span className="truncate">{m.campaign}</span>
                <span className="shrink-0 tabular-nums text-[color:var(--muted)]">
                  {formatEUR(m.spend)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function SyncButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncActionResult | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  function handleClick() {
    setResult(null);
    setDetailsOpen(false);
    startTransition(async () => {
      const r = await runAirtableSync();
      setResult(r);
    });
  }

  const metaOk = result?.ok && result.meta.ok ? result.meta.result : null;

  return (
    <div className="flex flex-wrap items-start gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-label={pending ? "Synchronisiere" : "Daten synchronisieren"}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60 sm:min-h-0 sm:px-4 sm:py-2"
      >
        <RefreshCw
          className={cn("h-4 w-4", pending && "animate-spin")}
          strokeWidth={2.5}
        />
        <span className="hidden sm:inline">
          {pending ? "Synchronisiere…" : "Daten synchronisieren"}
        </span>
      </button>

      {result?.ok ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {result.result.leads} Leads, {result.result.revenues} Umsätze,{" "}
            {result.result.customers} Kunden, {result.result.costs} Kosten
            {result.result.errors.length > 0
              ? ` (${result.result.errors.length} Fehler)`
              : ""}
          </span>
          {result.meta.ok ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Meta: {result.meta.result.costs} Spend-Posten
              {result.meta.result.unmatched.length > 0
                ? ` (${result.meta.result.unmatched.length} ohne Produkt-Match)`
                : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              <XCircle className="h-3.5 w-3.5" />
              Meta übersprungen: {result.meta.error}
            </span>
          )}
          {metaOk &&
          (metaOk.matched.length > 0 || metaOk.unmatched.length > 0) ? (
            <button
              type="button"
              onClick={() => setDetailsOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-white px-2.5 py-1 text-xs font-medium text-[color:var(--foreground)] transition hover:border-[color:var(--brand)] hover:text-[color:var(--brand)]"
            >
              {detailsOpen ? "Details ausblenden" : "Kampagnen anzeigen"}
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  detailsOpen && "rotate-180",
                )}
              />
            </button>
          ) : null}
        </div>
      ) : null}

      {result && !result.ok ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
          <XCircle className="h-3.5 w-3.5" />
          Fehler: {result.error}
        </span>
      ) : null}

      {detailsOpen && metaOk ? <MetaCampaignDetails meta={metaOk} /> : null}
    </div>
  );
}
