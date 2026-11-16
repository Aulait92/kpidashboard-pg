"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

// Was wo ist: durchsuchbare Liste aller Funktionen aus dem Inventar (docs/ux/admin-neu/funktionsinventar.json).
// Je Zeile: Funktion, heutiger Ort, neuer Ort mit Link. Suche über alle Felder, Filter „noch offen“.

export type FunktionZeile = {
  id: string;
  funktion: string;
  heute: string;
  neu: string;
  href: string;
  /** Seite des Links, wenn sie nicht genau die Seite der Funktion ist (Detailseiten: „im Kontakt“ usw.) */
  ueber: string | null;
  status: "vorhanden" | "offen" | "bleibt";
};

const STATUS = {
  vorhanden: { label: "neu da", tone: "success" },
  offen: { label: "noch alt", tone: "warning" },
  bleibt: { label: "ohne Oberfläche", tone: "neutral" },
} as const;

const norm = (s: string) => s.toLowerCase().replace(/[›→]/g, " ");

export function Funktionsliste({ zeilen }: { zeilen: FunktionZeile[] }) {
  const [q, setQ] = useState("");
  const [nurOffen, setNurOffen] = useState(false);
  const suche = useDeferredValue(q);
  const index = useMemo(() => zeilen.map((z) => norm(`${z.funktion} ${z.heute} ${z.neu} ${z.ueber ?? ""}`)), [zeilen]);
  const treffer = useMemo(() => {
    const woerter = norm(suche).split(/\s+/).filter(Boolean);
    return zeilen.filter((z, i) => (!nurOffen || z.status === "offen") && woerter.every((w) => index[i].includes(w)));
  }, [zeilen, index, suche, nurOffen]);
  const offen = zeilen.filter((z) => z.status === "offen").length;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--border)] px-4 py-3 sm:px-5">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 focus-within:border-[color:var(--brand)]">
          <Search className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Funktion, alte Seite oder neuer Ort"
            aria-label="Funktionen suchen"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <button
          type="button"
          aria-pressed={nurOffen}
          onClick={() => setNurOffen((v) => !v)}
          className={cn(
            "h-10 shrink-0 rounded-full border px-3 text-sm font-medium",
            nurOffen ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] text-[color:var(--brand)]" : "border-[color:var(--border)] text-[color:var(--muted)]",
          )}
        >
          Noch alt ({offen})
        </button>
        <span className="w-full text-xs text-[color:var(--muted)] sm:w-auto" aria-live="polite">
          {treffer.length} von {zeilen.length}
        </span>
      </div>
      {treffer.length ? (
        <ul className="divide-y divide-[color:var(--border)]">
          {treffer.map((z) => (
            <li key={z.id}>
              <Link href={z.href} className="block px-4 py-3 transition hover:bg-[color:var(--surface-sunken)] sm:px-5">
                <div className="flex items-start gap-3">
                  <span className="min-w-0 flex-1 text-sm font-medium">{z.funktion}</span>
                  <Badge tone={STATUS[z.status].tone}>{STATUS[z.status].label}</Badge>
                </div>
                <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2">
                  <span className="min-w-0 break-words text-[color:var(--muted)]">
                    <span className="text-xs uppercase tracking-wide">Heute </span>
                    {z.heute}
                  </span>
                  <span className="min-w-0 break-words text-[color:var(--brand)]">
                    <span className="text-xs uppercase tracking-wide text-[color:var(--muted)]">Neu </span>
                    {z.neu}
                    {z.ueber ? <span className="text-[color:var(--muted)]"> ({z.ueber})</span> : null}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={SearchX}
          title="Nichts gefunden"
          text="Anderes Wort versuchen, z. B. den Namen der heutigen Seite."
          action={
            <Button
              onClick={() => {
                setQ("");
                setNurOffen(false);
              }}
            >
              Suche leeren
            </Button>
          }
        />
      )}
    </Card>
  );
}
