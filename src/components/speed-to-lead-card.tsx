import { Clock, TrendingUp } from "lucide-react";
import type { SpeedToLeadAnalysis } from "@/lib/speed-to-lead";
import { formatDuration, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SpeedToLeadCard({
  data,
}: {
  data: SpeedToLeadAnalysis;
}) {
  // Skala für die Balken: höchste Closing Rate aller Buckets = 100% Breite.
  const maxRate = Math.max(
    ...data.buckets.map((b) => b.closingRate ?? 0),
    0.001,
  );

  return (
    <section className="rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
            Speed-to-Lead
          </div>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            Wie schnell du reagierst — und was es kostet
          </h2>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--brand-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-dark)]">
          <Clock className="h-3.5 w-3.5" />
          Dein Ø: {formatDuration(data.avgHoursToFirstContact)}
        </div>
      </header>

      {!data.hasMeaningfulData ? (
        <p className="text-sm text-[color:var(--muted)]">
          Noch zu wenig Leads im Zeitraum für eine belastbare Analyse.
        </p>
      ) : (
        <>
          {data.bestBucket && data.worstBucket &&
          data.bestBucket.key !== data.worstBucket.key ? (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-emerald-50/60 p-3 text-sm text-emerald-900">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Bei <strong>{data.bestBucket.label}</strong> Reaktion closet du{" "}
                <strong>{formatPercent(data.bestBucket.closingRate)}</strong> —
                bei <strong>{data.worstBucket.label}</strong> nur{" "}
                <strong>{formatPercent(data.worstBucket.closingRate)}</strong>.{" "}
                {data.bestBucket.closingRate &&
                data.worstBucket.closingRate &&
                data.worstBucket.closingRate > 0 ? (
                  <>
                    Das sind{" "}
                    <strong>
                      {(
                        data.bestBucket.closingRate /
                        data.worstBucket.closingRate
                      ).toFixed(1)}
                      ×
                    </strong>{" "}
                    bessere Conversion.
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="space-y-2.5">
            {data.buckets.map((b, idx) => {
              const isAvg = idx === data.averageBucketIndex;
              const isBest = data.bestBucket?.key === b.key;
              const widthPct =
                b.closingRate != null
                  ? Math.max(2, (b.closingRate / maxRate) * 100)
                  : 0;
              return (
                <div
                  key={b.key}
                  className={cn(
                    "rounded-lg border px-3 py-2 transition",
                    isAvg
                      ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]/40"
                      : "border-[color:var(--border)]",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "font-medium",
                          isAvg
                            ? "text-[color:var(--brand-dark)]"
                            : "text-[color:var(--foreground)]",
                        )}
                      >
                        {b.label}
                      </span>
                      {isAvg ? (
                        <span className="rounded-full bg-[color:var(--brand)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                          dein Ø
                        </span>
                      ) : null}
                      {isBest && !isAvg ? (
                        <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                          best
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-baseline gap-3 text-xs">
                      <span className="tabular-nums text-[color:var(--muted)]">
                        {formatNumber(b.closed)} / {formatNumber(b.total)}
                      </span>
                      <span className="w-12 text-right font-semibold tabular-nums text-[color:var(--foreground)]">
                        {formatPercent(b.closingRate)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className={cn(
                        "h-full",
                        isBest
                          ? "bg-emerald-500"
                          : isAvg
                            ? "bg-[color:var(--brand)]"
                            : "bg-zinc-400",
                      )}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {data.notReached.total > 0 ? (
              <div className="rounded-lg border border-dashed border-[color:var(--border)] px-3 py-2 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-[color:var(--muted)]">
                    Nicht erreicht
                  </span>
                  <span className="text-xs tabular-nums text-[color:var(--muted)]">
                    {formatNumber(data.notReached.closed)} /{" "}
                    {formatNumber(data.notReached.total)}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
