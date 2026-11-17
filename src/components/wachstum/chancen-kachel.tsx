"use client";

// Kachel „Offene Chancen“ auf Wachstum (Ole, 18.11.2026): Antippen öffnet die Liste der Chancen, sortiert nach erwartetem
// Wert, mit dem nächsten Schritt je Kontakt (Sheet wie bei anderen Listen). Rechnung: lib/offene-chancen.ts.

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { KACHEL, KennzahlInhalt } from "@/components/wachstum/kennzahl";
import { STUFE_LABEL, type ChanceStufe } from "@/lib/offene-chancen";

export type ChanceZeile = { leadId: string; name: string; stufe: ChanceStufe; provision: number; erwartet: number; naechsterSchritt: string };

const eur = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const euro = (n: number) => `${eur.format(Math.round(n))} €`;
const pct = (n: number) => `${Math.round(n * 100)} %`;

export function ChancenKachel({
  anzahl,
  unter,
  schaetzung,
  liste,
  quoten,
}: {
  anzahl: number;
  unter: { aufteilung: string; realistisch: string };
  schaetzung: boolean;
  liste: ChanceZeile[];
  quoten: { angebot: number; termin: number; angebotEigen: boolean; terminEigen: boolean };
}) {
  const [offen, setOffen] = useState(false);
  if (anzahl === 0) {
    return (
      <div className={KACHEL} data-kennzahl="chancen">
        <KennzahlInhalt label="Offene Chancen" wert="0" unter="Gerade nichts offen" ton="normal" />
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOffen(true)}
        className={`${KACHEL} group text-left transition hover:border-[color:var(--brand)]/40 hover:shadow-[var(--shadow-lg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]`}
        aria-haspopup="dialog"
        data-kennzahl="chancen"
      >
        <KennzahlInhalt
          label="Offene Chancen"
          wert={String(anzahl)}
          ton="chance"
          ecke={<ChevronRight className="h-5 w-5 shrink-0 text-[color:var(--brand)] transition group-hover:translate-x-0.5" aria-hidden />}
          unter={
            <>
              <span className="block font-semibold text-[color:var(--foreground)]">{unter.realistisch}</span>
              {/* Aufschlüsselung erst ab Tablet; auf dem Handy höchstens drei Zeilen (Ole, 18.11.2026) */}
              <span className="hidden sm:block">{unter.aufteilung}</span>
            </>
          }
        />
      </button>
      <Sheet open={offen} onClose={() => setOffen(false)} title={`Offene Chancen (${anzahl})`} message="Sortiert nach erwarteter Provision">
        <ul className="divide-y divide-[color:var(--border)]" data-chancen-liste>
          {liste.map((c) => (
            <li key={c.leadId}>
              <Link href={`/buyer/kontakte/${c.leadId}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[color:var(--surface-sunken)]">
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[15px] font-semibold">{c.name}</span>
                    <span className="shrink-0 text-xs font-medium text-[color:var(--muted)]">{STUFE_LABEL[c.stufe]}</span>
                  </span>
                  <span className="mt-0.5 block text-[15px] text-[color:var(--brand)]">{c.naechsterSchritt}</span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="block text-[15px] font-semibold">≈ {euro(c.erwartet)}</span>
                  <span className="block text-xs text-[color:var(--muted)]">von {euro(c.provision)}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        <p className="border-t border-[color:var(--border)] px-5 py-3 text-xs leading-relaxed text-[color:var(--muted)]">
          Erwartet = Provision bei Abschluss × Ihre Quote (Angebot {pct(quoten.angebot)}, Termin {pct(quoten.termin)}).
          {schaetzung ? " Schätzung mit Standardquote, bis 10 eigene Fälle je Stufe da sind." : ""}
        </p>
      </Sheet>
    </>
  );
}
