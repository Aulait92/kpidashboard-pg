import { cn } from "@/lib/utils";

type Tone = "default" | "positive" | "negative" | "neutral";

export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
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
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", dotColor)} aria-hidden />
        <div className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
          {label}
        </div>
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
