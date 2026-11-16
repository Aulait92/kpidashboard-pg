"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarPlus, ChevronRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import type { SearchHit } from "@/app/api/admin/search/route";
import { kontaktPfad } from "./listen";

// „Termin buchen“ ohne Kontakt (Vertrieb → Termine, „+ Neu → Termin“): erst den Kontakt suchen, dann öffnet sich
// die Kontaktakte mit dem bestehenden Fenster „Termin buchen“ (components/termin/admin-termin.tsx, ?termin=…).

export function TerminBuchen({ offen: start = false }: { offen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(start);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [laedt, setLaedt] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLaedt(true);
      try {
        const r = await fetch(`/api/admin/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        const data = (await r.json()) as { hits?: SearchHit[] };
        setHits((data.hits ?? []).filter((h) => h.kind === "kontakt"));
      } catch {
        /* abgebrochen oder offline */
      } finally {
        setLaedt(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const zeige = q.trim().length >= 2 ? hits : [];
  return (
    <>
      <Button variant="primary" size="md" icon={CalendarPlus} onClick={() => setOpen(true)} data-termin-buchen>
        Termin buchen
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Termin buchen" message="Für welchen Kontakt?">
        <div className="p-5 pb-3">
          <label className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[color:var(--muted)]" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Agentur, Name, E-Mail oder Ort"
              aria-label="Kontakt suchen"
              className="input pl-9"
            />
            {laedt ? <Loader2 className="absolute right-3 h-4 w-4 animate-spin text-[color:var(--muted)]" /> : null}
          </label>
        </div>
        <ul className="max-h-[50vh] divide-y divide-[color:var(--border)] overflow-y-auto border-t border-[color:var(--border)]">
          {zeige.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(`${kontaktPfad(h.id)}?termin=${Date.now()}`);
                }}
                className="flex min-h-12 w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-[color:var(--surface-sunken)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{h.title}</span>
                  <span className="block truncate text-xs text-[color:var(--muted)]">{h.subtitle}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
              </button>
            </li>
          ))}
          {q.trim().length >= 2 && !laedt && !zeige.length ? <li className="px-5 py-4 text-sm text-[color:var(--muted)]">Kein Kontakt gefunden.</li> : null}
          {q.trim().length < 2 ? <li className="px-5 py-4 text-sm text-[color:var(--muted)]">Mindestens zwei Buchstaben eingeben.</li> : null}
        </ul>
      </Sheet>
    </>
  );
}
