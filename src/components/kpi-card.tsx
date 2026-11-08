import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Sparkline } from "@/components/sparkline";
import type { TimeSeriesPoint } from "@/lib/kpis";
import { cn } from "@/lib/utils";

type Tone = "default" | "positive" | "negative" | "neutral";

export type Delta = {
  // Relative Veränderung als Bruchteil (z.B. 0.124 = +12,4%).
  // null = nicht berechenbar.
  pct: number | null;
  // Optional: absolute Veränderung (Differenz current - previous) für die
  // Anzeige im Badge. Wenn gesetzt, wird sie statt der Prozentzahl gezeigt.
  abs?: { value: number; format: (v: number) => string };
  // Für Metriken bei denen niedriger besser ist (Cost per Lead, Zeit etc).
  lowerIsBetter?: boolean;
};

const pctFmt = new Intl.NumberFormat("de-DE", {
  style: "percent",
  signDisplay: "exceptZero",
  maximumFractionDigits: 1,
});

const ppFmt = new Intl.NumberFormat("de-DE", {
  signDisplay: "exceptZero",
  maximumFractionDigits: 1,
});

function DeltaBadge({ delta }: { delta: Delta }) {
  if (delta.pct == null || !Number.isFinite(delta.pct)) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
        <ArrowRight className="h-3 w-3" /> n/a
      </span>
    );
  }

  const lowerIsBetter = delta.lowerIsBetter === true;
  const isGood =
    delta.pct === 0 ? null : lowerIsBetter ? delta.pct < 0 : delta.pct > 0;

  const color =
    isGood === null
      ? "bg-zinc-100 text-zinc-600"
      : isGood
        ? "bg-emerald-50 text-emerald-700"
        : "bg-rose-50 text-rose-700";

  const Icon =
    delta.pct === 0
      ? ArrowRight
      : delta.pct > 0
        ? ArrowUpRight
        : ArrowDownRight;

  const text = delta.abs
    ? `${ppFmt.format(delta.abs.value) === "0" ? "±0" : delta.abs.format(delta.abs.value)}`
    : pctFmt.format(delta.pct);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        color,
      )}
    >
      <Icon className="h-3 w-3" />
      {text}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
  delta,
  sparkline,
}: {
  label: string;
  value: string;
  hint?: string | ReactNode;
  tone?: Tone;
  delta?: Delta;
  sparkline?: {
    points: TimeSeriesPoint[];
    dataKey: keyof TimeSeriesPoint;
    // Override falls Trend-Richtung nicht ausreichend abgeleitet werden kann.
    tone?: "positive" | "negative" | "neutral";
  };
}) {
  const valueColor = {
    default: "text-[color:var(--foreground)]",
    positive: "text-emerald-600",
    negative: "text-rose-600",
    neutral: "text-[color:var(--muted)]",
  }[tone];

  // Verlauf ruhig in Markenfarbe – die Bewertung steckt im Delta-Badge.
  const sparkTone: "positive" | "negative" | "neutral" | "brand" = sparkline?.tone ?? "brand";

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-md)] transition hover:shadow-[var(--shadow-lg)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-xs font-medium text-[color:var(--muted)]">
          {label}
        </div>
        {delta ? <DeltaBadge delta={delta} /> : null}
      </div>
      <div
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-[28px]",
          valueColor,
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-[11px] text-[color:var(--muted)]">{hint}</div>
      ) : null}
      {sparkline ? (
        <div className="mt-3 -mb-1">
          <Sparkline
            points={sparkline.points}
            dataKey={sparkline.dataKey}
            tone={sparkTone}
            height={32}
          />
        </div>
      ) : null}
    </div>
  );
}
