import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type Chip = { label: string; href: string; anzahl: number; aktiv: boolean; /** auch bei 0 zeigen */ immer?: boolean };

const CHIP = "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition";
const AN = "border-[color:var(--foreground)] bg-[color:var(--foreground)] text-white";
const AUS = "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:text-[color:var(--foreground)]";

// Filter-Chips mit Anzahl, gleiches Aussehen wie auf Heute (components/admin/heute-bausteine.tsx: HeuteFilterChips).
// Chips ohne Treffer fallen weg (außer aktiv oder „immer“). Am Handy waagrecht wischbar.
// `mehr`: seltene Filter hinter „Mehr“ (Umbau 20.11.2026: höchstens 5 Chips sichtbar, Rest aufklappbar). Ist ein seltener
// Filter gewählt, trägt der Mehr-Chip seinen Namen.
export function Chips({ eintraege, mehr = [], label = "Filter" }: { eintraege: Chip[]; mehr?: Chip[]; label?: string }) {
  const mehrSichtbar = mehr.filter((c) => c.anzahl || c.aktiv);
  const mehrAktiv = mehrSichtbar.find((c) => c.aktiv);
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="group" aria-label={label}>
      {eintraege
        .filter((c) => c.anzahl || c.aktiv || c.immer)
        .map((c) => (
          <Link key={c.href} href={c.href} aria-current={c.aktiv ? "true" : undefined} className={cn(CHIP, c.aktiv ? AN : AUS)}>
            {c.label}
            <span className={cn("text-xs", c.aktiv ? "text-white/70" : "")}>{c.anzahl}</span>
          </Link>
        ))}
      {mehrSichtbar.length ? (
        // key: nach einer Auswahl neu aufbauen, damit die Liste wieder zu ist
        <details key={mehrAktiv?.href ?? "zu"} className="group shrink-0 sm:relative">
          <summary className={cn(CHIP, "cursor-pointer list-none [&::-webkit-details-marker]:hidden", mehrAktiv ? AN : AUS)}>
            {mehrAktiv ? mehrAktiv.label : "Mehr"}
            {mehrAktiv ? <span className="text-xs text-white/70">{mehrAktiv.anzahl}</span> : null}
            <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
          </summary>
          {/* Am Handy fest unter der Chip-Reihe (die Reihe scrollt waagrecht und würde die Liste abschneiden) */}
          <div className="fixed left-4 right-4 z-30 mt-1 overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white py-1 shadow-[var(--shadow-lg)] sm:absolute sm:left-0 sm:right-auto sm:min-w-[13rem]">
            {mehrSichtbar.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                aria-current={c.aktiv ? "true" : undefined}
                className={cn("flex min-h-11 items-center justify-between gap-4 px-4 text-sm hover:bg-[color:var(--surface-sunken)]", c.aktiv && "font-semibold")}
              >
                {c.label}
                <span className="text-xs text-[color:var(--muted)]">{c.anzahl}</span>
              </Link>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
