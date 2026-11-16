"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Weitere Filter einer Liste: am Handy hinter „Filter“ (Suche bleibt sichtbar), am Rechner immer offen.
 * Die Felder bleiben im selben Formular, es wird also nichts doppelt abgeschickt.
 */
export function MoreFilters({ active, children, className }: { active: number; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(active > 0);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-10 items-center gap-1.5 self-start rounded-[var(--radius-sm)] px-1 text-sm font-medium text-[color:var(--brand)] md:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" />
        {open ? "Weniger Filter" : active ? `Weitere Filter (${active})` : "Weitere Filter"}
      </button>
      <div className={cn(open ? "contents" : "hidden md:contents", className)}>{children}</div>
    </>
  );
}
