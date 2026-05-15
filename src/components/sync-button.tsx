"use client";

import { RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { useTransition, useState } from "react";
import { runAirtableSync, type SyncActionResult } from "@/lib/actions";
import { cn } from "@/lib/utils";

export function SyncButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncActionResult | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const r = await runAirtableSync();
      setResult(r);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
      >
        <RefreshCw
          className={cn("h-4 w-4", pending && "animate-spin")}
          strokeWidth={2.5}
        />
        {pending ? "Synchronisiere…" : "Aus Airtable synchronisieren"}
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
        </div>
      ) : null}

      {result && !result.ok ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
          <XCircle className="h-3.5 w-3.5" />
          Fehler: {result.error}
        </span>
      ) : null}
    </div>
  );
}
