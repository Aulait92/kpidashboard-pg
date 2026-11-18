import Link from "next/link";
import { cn } from "@/lib/utils";

// Ansichten innerhalb einer Seite des Bereichs Leads & Kampagnen (Pay-per-Lead, Alle Leads, Werbekonten):
// runde Schalter unter den Reitern, eine Ansicht aktiv. Zähler rot, wenn dort etwas zu tun ist.

export type Ansicht = { key: string; label: string; href: string; count?: number; funktion?: string };

export function Ansichten({ items, aktiv }: { items: Ansicht[]; aktiv: string }) {
  return (
    <nav className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0" aria-label="Ansicht">
      {items.map((v) => {
        const an = v.key === aktiv;
        return (
          <Link
            key={v.key || "start"}
            href={v.href}
            aria-current={an ? "page" : undefined}
            data-funktion={v.funktion}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition",
              an ? "bg-[color:var(--foreground)] text-white" : "text-[color:var(--muted)] ring-1 ring-inset ring-[color:var(--border)] hover:bg-white hover:text-[color:var(--foreground)]",
            )}
          >
            {v.label}
            {v.count ? <span className={cn("rounded-full px-1.5 text-xs", an ? "bg-white/20" : "bg-rose-600 text-white")}>{v.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Rückmeldung nach einer Aktion (?ok= / ?err=), ein Satz. */
export function Meldung({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <p role="status" className={cn("mb-4 rounded-[var(--radius-md)] px-4 py-2.5 text-sm ring-1 ring-inset", err ? "bg-rose-50 text-rose-800 ring-rose-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200")}>
      {err ?? ok}
    </p>
  );
}

