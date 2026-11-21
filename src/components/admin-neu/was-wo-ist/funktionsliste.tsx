"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

// Was wo ist: durchsuchbare Liste aller Funktionen aus dem Inventar (docs/ux/admin-neu/funktionsinventar.json).
// Je Zeile: Funktion und Ort im Admin mit Link (der alte Ort bleibt suchbar, wird seit 20.11.2026 nicht mehr angezeigt). Suche über alle Felder, Filter „noch alt“ nur, solange
// es offene Funktionen gibt. Umbau 20.11.2026: 25 Zeilen, dann „Mehr laden“ (vorher alle 451 auf einmal, am Handy 56.000 px).

const SCHRITT = 25;

export type FunktionZeile = {
  id: string;
  funktion: string;
  heute: string;
  neu: string;
  href: string;
  /** Seite des Links, wenn sie nicht genau die Seite der Funktion ist (Detailseiten: „im Kontakt“ usw.) */
  ueber: string | null;
  status: "vorhanden" | "offen" | "bleibt" | "entfernt";
};

const STATUS = {
  vorhanden: { label: "neu da", tone: "success" },
  offen: { label: "noch alt", tone: "warning" },
  bleibt: { label: "ohne Oberfläche", tone: "neutral" },
  entfernt: { label: "entfällt", tone: "neutral" },
} as const;

const norm = (s: string) => s.toLowerCase().replace(/[›→]/g, " ");

export function Funktionsliste({ zeilen }: { zeilen: FunktionZeile[] }) {
  const [q, setQ] = useState("");
  const [nurOffen, setNurOffen] = useState(false);
  const [anzahl, setAnzahl] = useState(SCHRITT);
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
            onChange={(e) => {
              setQ(e.target.value);
              setAnzahl(SCHRITT);
            }}
            placeholder="Funktion oder frühere Seite"
            aria-label="Funktionen suchen"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        {offen || nurOffen ? (
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
        ) : null}
        {suche.trim() ? (
          <span className="w-full text-xs text-[color:var(--muted)] sm:w-auto" aria-live="polite">
            {treffer.length} Treffer
          </span>
        ) : null}
      </div>
      {treffer.length ? (
        <ul className="divide-y divide-[color:var(--border)]">
          {treffer.slice(0, anzahl).map((z) => (
            <li key={z.id}>
              <Link href={z.href} className="block px-4 py-3 transition hover:bg-[color:var(--surface-sunken)] sm:px-5">
                <div className="flex items-start gap-3">
                  <span className="min-w-0 flex-1 text-sm font-medium">{z.funktion}</span>
                  {/* Seit der Umstellung ist fast alles da: Kennzeichen nur noch für die Ausnahmen */}
                  {z.status === "vorhanden" ? null : <Badge tone={STATUS[z.status].tone}>{STATUS[z.status].label}</Badge>}
                </div>
                <div className="mt-0.5 min-w-0 break-words text-sm text-[color:var(--brand)]">
                  {z.neu}
                  {z.ueber ? <span className="text-[color:var(--muted)]"> ({z.ueber})</span> : null}
                </div>
              </Link>
            </li>
          ))}
          {treffer.length > anzahl ? (
            <li className="p-3 sm:px-5">
              <Button className="w-full" onClick={() => setAnzahl((n) => n + SCHRITT)}>
                Mehr laden ({treffer.length - anzahl} weitere)
              </Button>
            </li>
          ) : null}
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
