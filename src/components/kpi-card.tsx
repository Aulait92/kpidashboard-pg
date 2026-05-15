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
    default: "text-zinc-900 dark:text-zinc-50",
    positive: "text-emerald-600 dark:text-emerald-400",
    negative: "text-rose-600 dark:text-rose-400",
    neutral: "text-zinc-500 dark:text-zinc-400",
  }[tone];

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums", valueColor)}>
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
