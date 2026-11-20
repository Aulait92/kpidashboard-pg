import Link from "next/link";
import { cn } from "@/lib/utils";

// Eine Chip-Reihe für die Listen von Verkaufen (Termine, Angebote): höchstens 5 Chips, ein Standard vorgewählt,
// Zähler im Chip. Am Handy waagrecht wischbar statt umbrechend (Gestaltungsregel „eine Chip-Reihe“, Umbau 19.11.2026).

export type Chip = { key: string; label: string; href: string; anzahl?: number };

export function Chips({ chips, aktiv, label, funktion }: { chips: Chip[]; aktiv: string; label: string; funktion?: string }) {
  return (
    <nav aria-label={label} className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" data-funktion={funktion} data-chips>
      {chips.map((c) => {
        const an = c.key === aktiv;
        return (
          <Link
            key={c.key}
            href={c.href}
            aria-current={an ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-sm font-medium sm:min-h-9",
              an ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white" : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
            )}
          >
            {c.label}
            {c.anzahl != null ? <span className="tabular-nums opacity-80">{c.anzahl}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
