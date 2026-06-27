"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

// CRM-Filter-Bar oberhalb des Kanban-Boards. Filter werden in den URL-
// Query-Params persistiert (?q=…&closed=1) — so kann der Admin einen
// Filter-Stand teilen oder als Bookmark speichern.
export function CrmFilterBar({
  currentQuery,
}: {
  currentQuery: string;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/crm";
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Lokaler Such-State mit Debounce — sonst feuert jede getippte Taste
  // einen Server-Round-Trip. 250 ms ist sanft genug fürs Tippen, ohne
  // dass der Filter "hängt".
  const [search, setSearch] = useState(currentQuery);
  useEffect(() => {
    setSearch(currentQuery);
  }, [currentQuery]);

  useEffect(() => {
    if (search === currentQuery) return;
    const t = setTimeout(() => {
      update({ q: search || null });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function update(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--muted)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name / Firma suchen"
          className="w-56 rounded-lg border border-[color:var(--border)] bg-white py-1.5 pl-8 pr-7 text-sm focus:border-[color:var(--brand)] focus:outline-none"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Suche zurücksetzen"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
