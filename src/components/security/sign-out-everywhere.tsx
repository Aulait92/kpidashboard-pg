"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, LogOut } from "lucide-react";

/** Knopf „Auf allen anderen Geräten abmelden“. */
export function SignOutEverywhereButton({ action, disabled = false }: { action: () => Promise<{ ok: boolean }>; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            if (!window.confirm("Auf allen anderen Geräten abmelden? Dieses Gerät bleibt angemeldet.")) return;
            const r = await action();
            setDone(r.ok);
          })
        }
        className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-4 text-sm font-semibold hover:bg-[color:var(--background)] disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
        Überall abmelden
      </button>
      {done ? (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
          <Check className="h-4 w-4" /> Alle anderen Geräte sind abgemeldet.
        </span>
      ) : null}
    </div>
  );
}
