"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

// Aufklapp-Menü für Neben-Aktionen (eine Hauptaktion bleibt sichtbar).
export type MenuItem =
  | { type: "label"; label: string }
  | { type?: "item"; label: string; hint?: string; icon?: LucideIcon; tone?: "danger"; onSelect: () => void };

export function ActionMenu({
  label,
  icon: Icon,
  items,
  className,
}: {
  label: string;
  icon?: LucideIcon;
  items: MenuItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className={cn("relative", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} className={buttonClass("secondary", "sm", "w-full")}>
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
        <ChevronDown className="h-3.5 w-3.5 text-[color:var(--muted)]" />
      </button>
      {open ? (
        <div className="ui-fade-in absolute right-0 z-30 mt-1.5 w-60 overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white py-1 text-sm shadow-[var(--shadow-lg)]">
          {items.map((it, i) =>
            it.type === "label" ? (
              <div
                key={i}
                className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]"
              >
                {it.label}
              </div>
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[color:var(--surface-sunken)]",
                  it.tone === "danger" && "text-rose-700 hover:bg-rose-50",
                )}
              >
                {it.icon ? <it.icon className="mt-0.5 h-4 w-4 shrink-0 opacity-70" /> : null}
                <span>
                  {it.label}
                  {it.hint ? <span className="block text-[11px] text-[color:var(--muted)]">{it.hint}</span> : null}
                </span>
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
