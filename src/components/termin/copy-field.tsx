"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Link oder Code mit Kopieren-Knopf (Admin: Buchungsseite, Vertriebskontakt). */
export function CopyField({ value, label = "Kopieren", multiline = false }: { value: string; label?: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Zwischenablage nicht verfügbar */
    }
  };
  return (
    <div className={`flex gap-2 ${multiline ? "flex-col" : "items-center"}`}>
      {multiline ? (
        <textarea readOnly value={value} rows={7} className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-3 py-2 font-mono text-xs" />
      ) : (
        <input readOnly value={value} className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-3 py-2 text-sm" />
      )}
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 self-start rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm font-semibold"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} {copied ? "Kopiert" : label}
      </button>
    </div>
  );
}
