import Link from "next/link";
import { connection } from "next/server";
import { Clock, Plus, Upload } from "lucide-react";
import { Badge, ButtonLink } from "@/components/ui";
import { Kanban, type KanbanCard, type KanbanColumn } from "@/components/vertrieb/kanban";
import { Seite } from "@/components/admin-neu/ui/seite";
import { KONTAKTE, kontaktPfad } from "@/components/admin-neu/vertrieb/listen";
import { dragStage } from "@/app/admin/vertrieb/actions";
import { neuerPfad } from "@/lib/admin-neu/umzug";
import { LOSS_LABEL, LOSS_REASONS, STAGES, shortName } from "@/lib/vertrieb/crm";
import { dayKey, relDay, todayKey } from "@/lib/vertrieb/dates";
import { LI_LABEL } from "@/lib/vertrieb/linkedin";
import { PIPELINE_PRO_SPALTE, ladePipeline } from "@/lib/vertrieb/pipeline";
import { requireAuth } from "@/lib/vertrieb/auth";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pipeline | performancegrowth Admin" };

// Vertrieb → Pipeline: Akquise-Board wie /admin/vertrieb/pipeline (gleiche Daten aus lib/vertrieb/pipeline.ts,
// gleiche Kanban-Komponente und Server Action dragStage, „Verloren“ fragt nach dem Grund).
// Karte: Name, Ort, Cold-Mail-Stand, LinkedIn, Verlustgrund, nächste Aufgabe. Antippen öffnet die Kontaktakte.
export default async function PipelinePage() {
  await connection();
  await requireAuth();
  const { countOf, contacts } = await ladePipeline();

  const columns: KanbanColumn[] = STAGES.map((s) => {
    const count = countOf(s.id);
    return {
      ...s,
      count,
      top:
        s.id === "NEU" ? (
          <Link href={`${KONTAKTE}?stage=NEU`} className="block rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-3 text-sm hover:bg-[color:var(--surface-sunken)]">
            Agenturen ohne Kontakt: Liste öffnen
            <span className="mt-0.5 block text-xs text-[color:var(--muted)]">Karten hierher ziehen setzt sie auf „Neu“ zurück.</span>
          </Link>
        ) : undefined,
      bottom:
        s.id !== "NEU" && count > PIPELINE_PRO_SPALTE ? (
          <Link href={`${KONTAKTE}?stage=${s.id}`} className="block px-1 text-xs font-medium text-[color:var(--brand)] hover:underline">
            Alle {count.toLocaleString("de-DE")} in der Liste ansehen
          </Link>
        ) : undefined,
    };
  });

  const cards: KanbanCard[] = contacts.map((c) => {
    const task = c.tasks[0];
    const mailed = c.campaigns.some((x) => x.sentAt);
    const replied = c.campaigns.some((x) => x.replyCount > 0);
    const faellig = task ? (dayKey(task.dueAt) < todayKey() ? "text-rose-600" : dayKey(task.dueAt) === todayKey() ? "text-amber-700" : "text-[color:var(--muted)]") : "";
    return {
      id: c.id,
      column: c.stage,
      node: (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-3 shadow-[var(--shadow-sm)] hover:border-[color:var(--border-strong)]">
          <Link href={kontaktPfad(c.id)} draggable={false} className="block text-sm font-semibold leading-tight hover:underline">
            {shortName(c.name)}
          </Link>
          {c.city ? <div className="mt-0.5 text-xs text-[color:var(--muted)]">{c.city}</div> : null}
          <div className="mt-2 flex flex-wrap gap-1" data-funktion="page--karten-zeigen-cold-mail-status">
            {replied ? <Badge tone="success">Mail beantwortet</Badge> : mailed ? <Badge tone="info">Cold Mail</Badge> : null}
            {c.linkedinStatus ? <Badge tone="brand">LinkedIn: {LI_LABEL[c.linkedinStatus]}</Badge> : null}
            {c.lossReason ? <Badge tone="danger">{LOSS_LABEL[c.lossReason]}</Badge> : null}
            {c.competitor ? <Badge>{c.competitor}</Badge> : null}
          </div>
          {task ? (
            <div className={cn("mt-2 text-xs", faellig)}>
              <Clock className="mr-1 inline h-3 w-3 align-[-2px]" />
              {task.title} · {relDay(task.dueAt)}
            </div>
          ) : null}
        </div>
      ),
    };
  });

  const importHref = neuerPfad("/admin/vertrieb/import", { nurFertige: false }) ?? "/admin/vertrieb/import";
  return (
    <Seite
      titel="Verkaufen"
      reiter="verkaufen"
      breit
      aktionen={
        <>
          <ButtonLink href={importHref} size="md" icon={Upload} className="hidden sm:inline-flex">
            Import
          </ButtonLink>
          <ButtonLink href={`${KONTAKTE}/neu`} variant="primary" size="md" icon={Plus}>
            Kontakt
          </ButtonLink>
        </>
      }
    >
      <div data-funktion="actions-dragstage--akquise-pipeline-per-drag-drop kanban--beim-verschieben-auf-verloren-grund-abfragen">
        <Kanban columns={columns} cards={cards} move={dragStage} reasonColumn="VERLOREN" reasons={LOSS_REASONS} topOffset={230} />
      </div>
    </Seite>
  );
}
