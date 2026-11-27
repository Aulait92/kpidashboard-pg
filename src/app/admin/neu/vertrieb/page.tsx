import Link from "next/link";
import { connection } from "next/server";
import { ChevronRight, Clock, Plus } from "lucide-react";
import { Badge, ButtonLink } from "@/components/ui";
import { Kanban, type KanbanCard, type KanbanColumn } from "@/components/vertrieb/kanban";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Aufmerksamkeit } from "@/components/admin-neu/ui/aufmerksamkeit";
import { punkteDerRolle } from "@/lib/admin-neu/rollen-server";
import { KONTAKTE, kontaktPfad } from "@/components/admin-neu/vertrieb/listen";
import { dragStage } from "@/app/admin/vertrieb/actions";
import { Klappe } from "@/components/admin-neu/vertrieb/klappe";
import { VerkaufenMehr } from "@/components/admin-neu/vertrieb/verkaufen-mehr";
import { offeneRechtsFaelle } from "@/lib/vertrieb/datenschutz-recht-server";
import { LOSS_LABEL, LOSS_REASONS, STAGES, shortName } from "@/lib/vertrieb/crm";
import { dayKey, relDay, todayKey } from "@/lib/vertrieb/dates";
import { LI_LABEL } from "@/lib/vertrieb/linkedin";
import { PIPELINE_PRO_SPALTE, ladePipeline } from "@/lib/vertrieb/pipeline";
import { requireAuth } from "@/lib/vertrieb/auth";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pipeline | performancegrowth Admin" };

// Verkaufen → Pipeline (Startseite der Rolle, Admin v2: oben „Braucht Aufmerksamkeit“): Akquise-Board wie /admin/vertrieb/pipeline (gleiche Daten aus lib/vertrieb/pipeline.ts,
// gleiche Kanban-Komponente und Server Action dragStage, „Verloren“ fragt nach dem Grund).
// Karte: Name, Ort, Cold-Mail-Stand, LinkedIn, Verlustgrund, nächste Aufgabe. Antippen öffnet die Kontaktakte.
// Umbau 19.11.2026: Am Handy und Tablet (unter 1024 px) eine Liste je Stufe zum Aufklappen wie /buyer/kontakte statt
// waagrechtem Board; „Neu“ zeigt die Agenturen mit dem höchsten Potenzial. Import, Marketing und Seltenes unter „Mehr“.
export default async function PipelinePage() {
  await connection();
  const session = await requireAuth();
  const [{ countOf, contacts }, punkte, offenRecht] = await Promise.all([ladePipeline({ neuKarten: true }), punkteDerRolle(session.userId, "verkaufen"), offeneRechtsFaelle()]);

  const columns: KanbanColumn[] = STAGES.map((s) => {
    const count = countOf(s.id);
    return {
      ...s,
      count,
      bottom:
        count > PIPELINE_PRO_SPALTE ? (
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

  return (
    <Seite
      titel="Verkaufen"
      reiter="verkaufen"
      breit
      aktionen={
        <>
          <VerkaufenMehr datenschutzOffen={offenRecht} />
          <ButtonLink href={`${KONTAKTE}/neu`} variant="primary" size="md" icon={Plus}>
            Kontakt
          </ButtonLink>
        </>
      }
    >
      <Aufmerksamkeit punkte={punkte} />
      {/* Handy und Tablet: Liste je Stufe (Stufe ändern in der Kontaktakte) */}
      <div className="space-y-2 lg:hidden" data-pipeline-liste>
        {STAGES.map((s) => {
          const count = countOf(s.id);
          const liste = contacts.filter((c) => c.stage === s.id);
          return (
            <Klappe key={s.id} titel={s.label} info={<span className="tabular-nums">{count.toLocaleString("de-DE")}</span>} offen={s.id === "TERMIN" && count > 0}>
              {liste.length ? (
                <ul className="divide-y divide-[color:var(--border)]">
                  {liste.map((c) => (
                    <li key={c.id}>
                      <Link href={kontaktPfad(c.id)} className="flex items-center gap-2 px-5 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{shortName(c.name)}</span>
                          <span className="block truncate text-xs text-[color:var(--muted)]">
                            {[c.city, c.tasks[0] ? `${c.tasks[0].title} · ${relDay(c.tasks[0].dueAt)}` : null].filter(Boolean).join(" · ") || s.hint}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-4 text-sm text-[color:var(--muted)]">{s.hint}</p>
              )}
              {count > liste.length ? (
                <Link href={`${KONTAKTE}?stage=${s.id}`} className="flex min-h-11 items-center border-t border-[color:var(--border)] px-5 text-sm font-medium text-[color:var(--brand)]">
                  Alle {count.toLocaleString("de-DE")} ansehen
                </Link>
              ) : null}
            </Klappe>
          );
        })}
      </div>
      <div className="hidden lg:block" data-funktion="actions-dragstage--akquise-pipeline-per-drag-drop kanban--beim-verschieben-auf-verloren-grund-abfragen">
        <Kanban columns={columns} cards={cards} move={dragStage} reasonColumn="VERLOREN" reasons={LOSS_REASONS} feierSpalte="GEWONNEN" topOffset={230} />
      </div>
    </Seite>
  );
}
