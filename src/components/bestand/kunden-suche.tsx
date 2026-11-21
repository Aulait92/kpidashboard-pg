"use client";

// Suche und Sortierung der Kundenliste im Bestand (Paket 3, 20.11.2026): gilt beim Tippen, ohne „Anzeigen“-Knopf.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function KundenSuche({ withSort }: { withSort: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const apply = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    next.delete("n");
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    start(() => router.replace(`${s ? `${pathname}?${s}` : pathname}#kunden`, { scroll: false }));
  };
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q.trim()) apply({ q: q.trim() || null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className={cn("flex flex-wrap gap-2 transition-opacity", pending && "opacity-60")}>
      <label className="relative flex h-10 min-w-[14rem] flex-1 items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[color:var(--muted)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, Telefon, E-Mail oder Kundennummer"
          aria-label="Kunden suchen"
          className="h-10 w-full rounded-full border border-[color:var(--border)] bg-white pl-9 pr-8 text-sm outline-none focus:border-[color:var(--brand)]"
          data-bestand-search
        />
        {q ? (
          <button type="button" aria-label="Suche leeren" onClick={() => setQ("")} className="absolute right-2.5 text-[color:var(--muted)]">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </label>
      {withSort ? (
        <select
          defaultValue={params.get("sort") === "beitrag" ? "beitrag" : ""}
          onChange={(e) => apply({ sort: e.target.value || null })}
          aria-label="Sortierung"
          className="h-10 rounded-full border border-[color:var(--border)] bg-white px-3 text-sm"
        >
          <option value="">Nach Name</option>
          <option value="beitrag">Nach Jahresbeitrag</option>
        </select>
      ) : null}
    </div>
  );
}
