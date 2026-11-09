import clsx from "clsx";
import Link from "next/link";
import { STAGE_COLOR, STAGE_LABEL } from "@/lib/vertrieb/crm";
import type { SalesStage as Stage, SalesTaskType as TaskType } from "@/generated/prisma/enums";

export function StageBadge({ stage }: { stage: Stage }) {
  return <span className={clsx("badge", STAGE_COLOR[stage])}>{STAGE_LABEL[stage]}</span>;
}

export type TaskWithContact = {
  id: string;
  title: string;
  type: TaskType;
  note: string | null;
  dueAt: Date;
  doneAt: Date | null;
  contact: { id: string; name: string; phone: string | null; city: string | null; stage: Stage } | null;
};

export function Stat({ label, value, href, tone }: { label: string; value: number | string; href?: string; tone?: "red" | "amber" | "green" }) {
  const inner = (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={clsx("mt-1 text-2xl font-semibold tabular-nums", tone === "red" && "text-rose-600", tone === "amber" && "text-amber-700", tone === "green" && "text-emerald-700")}>
        {typeof value === "number" ? value.toLocaleString("de-DE") : value}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block transition hover:opacity-80">{inner}</Link> : inner;
}

export { TaskRow } from "@/components/vertrieb/task-row";
