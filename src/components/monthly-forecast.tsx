import { ArrowDownRight, ArrowRight, ArrowUpRight, Target } from "lucide-react";
import type { Forecast } from "@/lib/forecast";
import { formatEUR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const monthFmt = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
});

function formatVal(value: number, fmt: "number" | "currency"): string {
  return fmt === "currency" ? formatEUR(value) : formatNumber(value);
}

function deltaInfo(projected: number, previous: number) {
  if (previous === 0 && projected === 0) {
    return { text: "±0", tone: "neutral" as const };
  }
  if (previous === 0) {
    return { text: "neu", tone: "neutral" as const };
  }
  const pct = (projected - previous) / previous;
  const sign = pct > 0 ? "+" : "";
  const text = `${sign}${(pct * 100).toFixed(0)} %`;
  const tone =
    Math.abs(pct) < 0.01
      ? ("neutral" as const)
      : pct > 0
        ? ("good" as const)
        : ("bad" as const);
  return { text, tone };
}

const TONE_CLASS = {
  good: "text-emerald-600",
  bad: "text-rose-600",
  neutral: "text-zinc-500",
};

export function MonthlyForecast({ forecast }: { forecast: Forecast }) {
  const progress = forecast.daysElapsed / forecast.daysTotal;
  const monthName = monthFmt.format(forecast.monthStart);

  return (
    <section className="rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
            Forecast
          </div>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            Hochrechnung {monthName}
          </h2>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--brand-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-dark)]">
          <Target className="h-3.5 w-3.5" />
          Tag {forecast.daysElapsed} / {forecast.daysTotal}
        </div>
      </header>

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full bg-[color:var(--brand)] transition-all"
          style={{ width: `${Math.min(100, progress * 100)}%` }}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
            <tr>
              <th className="pb-2 pr-2 text-left">Metrik</th>
              <th className="pb-2 px-1 text-right">MTD</th>
              <th className="pb-2 px-1 text-right">Hochrechnung</th>
              <th className="hidden pb-2 px-1 text-right sm:table-cell">
                {forecast.previousMonthLabel}
              </th>
              <th className="pb-2 pl-1 text-right">Δ vs. Vormonat</th>
            </tr>
          </thead>
          <tbody>
            {forecast.rows.map((row) => {
              const d = deltaInfo(row.projected, row.previousFull);
              const Icon =
                d.tone === "good"
                  ? ArrowUpRight
                  : d.tone === "bad"
                    ? ArrowDownRight
                    : ArrowRight;
              return (
                <tr
                  key={row.label}
                  className="border-t border-[color:var(--border)]"
                >
                  <td className="py-2 pr-2 font-medium">{row.label}</td>
                  <td className="py-2 px-1 text-right tabular-nums text-[color:var(--muted)]">
                    {formatVal(row.mtd, row.format)}
                  </td>
                  <td className="py-2 px-1 text-right font-bold tabular-nums text-[color:var(--foreground)]">
                    {formatVal(row.projected, row.format)}
                  </td>
                  <td className="hidden py-2 px-1 text-right tabular-nums text-[color:var(--muted)] sm:table-cell">
                    {formatVal(row.previousFull, row.format)}
                  </td>
                  <td
                    className={cn(
                      "py-2 pl-1 text-right text-xs tabular-nums",
                      TONE_CLASS[d.tone],
                    )}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      <Icon className="h-3 w-3" />
                      {d.text}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-[color:var(--muted)]">
        Lineare Hochrechnung: aktueller Tagesschnitt × Tage im Monat. Letzte
        Tage des Monats werden präziser, je mehr Daten reinkommen.
      </p>
    </section>
  );
}
