import Link from "next/link";
import clsx from "clsx";
import { prisma } from "@/lib/prisma";
import { TASK_TYPES } from "@/lib/vertrieb/crm";
import { TaskRow, type TaskWithContact } from "@/components/vertrieb/ui";
import { TaskForm } from "@/components/vertrieb/task-form";
import { dayBounds, openTasks, taskInclude } from "@/lib/vertrieb/queries";
import type { SalesTaskType as TaskType } from "@/generated/prisma/enums";

export default async function AufgabenPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view = sp.view === "done" ? "done" : "open";
  const type = TASK_TYPES.some((t) => t.id === sp.type) ? (sp.type as TaskType) : undefined;
  const { start, tomorrow, dayAfter, week } = dayBounds();

  const tasks: TaskWithContact[] =
    view === "open"
      ? await openTasks(type ? { type } : {})
      : await prisma.salesTask.findMany({ where: { doneAt: { not: null }, ...(type ? { type } : {}) }, include: taskInclude, orderBy: { doneAt: "desc" }, take: 200 });

  const groups =
    view === "open"
      ? [
          { title: "Überfällig", tone: "text-rose-600", items: tasks.filter((t) => t.dueAt < start) },
          { title: "Heute", tone: "text-amber-700", items: tasks.filter((t) => t.dueAt >= start && t.dueAt < tomorrow) },
          { title: "Morgen", tone: "", items: tasks.filter((t) => t.dueAt >= tomorrow && t.dueAt < dayAfter) },
          { title: "Nächste 7 Tage", tone: "", items: tasks.filter((t) => t.dueAt >= dayAfter && t.dueAt < week) },
          { title: "Später", tone: "text-slate-500", items: tasks.filter((t) => t.dueAt >= week) },
        ]
      : [{ title: "Zuletzt erledigt", tone: "", items: tasks }];

  const link = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ view, type, ...p }).filter(([, v]) => v) as [string, string][]);
    return `/admin/vertrieb/aufgaben?${q}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Aufgaben</h1>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          {[["open", "Offen"], ["done", "Erledigt"]].map(([v, l]) => (
            <Link key={v} href={link({ view: v })} className={clsx("rounded-md px-3 py-1", view === v ? "bg-white shadow-sm" : "text-slate-600")}>{l}</Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 text-sm">
          <Link href={link({ type: undefined })} className={clsx("badge", !type ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>Alle</Link>
          {TASK_TYPES.map((t) => (
            <Link key={t.id} href={link({ type: t.id })} className={clsx("badge", type === t.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{t.label}</Link>
          ))}
        </div>
      </div>

      <div className="card p-4"><TaskForm /></div>

      {groups.map((g) =>
        g.items.length ? (
          <section key={g.title} className="card">
            <h2 className={clsx("border-b border-slate-100 px-4 py-2.5 text-sm font-semibold", g.tone)}>
              {g.title} <span className="font-normal text-slate-400">({g.items.length})</span>
            </h2>
            <ul className="divide-y divide-slate-100">{g.items.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
          </section>
        ) : null,
      )}
      {!tasks.length && <p className="py-10 text-center text-sm text-slate-500">Keine Aufgaben.</p>}
    </div>
  );
}
