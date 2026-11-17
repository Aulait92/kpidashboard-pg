// „Vom Lead zum Kunden“ auf Wachstum (Ole, 18.11.2026): Leads → erreicht → Termine → Kunden, je Schritt eine Quote zum
// vorherigen. Am Rechner nebeneinander, auf dem Handy untereinander. Nur bezahlte Leads (lib/kpis, origin "paid").

import Link from "next/link";
import { ArrowDown, ArrowRight, Inbox } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { DetailsLink } from "@/components/wachstum/details-link";
import type { Kpis } from "@/lib/kpis";
import { cn } from "@/lib/utils";

const zahl = new Intl.NumberFormat("de-DE");
const pct = (r: number | null) => (r == null || !Number.isFinite(r) ? "" : `${Math.round(r * 100)} %`);

function Stufe({ n, label, kunden = false }: { n: number; label: string; kunden?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-1 items-baseline gap-3 rounded-[var(--radius-md)] px-4 py-3 sm:flex-col sm:items-center sm:gap-0 sm:py-4 sm:text-center",
        kunden ? "bg-emerald-50 ring-1 ring-inset ring-emerald-100" : "bg-[color:var(--background)] ring-1 ring-inset ring-[color:var(--border)]",
      )}
    >
      <span className={cn("min-w-[3ch] text-[28px] font-bold leading-tight tracking-tight tabular-nums sm:text-[38px]", kunden ? "text-emerald-700" : "")}>{zahl.format(n)}</span>
      <span className="text-[15px] text-[color:var(--muted)]">{label}</span>
    </div>
  );
}

function Pfeil({ rate }: { rate: number | null }) {
  return (
    <div className="flex items-center gap-2 py-1 pl-6 sm:w-16 sm:shrink-0 sm:flex-col sm:justify-center sm:gap-0 sm:py-0 sm:pl-0">
      <ArrowDown className="h-4 w-4 text-[color:var(--muted)] sm:hidden" aria-hidden />
      <ArrowRight className="hidden h-4 w-4 text-[color:var(--muted)] sm:block" aria-hidden />
      <span className="text-[15px] font-semibold tabular-nums text-[color:var(--brand)]">{pct(rate)}</span>
    </div>
  );
}

export function Trichter({
  kpis: k,
  verloren,
  zusatz,
  alleHref,
}: {
  kpis: Kpis;
  /** Verlorene Leads im Zeitraum mit häufigstem Grund (Details öffnen „Warum Leads verloren gehen“). */
  verloren: { anzahl: number; grund: string | null } | null;
  /** z. B. „+ 1 Abschluss aus Empfehlungen“ (nicht im Trichter, der nur bezahlte Leads zählt). */
  zusatz: string[];
  /** Link für den leeren Zustand (größerer Zeitraum). */
  alleHref: string;
}) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-7" aria-labelledby="trichter" data-trichter>
      <h2 id="trichter" className="text-lg font-semibold tracking-tight sm:text-xl">
        Vom Lead zum Kunden
      </h2>
      {k.nettoLeads === 0 ? (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-[var(--radius-md)] bg-[color:var(--background)] p-4 ring-1 ring-inset ring-[color:var(--border)]" data-trichter-leer>
          <span className="flex items-center gap-2 text-[15px]">
            <Inbox className="h-4 w-4 text-[color:var(--muted)]" aria-hidden />
            In diesem Zeitraum sind keine Leads eingegangen.
          </span>
          <Link href={alleHref} className={buttonClass("secondary", "md")}>
            Gesamten Zeitraum ansehen
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-col sm:flex-row sm:items-stretch">
            <Stufe n={k.nettoLeads} label="Leads" />
            <Pfeil rate={k.reachabilityRate} />
            <Stufe n={k.reachedLeads} label="erreicht" />
            <Pfeil rate={k.terminRate} />
            <Stufe n={k.terminLeads} label={k.terminLeads === 1 ? "Termin" : "Termine"} />
            <Pfeil rate={k.closingFromTerminRate} />
            <Stufe n={k.closedLeads} label={k.closedLeads === 1 ? "Kunde" : "Kunden"} kunden />
          </div>
          {verloren && verloren.anzahl > 0 ? (
            <p className="mt-4 text-[15px] text-[color:var(--muted)]" data-trichter-verloren>
              Verloren: {zahl.format(verloren.anzahl)} {verloren.anzahl === 1 ? "Lead" : "Leads"}
              {verloren.grund ? `, meist „${verloren.grund}“` : ""} · <DetailsLink ziel="verlust">Details</DetailsLink>
            </p>
          ) : null}
          {zusatz.length ? <p className="mt-1 text-[15px] font-medium">{zusatz.join(" · ")}</p> : null}
        </>
      )}
    </section>
  );
}
