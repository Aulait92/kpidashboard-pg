"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// Kontakte (Umbau 19.11.2026): EINE Zeile mit Suche und „Filter“. Die selteneren Filter (Stufe, Cold Mail, LinkedIn, PLZ)
// stehen im Fenster (am Handy von unten, wie /buyer), aktive Filter als Zähler am Knopf und als Chips zum Entfernen.
// Auswahl gilt per URL-Parameter (gleiche Parameter wie die alte Liste: q, stage, mail, li, plz).

export type SuchFilterFeld = { key: string; label: string; options: { value: string; label: string }[] } | { key: string; label: string; text: { placeholder: string; inputMode?: "numeric" } };

export function SuchFilter({ felder, suche = "Suchen", children }: { felder: SuchFilterFeld[]; suche?: string; children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [offen, setOffen] = useState(false);
  const [entwurf, setEntwurf] = useState<Record<string, string>>({});

  const anwenden = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    next.delete("seite");
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    start(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  };

  // Suche: kurz nach dem Tippen anwenden
  const erst = useRef(true);
  useEffect(() => {
    if (erst.current) {
      erst.current = false;
      return;
    }
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q.trim()) anwenden({ q: q.trim() || null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const aktiv = felder.filter((f) => params.get(f.key));
  const wertLabel = (f: SuchFilterFeld, v: string) => ("options" in f ? (f.options.find((o) => o.value === v)?.label ?? v) : v);
  const oeffnen = () => {
    setEntwurf(Object.fromEntries(felder.map((f) => [f.key, params.get(f.key) ?? ""])));
    setOffen(true);
  };

  return (
    <div className={cn("space-y-2 transition-opacity", pending && "opacity-60")} data-such-filter>
      <div className="flex items-center gap-2">
        <label className="relative flex h-10 min-w-0 flex-1 items-center sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[color:var(--muted)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={suche}
            aria-label="Suchen"
            className="h-10 w-full rounded-full border border-[color:var(--border)] bg-white pl-9 pr-8 text-sm outline-none transition focus:border-[color:var(--brand)]"
          />
          {q ? (
            <button type="button" aria-label="Suche leeren" onClick={() => setQ("")} className="absolute right-2.5 text-[color:var(--muted)]">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </label>
        <button
          type="button"
          onClick={oeffnen}
          aria-haspopup="dialog"
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium",
            aktiv.length ? "border-[color:var(--brand)]/30 bg-[color:var(--brand-soft)] text-[color:var(--brand-dark,var(--brand))]" : "border-[color:var(--border)] bg-white",
          )}
          data-filter-knopf
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filter
          {aktiv.length ? <span className="rounded-full bg-[color:var(--brand)] px-1.5 text-xs font-semibold leading-5 text-white">{aktiv.length}</span> : null}
        </button>
        {children}
      </div>
      {aktiv.length ? (
        <div className="flex flex-wrap gap-1.5" data-aktive-filter>
          {aktiv.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => anwenden({ [f.key]: null })}
              className="inline-flex min-h-9 items-center gap-1 rounded-full border border-[color:var(--brand)]/30 bg-[color:var(--brand-soft)] px-3 text-sm"
              aria-label={`${f.label} entfernen`}
            >
              <span className="text-[color:var(--muted)]">{f.label}:</span> <span className="font-medium">{wertLabel(f, params.get(f.key)!)}</span>
              <X className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      ) : null}

      <Sheet
        open={offen}
        onClose={() => setOffen(false)}
        title="Filter"
        footer={
          <div className="flex gap-2 border-t border-[color:var(--border)] px-5 pb-5 pt-3">
            <Button
              size="md"
              className="flex-1"
              onClick={() => {
                setOffen(false);
                anwenden(Object.fromEntries(felder.map((f) => [f.key, null])));
              }}
            >
              Zurücksetzen
            </Button>
            <Button
              variant="primary"
              size="md"
              className="flex-1"
              onClick={() => {
                setOffen(false);
                anwenden(Object.fromEntries(felder.map((f) => [f.key, entwurf[f.key]?.trim() || null])));
              }}
            >
              Anzeigen
            </Button>
          </div>
        }
      >
        <div className="space-y-3 px-5 pb-2 pt-1">
          {felder.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">{f.label}</span>
              {"options" in f ? (
                <select className="input w-full" value={entwurf[f.key] ?? ""} onChange={(e) => setEntwurf((x) => ({ ...x, [f.key]: e.target.value }))}>
                  <option value="">Alle</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input w-full"
                  value={entwurf[f.key] ?? ""}
                  inputMode={f.text.inputMode}
                  placeholder={f.text.placeholder}
                  onChange={(e) => setEntwurf((x) => ({ ...x, [f.key]: e.target.value }))}
                />
              )}
            </label>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
