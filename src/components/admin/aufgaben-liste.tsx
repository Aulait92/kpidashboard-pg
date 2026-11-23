import Link from "next/link";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { TASK_TYPES } from "@/lib/vertrieb/crm";
import { TaskRow, type TaskWithContact } from "@/components/vertrieb/ui";
import { TaskForm } from "@/components/vertrieb/task-form";
import { dayBounds, openTasks, taskInclude } from "@/lib/vertrieb/queries";
import type { SalesTaskType as TaskType } from "@/generated/prisma/enums";
import { wichtigsteAufgaben, zeigeZuerst, type Grund, type PrioKontakt } from "@/lib/vertrieb/aufgaben-prioritaet";

/** Zusatzdaten der Kontakte für „Zuerst erledigen“: Kundenstufe, Sperre, offenes Angebot. */
async function prioKontakte(tasks: TaskWithContact[]): Promise<Map<string, PrioKontakt>> {
  const ids = [...new Set(tasks.flatMap((t) => (t.contact ? [t.contact.id] : [])))];
  if (!ids.length) return new Map();
  const rows = await prisma.salesContact.findMany({
    where: { id: { in: ids } },
    select: { id: true, stage: true, customerStage: true, nieKontaktierenAt: true, offers: { where: { status: "sent" }, select: { id: true }, take: 1 } },
  });
  return new Map(rows.map((r) => [r.id, { stage: r.stage, customerStage: r.customerStage, gesperrt: !!r.nieKontaktierenAt, angebotOffen: r.offers.length > 0 }]));
}

// Alle Aufgaben, gruppiert nach Fälligkeit, mit Ansicht Offen/Erledigt und Filter nach Art.
// Genutzt von /admin/heute/aufgaben (alte Oberfläche) und /admin/neu/vertrieb/aufgaben (neuer Admin).
// `basis`: Adresse der Seite für die Filter-Links.
export async function AufgabenListe({ basis, searchParams: sp }: { basis: string; searchParams: Record<string, string | undefined> }) {
  const view = sp.view === "done" ? "done" : "open";
  const type = TASK_TYPES.some((t) => t.id === sp.type) ? (sp.type as TaskType) : undefined;
  const { start, tomorrow, dayAfter, week } = dayBounds();

  const tasks: TaskWithContact[] =
    view === "open"
      ? await openTasks(type ? { type } : {})
      : await prisma.salesTask.findMany({ where: { doneAt: { not: null }, ...(type ? { type } : {}) }, include: taskInclude, orderBy: { doneAt: "desc" }, take: 200 });

  // „Zuerst erledigen“ (Ole, 23.11.2026): bei vielen offenen Aufgaben die 3 bis 5 wichtigsten oben, mit Grund-Chip.
  // Regeln in lib/vertrieb/aufgaben-prioritaet.ts. Diese Aufgaben stehen unten nicht noch einmal (keine Doppelten).
  const now = new Date();
  let zuerst: { task: TaskWithContact; grund: Grund }[] = [];
  if (view === "open" && zeigeZuerst(tasks, now)) {
    const kontakte = await prioKontakte(tasks);
    const prio = tasks.map((t) => ({ ...t, contact: t.contact ? (kontakte.get(t.contact.id) ?? { stage: t.contact.stage }) : null, original: t }));
    zuerst = wichtigsteAufgaben(prio, now).map(({ task, grund }) => ({ task: task.original, grund }));
  }
  const oben = new Set(zuerst.map((z) => z.task.id));
  const rest = tasks.filter((t) => !oben.has(t.id));

  const groups =
    view === "open"
      ? [
          { title: "Überfällig", tone: "text-rose-600", items: rest.filter((t) => t.dueAt < start) },
          { title: "Heute", tone: "text-amber-700", items: rest.filter((t) => t.dueAt >= start && t.dueAt < tomorrow) },
          { title: "Morgen", tone: "", items: rest.filter((t) => t.dueAt >= tomorrow && t.dueAt < dayAfter) },
          { title: "Nächste 7 Tage", tone: "", items: rest.filter((t) => t.dueAt >= dayAfter && t.dueAt < week) },
          { title: "Später", tone: "text-slate-500", items: rest.filter((t) => t.dueAt >= week) },
        ]
      : [{ title: "Zuletzt erledigt", tone: "", items: tasks }];

  const link = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ view, type, ...p }).filter(([, v]) => v) as [string, string][]);
    return `${basis}?${q}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="sr-only">Aufgaben</h2>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 text-sm">
          {[["open", "Offen"], ["done", "Erledigt"]].map(([v, l]) => (
            <Link key={v} href={link({ view: v })} className={clsx("inline-flex min-h-10 items-center rounded-md px-3", view === v ? "bg-white shadow-sm" : "text-slate-600")}>{l}</Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-1 gap-y-5 text-sm">
          <Link href={link({ type: undefined })} className={clsx("badge relative after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-['']", !type ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>Alle</Link>
          {TASK_TYPES.map((t) => (
            <Link key={t.id} href={link({ type: t.id })} className={clsx("badge relative after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-['']", type === t.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{t.label}</Link>
          ))}
        </div>
      </div>

      {/* Ganz oben, gleiche Karte und Zeile wie die Gruppen darunter, nur mit Grund-Chip */}
      {zuerst.length ? (
        <section className="card" data-zuerst-erledigen="">
          <h2 className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-rose-600">Zuerst erledigen</h2>
          <ul className="divide-y divide-slate-100">{zuerst.map(({ task, grund }) => <TaskRow key={task.id} t={task} grund={grund} />)}</ul>
        </section>
      ) : null}

      {/* Neue Aufgabe ohne Kontakt ist selten (meist im Kontakt angelegt): zugeklappt */}
      <details className="card group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-sky-700 [&::-webkit-details-marker]:hidden">
          <Plus className="h-4 w-4" /> Neue Aufgabe
        </summary>
        <div className="border-t border-slate-100 p-4">
          <TaskForm />
        </div>
      </details>

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
      {!tasks.length && (
        <p className="py-10 text-center text-sm text-slate-500">
          {type ? (
            <>
              Keine Aufgaben dieser Art.{" "}
              <Link href={link({ type: undefined })} className="font-medium text-sky-700 hover:underline">
                Alle Arten zeigen
              </Link>
            </>
          ) : view === "open" ? (
            "Alles erledigt. Neue Aufgaben legen Sie oben oder im Kontakt an."
          ) : (
            "Noch nichts erledigt."
          )}
        </p>
      )}
    </div>
  );
}
