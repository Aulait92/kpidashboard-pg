// Kennzahl „Leads mit nächstem Schritt“ (Ole, 14.11.2026) auf /buyer/zahlen: Ziel 100 %. Stand jetzt, nicht
// je Zeitraum (ein nächster Schritt gilt für heute). Definition: lib/lead-next-step.ts.
// 16.11.2026: als eine Zeile statt einer einzelnen Kachel in einem Drei-Spalten-Raster (Lücke daneben).

import Link from "next/link";
import { ListChecks } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { NEXT_STEP_WARN_BELOW } from "@/lib/lead-next-step";
import { nextStepRate } from "@/lib/lead-next-step-server";
import { cn } from "@/lib/utils";

export async function NextStepKpi({ customerId, href = "/buyer/kontakte?ansicht=ohne-schritt" }: { customerId: string; href?: string }) {
  const r = await nextStepRate(customerId);
  if (r.open === 0) return null;
  const pct = r.rate == null ? null : Math.round(r.rate * 100);
  const farbe = r.rate == null ? "text-[color:var(--muted)]" : r.rate >= 0.95 ? "text-emerald-600" : r.rate < NEXT_STEP_WARN_BELOW ? "text-rose-600" : "text-[color:var(--foreground)]";
  return (
    <section
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm shadow-[var(--shadow-sm)]"
      data-next-step-kpi
    >
      <ListChecks className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
      <span className="font-semibold">Arbeitsweise</span>
      <span className={cn("text-lg font-semibold tabular-nums", farbe)}>{pct == null ? "keine Angabe" : `${pct} %`}</span>
      <span className="text-[color:var(--muted)]">
        der offenen Leads mit nächstem Schritt ({formatNumber(r.withNextStep)} von {formatNumber(r.open)}, Ziel 100 %)
      </span>
      {r.withoutNextStep > 0 ? (
        <Link href={href} className="inline-flex min-h-10 items-center font-semibold text-[color:var(--brand)] hover:underline sm:min-h-0">
          {formatNumber(r.withoutNextStep)} ohne nächsten Schritt ansehen
          {r.resultMissing > 0 ? `, davon ${formatNumber(r.resultMissing)} mit fehlendem Termin-Ergebnis` : ""}
        </Link>
      ) : null}
    </section>
  );
}
