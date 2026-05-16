import type { PnL, PnLRow } from "@/lib/kpis";
import { formatDate, formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

const ppFmt = new Intl.NumberFormat("de-DE", {
  signDisplay: "exceptZero",
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

function fmtAbsoluteDelta(current: number, previous: number): string {
  const diff = current - previous;
  if (diff === 0) return "±0";
  const sign = diff > 0 ? "+" : "−";
  return `${sign}${formatEUR(Math.abs(diff))}`;
}

function fmtPpDelta(
  current: number | null,
  previous: number | null,
): string | null {
  if (current == null || previous == null) return null;
  const diff = (current - previous) * 100;
  if (Math.abs(diff) < 0.05) return "±0 pp";
  return `${ppFmt.format(diff)} pp`;
}

function deltaTone(
  current: number | null | undefined,
  previous: number | null | undefined,
  lowerIsBetter = false,
): "good" | "bad" | "neutral" {
  if (current == null || previous == null) return "neutral";
  const diff = current - previous;
  if (diff === 0) return "neutral";
  if (lowerIsBetter) return diff < 0 ? "good" : "bad";
  return diff > 0 ? "good" : "bad";
}

const TONE_CLASS = {
  good: "text-emerald-600",
  bad: "text-rose-600",
  neutral: "text-zinc-500",
};

function PercentCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-zinc-400">–</span>;
  return <>{(value * 100).toFixed(1).replace(".", ",")} %</>;
}

function LineRow({
  row,
  lowerIsBetter,
  emphasized = false,
}: {
  row: PnLRow;
  lowerIsBetter?: boolean;
  emphasized?: boolean;
}) {
  const tone = deltaTone(row.current, row.previous, lowerIsBetter);
  return (
    <tr className="text-sm">
      <td
        className={cn(
          "py-1.5 pl-3 pr-2 sm:pl-6",
          emphasized
            ? "font-semibold text-[color:var(--foreground)]"
            : "text-[color:var(--foreground)]",
        )}
      >
        {row.label}
      </td>
      <td
        className={cn(
          "whitespace-nowrap py-1.5 px-1 text-right tabular-nums sm:px-2",
          emphasized && "font-semibold",
        )}
      >
        {formatEUR(row.current)}
      </td>
      <td className="hidden whitespace-nowrap py-1.5 px-2 text-right tabular-nums text-[color:var(--muted)] sm:table-cell">
        {formatEUR(row.previous)}
      </td>
      <td
        className={cn(
          "whitespace-nowrap py-1.5 pl-1 pr-1 text-right text-[10px] tabular-nums sm:pl-2 sm:text-xs",
          TONE_CLASS[tone],
        )}
      >
        {fmtAbsoluteDelta(row.current, row.previous)}
      </td>
    </tr>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td
        colSpan={4}
        className="pb-1 pt-5 pl-3 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--brand)] sm:pl-6"
      >
        {children}
      </td>
    </tr>
  );
}

function SubtotalRow({
  label,
  current,
  previous,
  lowerIsBetter,
}: {
  label: string;
  current: number;
  previous: number;
  lowerIsBetter?: boolean;
}) {
  const tone = deltaTone(current, previous, lowerIsBetter);
  return (
    <tr className="border-t border-[color:var(--border)] text-sm">
      <td className="py-1.5 pl-3 pr-2 font-semibold sm:pl-6">{label}</td>
      <td className="whitespace-nowrap py-1.5 px-1 text-right font-semibold tabular-nums sm:px-2">
        {formatEUR(current)}
      </td>
      <td className="hidden whitespace-nowrap py-1.5 px-2 text-right tabular-nums text-[color:var(--muted)] sm:table-cell">
        {formatEUR(previous)}
      </td>
      <td
        className={cn(
          "whitespace-nowrap py-1.5 pl-1 pr-1 text-right text-[10px] tabular-nums sm:pl-2 sm:text-xs",
          TONE_CLASS[tone],
        )}
      >
        {fmtAbsoluteDelta(current, previous)}
      </td>
    </tr>
  );
}

function HighlightRow({
  label,
  current,
  previous,
  positive,
}: {
  label: string;
  current: number;
  previous: number;
  positive?: boolean;
}) {
  const tone = deltaTone(current, previous);
  const valueColor =
    positive === undefined
      ? "text-[color:var(--foreground)]"
      : current >= 0
        ? "text-emerald-600"
        : "text-rose-600";
  return (
    <tr className="border-y-2 border-[color:var(--border)] text-sm sm:text-base">
      <td className="py-2.5 pl-2 pr-1 font-bold uppercase tracking-wide text-[color:var(--foreground)] sm:pl-3 sm:pr-2">
        {label}
      </td>
      <td
        className={cn(
          "whitespace-nowrap py-2.5 px-1 text-right text-base font-bold tabular-nums sm:px-2 sm:text-lg",
          valueColor,
        )}
      >
        {formatEUR(current)}
      </td>
      <td className="hidden whitespace-nowrap py-2.5 px-2 text-right tabular-nums text-[color:var(--muted)] sm:table-cell">
        {formatEUR(previous)}
      </td>
      <td
        className={cn(
          "whitespace-nowrap py-2.5 pl-1 pr-1 text-right text-[10px] tabular-nums sm:pl-2 sm:text-xs",
          TONE_CLASS[tone],
        )}
      >
        {fmtAbsoluteDelta(current, previous)}
      </td>
    </tr>
  );
}

function MarginRow({
  label,
  current,
  previous,
}: {
  label: string;
  current: number | null;
  previous: number | null;
}) {
  const ppDelta = fmtPpDelta(current, previous);
  const tone = deltaTone(current, previous);
  return (
    <tr className="text-xs">
      <td className="py-1 pl-3 pr-2 italic text-[color:var(--muted)] sm:pl-6">
        {label}
      </td>
      <td className="whitespace-nowrap py-1 px-1 text-right italic tabular-nums text-[color:var(--muted)] sm:px-2">
        <PercentCell value={current} />
      </td>
      <td className="hidden whitespace-nowrap py-1 px-2 text-right italic tabular-nums text-zinc-400 sm:table-cell">
        <PercentCell value={previous} />
      </td>
      <td
        className={cn(
          "whitespace-nowrap py-1 pl-1 pr-1 text-right text-[10px] tabular-nums sm:pl-2",
          TONE_CLASS[tone],
        )}
      >
        {ppDelta ?? "–"}
      </td>
    </tr>
  );
}

export function PnLStatement({ pnl }: { pnl: PnL }) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)] sm:p-5">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-3 px-1 sm:px-0">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
            Finanzen · GuV
          </div>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            Gewinn- und Verlustrechnung
          </h2>
        </div>
        <div className="text-right text-[11px] text-[color:var(--muted)]">
          <div>
            Aktuell: {formatDate(pnl.range.from)} – {formatDate(pnl.range.to)}
          </div>
          <div>
            Vorperiode: {formatDate(pnl.previousRange.from)} –{" "}
            {formatDate(pnl.previousRange.to)}
          </div>
        </div>
      </header>

      <div>
        <table className="w-full table-auto">
          <thead>
            <tr className="border-b border-[color:var(--border)] text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
              <th className="pb-2 pl-3 pr-2 text-left sm:pl-6">Position</th>
              <th className="pb-2 px-1 text-right sm:px-2">Aktuell</th>
              <th className="hidden pb-2 px-2 text-right sm:table-cell">
                Vorperiode
              </th>
              <th className="pb-2 pl-1 pr-1 text-right sm:pl-2">Δ</th>
            </tr>
          </thead>
          <tbody>
            <SectionHeader>Umsatz</SectionHeader>
            {pnl.revenue.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="py-1.5 pl-6 text-sm text-[color:var(--muted)]"
                >
                  Kein Umsatz im Zeitraum.
                </td>
              </tr>
            ) : (
              pnl.revenue.rows.map((r) => <LineRow key={r.label} row={r} />)
            )}
            <SubtotalRow
              label="Gesamt-Umsatz"
              current={pnl.revenue.totalCurrent}
              previous={pnl.revenue.totalPrevious}
            />

            <SectionHeader>Lead-Akquise-Kosten</SectionHeader>
            {pnl.leadCosts.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="py-1.5 pl-6 text-sm text-[color:var(--muted)]"
                >
                  Keine Lead-Kosten im Zeitraum.
                </td>
              </tr>
            ) : (
              pnl.leadCosts.rows.map((r) => (
                <LineRow key={r.label} row={r} lowerIsBetter />
              ))
            )}
            <SubtotalRow
              label="Gesamt Lead-Kosten"
              current={pnl.leadCosts.totalCurrent}
              previous={pnl.leadCosts.totalPrevious}
              lowerIsBetter
            />

            <HighlightRow
              label="Bruttogewinn"
              current={pnl.grossProfit.current}
              previous={pnl.grossProfit.previous}
              positive
            />
            <MarginRow
              label="Bruttomarge"
              current={pnl.grossMargin.current}
              previous={pnl.grossMargin.previous}
            />

            {pnl.otherCosts ? (
              <>
                <SectionHeader>Weitere Betriebskosten</SectionHeader>
                {pnl.otherCosts.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-1.5 pl-6 text-sm text-[color:var(--muted)]"
                    >
                      Keine weiteren Kosten im Zeitraum.
                    </td>
                  </tr>
                ) : (
                  pnl.otherCosts.rows.map((r) => (
                    <LineRow key={r.label} row={r} lowerIsBetter />
                  ))
                )}
                <SubtotalRow
                  label="Gesamt weitere Kosten"
                  current={pnl.otherCosts.totalCurrent}
                  previous={pnl.otherCosts.totalPrevious}
                  lowerIsBetter
                />
              </>
            ) : (
              <tr>
                <td
                  colSpan={4}
                  className="pt-4 pl-6 text-[11px] italic text-[color:var(--muted)]"
                >
                  Weitere Betriebskosten in der Produkt-Ansicht ausgeblendet
                  (nicht produktspezifisch).
                </td>
              </tr>
            )}

            <HighlightRow
              label="Nettogewinn"
              current={pnl.netProfit.current}
              previous={pnl.netProfit.previous}
              positive
            />
            <MarginRow
              label="Nettomarge"
              current={pnl.netMargin.current}
              previous={pnl.netMargin.previous}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}
