"use client";

// „Heute“: eine dezente Zeile „Morgen: 3 automatische Nachrichten“ (Paket P6, Ole 17.11.2026). Antippen klappt
// die Kontakte auf, je Kontakt ein Link auf „Nächste Nachrichten“ (#nachfassen). Bei nur einem Kontakt direkt dorthin.

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Send } from "lucide-react";
import type { AutomatischeNachrichten } from "@/lib/nachrichtenplan-server";
import { morgenText } from "@/lib/morgen-text";

const uhr = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function MorgenAutomatisch({ daten, href }: { daten: AutomatischeNachrichten; href: (leadId: string) => string }) {
  const [offen, setOffen] = useState(false);
  if (!daten.anzahl) return null;
  const ziel = (id: string) => `${href(id)}#nachfassen`;
  const einer = daten.leads.length === 1 ? daten.leads[0] : null;
  const zeile = (
    <>
      <Send className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
      <span className="min-w-0 flex-1">{morgenText(daten.anzahl)}</span>
      {/* Am Handy eine Zeile: zu „Ansehen“, offen nur der Pfeil */}
      {offen ? (
        <ChevronRight className="h-4 w-4 shrink-0 rotate-90 text-[color:var(--border-strong)] transition" />
      ) : (
        <span className="shrink-0 font-semibold text-[color:var(--brand)]">Ansehen</span>
      )}
    </>
  );
  const cls = "flex min-h-11 w-full items-center gap-2 px-1 text-left text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)]";
  return (
    <div data-morgen-automatisch={daten.anzahl}>
      {einer ? (
        <Link href={ziel(einer.leadId)} className={cls}>
          {zeile}
        </Link>
      ) : (
        <button type="button" onClick={() => setOffen((o) => !o)} className={cls} aria-expanded={offen}>
          {zeile}
        </button>
      )}
      {offen && !einer ? (
        <ul className="mb-1 ml-7 divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white" data-morgen-liste>
          {daten.leads.map((l) => (
            <li key={l.leadId}>
              <Link href={ziel(l.leadId)} className="flex min-h-11 items-center gap-2 px-3 text-sm hover:bg-[color:var(--surface-sunken)]">
                <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
                <span className="shrink-0 text-xs text-[color:var(--muted)]">
                  {l.anzahl === 1 ? "1 Nachricht" : `${l.anzahl} Nachrichten`}, ab {uhr(l.erste)}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
