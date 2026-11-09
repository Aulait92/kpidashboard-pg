import { connection } from "next/server";
import Link from "next/link";
import clsx from "clsx";
import { prisma } from "@/lib/prisma";
import { LOSS_LABEL, LOSS_REASONS, STAGES, shortName } from "@/lib/vertrieb/crm";
import { relDay, dayKey, todayKey } from "@/lib/vertrieb/dates";
import { dragStage } from "@/app/admin/vertrieb/actions";
import { LI_COLOR, LI_LABEL } from "@/lib/vertrieb/linkedin";
import { Kanban, type KanbanCard, type KanbanColumn } from "@/components/vertrieb/kanban";

const PER_COLUMN = 40;

export default async function PipelinePage() {
  await connection();
  const counts = await prisma.salesContact.groupBy({ by: ["stage"], _count: true });
  const lists = await Promise.all(
    STAGES.map((s) =>
      s.id === "NEU"
        ? Promise.resolve([])
        : prisma.salesContact.findMany({
            where: { stage: s.id },
            orderBy: { updatedAt: "desc" },
            take: PER_COLUMN,
            select: {
              id: true, name: true, city: true, stage: true, linkedinStatus: true, lossReason: true, competitor: true,
              tasks: { where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 1, select: { title: true, dueAt: true } },
              campaigns: { select: { sentAt: true, replyCount: true } },
            },
          }),
    ),
  );

  const columns: KanbanColumn[] = STAGES.map((s) => {
    const count = counts.find((c) => c.stage === s.id)?._count ?? 0;
    return {
      ...s,
      count,
      top:
        s.id === "NEU" ? (
          <Link href="/admin/vertrieb/kontakte?stage=NEU" className="card block p-3 text-sm text-slate-600 hover:bg-slate-50">
            Agenturen ohne Kontakt → Liste öffnen
            <br />
            <span className="text-xs text-slate-400">Karten hierher ziehen setzt sie auf „Neu“ zurück.</span>
          </Link>
        ) : undefined,
      bottom:
        s.id !== "NEU" && count > PER_COLUMN ? (
          <Link href={`/admin/vertrieb/kontakte?stage=${s.id}`} className="block px-1 text-xs text-sky-700 hover:underline">
            Alle {count.toLocaleString("de-DE")} in der Liste ansehen
          </Link>
        ) : undefined,
    };
  });

  const cards: KanbanCard[] = lists.flat().map((c) => {
    const task = c.tasks[0];
    const mailed = c.campaigns.some((x) => x.sentAt);
    const replied = c.campaigns.some((x) => x.replyCount > 0);
    return {
      id: c.id,
      column: c.stage,
      node: (
        <div className="card p-3 hover:border-slate-300">
          <Link href={`/admin/vertrieb/kontakte/${c.id}`} draggable={false} className="block text-sm font-medium leading-tight hover:underline">
            {shortName(c.name)}
          </Link>
          <div className="mt-0.5 text-xs text-slate-500">{c.city}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {replied ? <span className="badge bg-emerald-100 text-emerald-800">Mail beantwortet</span> : mailed && <span className="badge bg-sky-50 text-sky-700">Cold Mail</span>}
            {c.linkedinStatus && <span className={`badge ${LI_COLOR[c.linkedinStatus]}`}>LinkedIn: {LI_LABEL[c.linkedinStatus]}</span>}
            {c.lossReason && <span className="badge bg-rose-50 text-rose-700">{LOSS_LABEL[c.lossReason]}</span>}
            {c.competitor && <span className="badge bg-slate-100 text-slate-600">{c.competitor}</span>}
          </div>
          {task && (
            <div className={clsx("mt-2 text-xs", dayKey(task.dueAt) < todayKey() ? "text-rose-600" : dayKey(task.dueAt) === todayKey() ? "text-amber-700" : "text-slate-500")}>
              ⏰ {task.title} · {relDay(task.dueAt)}
            </div>
          )}
        </div>
      ),
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Akquise-Pipeline</h1>
        <p className="text-sm text-slate-500">Karten per Drag &amp; Drop in eine andere Spalte ziehen.</p>
      </div>
      <Kanban columns={columns} cards={cards} move={dragStage} reasonColumn="VERLOREN" reasons={LOSS_REASONS} />
    </div>
  );
}
