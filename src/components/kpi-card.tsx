import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "default" | "positive" | "negative" | "neutral";

export type Delta = {
  // Relative Veränderung als Bruchteil (z.B. 0.124 = +12,4%).
  // null = nicht berechenbar (Vorperiode 0 oder current 0/0).
  pct: number | null;
  // Welche Richtung ist "gut"? Für Kosten/Zeit ist lower better.
  lowerIsBetter?: boolean;
};

const pctFmt = new Intl.NumberFormat("de-DE", {
  style: "percent",
  signDisplay: "exceptZero",
  maximumFractionDigits: 1,
});

function DeltaBadge({ delta }: { delta: Delta }) {
  if (delta.pct == null || !Number.isFinite(delta.pct)) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
        <Minus className="h-3 w-3" /> n/a
      </span>
    );
  }

  const lowerIsBetter = delta.lowerIsBetter === true;
  const isGood =
    delta.pct === 0
      ? null
      : lowerIsBetter
        ? delta.pct < 0
        : delta.pct > 0;

  const color =
    isGood === null
      ? "bg-zinc-100 text-zinc-600"
      : isGood
        ? "bg-emerald-50 text-emerald-700"
        : "bg-rose-50 text-rose-700";

  const Icon =
    delta.pct === 0 ? Minus : delta.pct > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        color,
      )}
    >
      <Icon className="h-3 w-3" />
      {pctFmt.format(delta.pct)}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  delta?: Delta;
}) {
  const valueColor = {
    default: "text-[color:var(--foreground)]",
    positive: "text-emerald-600",
    negative: "text-rose-600",
    neutral: "text-[color:var(--muted)]",
  }[tone];

  const dotColor = {
    default: "bg-[color:var(--brand)]",
    positive: "bg-emerald-500",
    negative: "bg-rose-500",
    neutral: "bg-zinc-400",
  }[tone];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.15)] transition hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_-12px_rgba(37,99,235,0.25)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", dotColor)} aria-hidden />
          <div className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
            {label}
          </div>
        </div>
        {delta ? <DeltaBadge delta={delta} /> : null}
      </div>
      <div
        className={cn(
          "mt-3 text-3xl font-bold tabular-nums tracking-tight",
          valueColor,
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1.5 text-xs text-[color:var(--muted)]">{hint}</div>
      ) : null}
    </div>
  );
}
