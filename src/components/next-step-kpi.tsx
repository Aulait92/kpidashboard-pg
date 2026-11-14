// Kennzahl „Leads mit nächstem Schritt“ (Ole, 14.11.2026) auf /buyer/zahlen: Ziel 100 %. Stand jetzt, nicht
// je Zeitraum (ein nächster Schritt gilt für heute). Definition: lib/lead-next-step.ts.

import Link from "next/link";
import { ListChecks } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { formatNumber } from "@/lib/format";
import { NEXT_STEP_WARN_BELOW } from "@/lib/lead-next-step";
import { nextStepRate } from "@/lib/lead-next-step-server";

export async function NextStepKpi({ customerId, href = "/buyer/kontakte?ansicht=ohne-schritt" }: { customerId: string; href?: string }) {
  const r = await nextStepRate(customerId);
  if (r.open === 0) return null;
  const pct = r.rate == null ? null : Math.round(r.rate * 100);
  return (
    <section data-next-step-kpi>
      <h2 className="mb-3 flex items-center gap-1.5 text-[15px] font-semibold tracking-tight">
        <ListChecks className="h-4 w-4 text-[color:var(--muted)]" /> Arbeitsweise
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Leads mit nächstem Schritt"
          value={pct == null ? "keine Angabe" : `${pct} %`}
          tone={r.rate == null ? "neutral" : r.rate >= 0.95 ? "positive" : r.rate < NEXT_STEP_WARN_BELOW ? "negative" : "default"}
          hint={
            <>
              Ziel 100 %: {formatNumber(r.withNextStep)} von {formatNumber(r.open)} offenen Leads haben einen Termin, eine Wiedervorlage oder ein laufendes Gespräch.
              {r.withoutNextStep > 0 ? (
                <Link href={href} className="mt-1 block font-semibold text-[color:var(--brand)] hover:underline">
                  {formatNumber(r.withoutNextStep)} ohne nächsten Schritt ansehen
                  {r.resultMissing > 0 ? `, davon ${formatNumber(r.resultMissing)} mit fehlendem Termin-Ergebnis` : ""}
                </Link>
              ) : null}
            </>
          }
        />
      </div>
    </section>
  );
}
