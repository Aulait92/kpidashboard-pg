import clsx from "clsx";
import Link from "next/link";
import { STAGE_COLOR, STAGE_LABEL, TASK_LABEL, shortName } from "@/lib/vertrieb/crm";
import { fmtDateTime, relDay, dayKey, todayKey } from "@/lib/vertrieb/dates";
import { deleteTask, snoozeTask, toggleTask } from "@/app/admin/vertrieb/actions";
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

export function TaskRow({ t, showContact = true }: { t: TaskWithContact; showContact?: boolean }) {
  const overdue = !t.doneAt && dayKey(t.dueAt) < todayKey();
  const today = !t.doneAt && dayKey(t.dueAt) === todayKey();
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap">
      <form action={toggleTask} className="pt-0.5">
        <input type="hidden" name="id" value={t.id} />
        <button
          title={t.doneAt ? "Wieder öffnen" : "Erledigt"}
          className={clsx(
            "flex h-6 w-6 items-center justify-center rounded-md border text-xs sm:h-5 sm:w-5",
            t.doneAt ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 hover:border-emerald-600",
          )}
        >
          {t.doneAt ? "✓" : ""}
        </button>
      </form>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx("font-medium", t.doneAt && "text-slate-400 line-through")}>{t.title}</span>
          <span className="badge bg-slate-100 text-slate-600">{TASK_LABEL[t.type]}</span>
          <span className={clsx("text-xs", overdue ? "font-medium text-rose-600" : today ? "font-medium text-amber-700" : "text-slate-500")}>
            {t.doneAt ? `erledigt ${fmtDateTime(t.doneAt)}` : `${relDay(t.dueAt)} · ${fmtDateTime(t.dueAt)}`}
          </span>
        </div>
        {showContact && t.contact && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Link href={`/admin/vertrieb/kontakte/${t.contact.id}`} className="font-medium text-slate-900 underline-offset-2 hover:underline">
              {shortName(t.contact.name)}
            </Link>
            {t.contact.city && <span>{t.contact.city}</span>}
            {t.contact.phone && <a href={`tel:${t.contact.phone.replace(/\s/g, "")}`} className="text-sky-700 hover:underline">{t.contact.phone}</a>}
            <StageBadge stage={t.contact.stage} />
          </div>
        )}
        {t.note && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{t.note}</p>}
      </div>
      {!t.doneAt && (
        <div className="ml-9 flex shrink-0 basis-full gap-1 sm:ml-0 sm:basis-auto">
          {[1, 7].map((d) => (
            <form key={d} action={snoozeTask}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="days" value={d} />
              <button className="btn-ghost px-2 py-1 text-xs" title="Verschieben">+{d === 1 ? "1 Tag" : "1 Woche"}</button>
            </form>
          ))}
          <form action={deleteTask}>
            <input type="hidden" name="id" value={t.id} />
            <button className="btn-ghost px-2 py-1 text-xs text-rose-600" title="Löschen">✕</button>
          </form>
        </div>
      )}
    </li>
  );
}

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
