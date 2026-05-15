"use client";

import { useTransition, useState } from "react";
import { runAirtableSync, type SyncActionResult } from "@/lib/actions";

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
        className="rounded-md border border-zinc-900 bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Synchronisiere…" : "Aus Airtable synchronisieren"}
      </button>

      {result?.ok ? (
        <span className="text-xs text-emerald-600 dark:text-emerald-400">
          ✓ {result.result.leads} Leads, {result.result.revenues} Umsätze,{" "}
          {result.result.customers} Kunden, {result.result.costs} Kosten-Posten
          synchronisiert
          {result.result.errors.length > 0
            ? ` (${result.result.errors.length} Fehler)`
            : ""}
        </span>
      ) : null}

      {result && !result.ok ? (
        <span className="text-xs text-rose-600 dark:text-rose-400">
          Fehler: {result.error}
        </span>
      ) : null}
    </div>
  );
}
