import Link from "next/link";
import { cn } from "@/lib/utils";

export type Chip = { label: string; href: string; anzahl: number; aktiv: boolean; /** auch bei 0 zeigen */ immer?: boolean };

// Filter-Chips mit Anzahl, gleiches Aussehen wie auf Heute (components/admin/heute-bausteine.tsx: HeuteFilterChips).
// Chips ohne Treffer fallen weg (außer aktiv oder „immer“). Am Handy waagrecht wischbar.
export function Chips({ eintraege, label = "Filter" }: { eintraege: Chip[]; label?: string }) {
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label={label}>
      {eintraege
        .filter((c) => c.anzahl || c.aktiv || c.immer)
        .map((c) => (
          <Link
            key={c.href}
            href={c.href}
            aria-current={c.aktiv ? "true" : undefined}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition",
              c.aktiv
                ? "border-[color:var(--foreground)] bg-[color:var(--foreground)] text-white"
                : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
            )}
          >
            {c.label}
            <span className={cn("text-xs", c.aktiv ? "text-white/70" : "")}>{c.anzahl}</span>
          </Link>
        ))}
    </div>
  );
}
