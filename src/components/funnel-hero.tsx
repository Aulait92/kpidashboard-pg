import { ArrowRight } from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/format";
import type { Kpis } from "@/lib/kpis";
import { cn } from "@/lib/utils";

function Stage({
  label,
  count,
  hint,
  filledRatio,
  emphasis = false,
}: {
  label: string;
  count: number;
  hint?: string;
  filledRatio: number; // 0..1 für die Füllbreite vom Top-Wert
  emphasis?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, filledRatio));
  return (
    <div className="relative flex-1 min-w-0">
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border bg-[color:var(--brand-soft)]/30 px-5 py-4",
          emphasis
            ? "border-[color:var(--brand)]/40"
            : "border-[color:var(--border)]",
        )}
      >
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 bg-[color:var(--brand)]/15 transition-all"
          style={{ width: `${pct * 100}%` }}
        />
        <div className="relative">
          <div className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--muted)]">
            {label}
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-[color:var(--foreground)] sm:text-3xl">
            {formatNumber(count)}
          </div>
          {hint ? (
            <div className="mt-0.5 text-[11px] text-[color:var(--muted)]">
              {hint}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Connector({ rate }: { rate: number | null }) {
  return (
    <div className="hidden flex-col items-center justify-center px-2 sm:flex">
      <ArrowRight className="h-4 w-4 text-[color:var(--muted)]" />
      <div className="mt-0.5 text-[11px] font-semibold tabular-nums text-[color:var(--brand-dark)]">
        {formatPercent(rate)}
      </div>
    </div>
  );
}

export function FunnelHero({ kpis }: { kpis: Kpis }) {
  const max = kpis.totalLeads;
  const ratio = (n: number) => (max > 0 ? n / max : 0);

  return (
    <section className="rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
            Funnel · Lead → Abschluss
          </div>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            Wie performt dein Funnel
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 sm:text-right">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
              Closing Rate
            </div>
            <div className="text-lg font-bold tabular-nums sm:text-xl">
              {formatPercent(kpis.closingRate)}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
              Throughput
            </div>
            <div className="text-lg font-bold tabular-nums sm:text-xl">
              {formatNumber(kpis.closedLeads)} / {formatNumber(kpis.totalLeads)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
        <Stage
          label="Leads"
          count={kpis.totalLeads}
          hint="Gesamt eingegangen"
          filledRatio={1}
        />
        <Connector rate={kpis.reachabilityRate} />
        <Stage
          label="Erreicht"
          count={kpis.reachedLeads}
          hint={`${formatPercent(kpis.reachabilityRate)} Erreichbarkeit`}
          filledRatio={ratio(kpis.reachedLeads)}
        />
        <Connector rate={kpis.terminRate} />
        <Stage
          label="Termin"
          count={kpis.terminLeads}
          hint={`${formatPercent(kpis.terminRate)} aus Erreicht`}
          filledRatio={ratio(kpis.terminLeads)}
        />
        <Connector rate={kpis.closingFromTerminRate} />
        <Stage
          label="Abschluss"
          count={kpis.closedLeads}
          hint={`${formatPercent(kpis.closingRate)} Closing`}
          filledRatio={ratio(kpis.closedLeads)}
          emphasis
        />
      </div>
    </section>
  );
}
