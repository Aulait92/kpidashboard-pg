"use client";

import { LogOut, MoreVertical, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/login/actions";
import { cn } from "@/lib/utils";

// Kompaktes "more"-Menü für admin-spezifische Aktionen, die auf Mobile
// zu viel Platz wegnehmen würden (Buyer-Verwaltung, Abmelden).
export function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Mehr"
        title="Mehr"
        className={cn(
          "inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border bg-white text-sm transition sm:min-h-0 sm:min-w-0 sm:px-3 sm:py-1.5",
          open
            ? "border-[color:var(--brand)] shadow-sm"
            : "border-[color:var(--border)] hover:border-[color:var(--brand)]",
        )}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 min-w-[200px] max-w-[calc(100vw-2rem)] rounded-xl border border-[color:var(--border)] bg-white p-1 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.18)]">
          <Link
            href="/admin/buyers"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm text-[color:var(--foreground)] transition hover:bg-zinc-50"
          >
            <Users className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
            Buyer verwalten
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm text-[color:var(--foreground)] transition hover:bg-zinc-50"
            >
              <LogOut className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
              Abmelden
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
