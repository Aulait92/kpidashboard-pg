"use client";

// Neue Leads: je Kanal (E-Mail, Push) „Aus / Nur meine / Alle im Team“ (Ole, 26.11.2026). Gleiche Auswahl-Leiste wie
// „Rechnen mit“ auf Wachstum (components/gewinn-modus.tsx), Zeile wie die übrigen Schalter dieser Seite.

import { useOptimistic, useTransition } from "react";
import { setLeadBenachrichtigungAction } from "./actions";
import { useToast } from "@/components/ui/toast";
import type { LeadScope } from "@/lib/lead-benachrichtigung-shared";

const LABEL: Record<LeadScope, string> = { aus: "Aus", meine: "Nur meine", alle: "Alle im Team" };

export function LeadBenachrichtigungWahl({
  kanal,
  titel,
  wert,
  optionen,
  disabled = false,
}: {
  kanal: "mail" | "push";
  titel: string;
  wert: LeadScope;
  optionen: LeadScope[];
  disabled?: boolean;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [value, setValue] = useOptimistic(wert);
  const choose = (next: LeadScope) => {
    if (next === value || disabled) return;
    start(async () => {
      setValue(next);
      const res = await setLeadBenachrichtigungAction(kanal, next);
      if (!res.ok) toast.show({ message: res.error, tone: "error" });
    });
  };
  return (
    <div className="flex min-h-[64px] flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3" data-lead-benachrichtigung={kanal}>
      <span className="min-w-0 flex-1 font-medium">{titel}</span>
      <div
        className={`grid w-full gap-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken,#f1f5f9)] p-1 ring-1 ring-inset ring-[color:var(--border)] sm:w-auto ${pending ? "opacity-70" : ""}`}
        style={{ gridTemplateColumns: `repeat(${optionen.length}, minmax(0, 1fr))` }}
        role="radiogroup"
        aria-label={titel}
      >
        {optionen.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            disabled={disabled}
            onClick={() => choose(o)}
            className={`min-h-10 whitespace-nowrap rounded-[6px] px-3 py-1.5 text-sm font-semibold transition disabled:opacity-60 sm:min-h-9 ${value === o ? "bg-white text-[color:var(--foreground)] shadow-sm" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"}`}
          >
            {LABEL[o]}
          </button>
        ))}
      </div>
    </div>
  );
}
