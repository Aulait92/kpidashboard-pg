"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { InfoHinweis } from "@/components/info-hinweis";
import { cn } from "@/lib/utils";

// Seitenmuster Admin v2 (Paket A2): höchstens 5 Kennzahlen je Seite, Aussehen wie die Kennzahlen der Demo (kpis,
// bisher components/admin-neu/leads/ansichten.tsx). Antippen öffnet die Details im Fenster (components/ui/sheet.tsx:
// am Handy von unten, am Rechner mittig), statt die Seite mit weiteren Zahlen zu füllen; ohne Details führt `href` weiter.

export type KennzahlDetail = { label: string; wert: string; href?: string };
export type Kennzahl = {
  label: string;
  wert: string;
  /** Eine kurze Zeile unter dem Wert, z. B. Vergleich */
  hinweis?: string;
  ton?: "gut" | "schlecht";
  /** Ohne Details: Link (z. B. Anker auf der Seite) */
  href?: string;
  /** Fachbegriff in einem Satz (kleines „i“ oben rechts, components/info-hinweis.tsx) */
  info?: { begriff: string; text: string };
  /** Inhalt des Fensters: Aufschlüsselung, ein Satz Erklärung, ein Link weiter */
  details?: { zeilen?: KennzahlDetail[]; text?: string; link?: { href: string; label: string } };
};

export const MAX_KENNZAHLEN = 5;

const GRID: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-3 lg:grid-cols-5" };

export function Kennzahlen({ werte }: { werte: Kennzahl[] }) {
  const liste = werte.slice(0, MAX_KENNZAHLEN);
  const [offen, setOffen] = useState<number | null>(null);
  const k = offen == null ? null : liste[offen];
  return (
    <>
      <section aria-label="Kennzahlen" className={cn("mb-4 grid grid-cols-2 gap-2 sm:gap-3", GRID[liste.length])}>
        {liste.map((z, i) => {
          const inhalt = (
            <>
              <span className="block text-xs text-[color:var(--muted)]">{z.label}</span>
              <span className={cn("mt-0.5 block text-xl font-semibold tabular-nums", z.ton === "schlecht" ? "text-rose-700" : z.ton === "gut" ? "text-emerald-700" : "")}>{z.wert}</span>
              {z.hinweis ? <span className="mt-0.5 block truncate text-xs text-[color:var(--muted)]">{z.hinweis}</span> : null}
            </>
          );
          const klasse = "block h-full w-full rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-left shadow-[var(--shadow-sm)]";
          const kachel = z.details ? (
            <button key={z.label} type="button" onClick={() => setOffen(i)} aria-haspopup="dialog" className={cn(klasse, "transition hover:border-[color:var(--border-strong)]")}>
              {inhalt}
            </button>
          ) : z.href ? (
            <Link key={z.label} href={z.href} className={cn(klasse, "hover:border-[color:var(--border-strong)]")}>
              {inhalt}
            </Link>
          ) : (
            <div key={z.label} className={klasse}>
              {inhalt}
            </div>
          );
          // „i“ neben der Kachel statt darin (kein Knopf im Knopf)
          return z.info ? (
            <div key={z.label} className="relative">
              {kachel}
              <InfoHinweis begriff={z.info.begriff} text={z.info.text} className="absolute right-2.5 top-2.5" />
            </div>
          ) : (
            kachel
          );
        })}
      </section>
      <Sheet open={!!k} onClose={() => setOffen(null)} title={k ? `${k.label}: ${k.wert}` : undefined} message={k?.details?.text}>
        {k?.details?.zeilen?.length ? (
          <ul className="divide-y divide-[color:var(--border)]">
            {k.details.zeilen.map((d) => {
              const zeile = (
                <>
                  <span className="min-w-0 flex-1 truncate">{d.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{d.wert}</span>
                  {d.href ? <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" /> : null}
                </>
              );
              return (
                <li key={d.label}>
                  {d.href ? (
                    <Link href={d.href} onClick={() => setOffen(null)} className="flex min-h-12 items-center gap-3 px-5 text-[15px] hover:bg-[color:var(--surface-sunken)]">
                      {zeile}
                    </Link>
                  ) : (
                    <div className="flex min-h-12 items-center gap-3 px-5 text-[15px]">{zeile}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
        {k?.details?.link ? (
          <div className="p-4">
            <Link href={k.details.link.href} onClick={() => setOffen(null)} className="flex min-h-11 items-center justify-center gap-1 rounded-[var(--radius-md)] bg-[color:var(--brand)] text-sm font-semibold text-white">
              {k.details.link.label}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
