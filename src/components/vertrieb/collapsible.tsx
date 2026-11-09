"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Auf-/zuklappbare Karte. Der Zustand wird pro Bereich im Browser gemerkt
 * (gilt dann für alle Kontakte), Standard ist aufgeklappt.
 */
export function Collapsible({ id, title, children }: { id: string; title: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const key = `crm-collapsed-${id}`;

  useEffect(() => {
    try {
      if (localStorage.getItem(key) === "1" && ref.current) ref.current.open = false;
    } catch {}
  }, [key]);

  return (
    <details
      ref={ref}
      open
      className="card group"
      onToggle={(e) => {
        try {
          localStorage.setItem(key, (e.currentTarget as HTMLDetailsElement).open ? "0" : "1");
        } catch {}
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-medium select-none group-open:border-b group-open:border-slate-100 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="text-xs font-normal text-slate-400">
          <span className="group-open:hidden">aufklappen ▾</span>
          <span className="hidden group-open:inline">zuklappen ▴</span>
        </span>
      </summary>
      {children}
    </details>
  );
}
