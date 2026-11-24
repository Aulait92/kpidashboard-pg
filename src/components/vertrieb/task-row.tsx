"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, Check, ChevronRight, MoreHorizontal, Phone, Trash2, UserRound } from "lucide-react";
import { deleteTask, snoozeTask, toggleTask } from "@/app/admin/vertrieb/actions";
import { success as hapticSuccess } from "@/lib/haptics";
import { ActionSheet, type SheetAction } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { STAGE_COLOR, STAGE_LABEL, TASK_LABEL, TERMIN_REVIEW_CHOICES, isTerminReview, shortName } from "@/lib/vertrieb/crm";
import { meetingOutcomeAction, undoHeuteAction } from "@/app/admin/heute/actions";
import { dayKey, fmtDateTime, relDay, todayKey } from "@/lib/vertrieb/dates";
import type { TaskWithContact } from "@/components/vertrieb/ui";
import type { Grund, GrundTon } from "@/lib/vertrieb/aufgaben-prioritaet";

// Farben wie die Stufen-Badges (lib/vertrieb/crm.ts)
const GRUND_FARBE: Record<GrundTon, string> = {
  rose: "bg-rose-100 text-rose-800",
  amber: "bg-amber-100 text-amber-800",
  emerald: "bg-emerald-100 text-emerald-800",
  violet: "bg-violet-100 text-violet-800",
  slate: "bg-slate-100 text-slate-700",
};

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

/**
 * Aufgabe: Haken = erledigt; „+1 Tag“/„+1 Woche“ verschieben direkt.
 * Zeile antippen: in Aufgabenlisten (mit Kontakt) öffnet den Kontakt, in der
 * Kontaktakte das Menü (Anrufen, Löschen). „…“ öffnet immer das Menü.
 * `grund`: Grund-Chip vorne in der Zeile (nur in „Zuerst erledigen“).
 */
export function TaskRow({ t, showContact = true, grund }: { t: TaskWithContact; showContact?: boolean; grund?: Grund }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [doneLocal, setDoneLocal] = useState(!!t.doneAt);
  const toast = useToast();
  const overdue = !t.doneAt && dayKey(t.dueAt) < todayKey();
  const today = !t.doneAt && dayKey(t.dueAt) === todayKey();
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const actions: SheetAction[] = [
    ...(t.contact && showContact ? [{ label: "Kontakt öffnen", icon: UserRound, tone: "primary" as const, href: `/admin/neu/vertrieb/kontakte/${t.contact.id}` }] : []),
    ...(t.contact?.phone ? [{ label: `Anrufen (${t.contact.phone})`, icon: Phone, href: `tel:${t.contact.phone.replace(/\s/g, "")}` }] : []),
    ...(!t.doneAt
      ? [
          { label: "Auf morgen", icon: CalendarClock, onSelect: () => run(() => snoozeTask(fd({ id: t.id, days: "1" }))) },
          { label: "In 1 Woche", icon: CalendarClock, onSelect: () => run(() => snoozeTask(fd({ id: t.id, days: "7" }))) },
        ]
      : []),
    { label: "Löschen", icon: Trash2, tone: "danger" as const, onSelect: () => run(() => deleteTask(fd({ id: t.id }))) },
  ];

  return (
    <li className={clsx("flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50", pending && "opacity-60")}>
      <button
        type="button"
        title={doneLocal ? "Wieder öffnen" : "Erledigt"}
        aria-label={doneLocal ? "Wieder öffnen" : "Als erledigt markieren"}
        onClick={() => {
          if (!doneLocal) hapticSuccess();
          setDoneLocal((v) => !v);
          run(() => toggleTask(fd({ id: t.id })));
        }}
        // Kreis bleibt 24 px, die Tippfläche ist 40 px (Handy)
        className="group -m-2 flex h-10 w-10 shrink-0 items-center justify-center"
      >
        <span
          className={clsx(
            "flex h-6 w-6 items-center justify-center rounded-full border-2 transition",
            doneLocal ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 group-hover:border-emerald-600",
          )}
        >
          {doneLocal ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        {(() => {
          const body = (
            <>
              <div className="min-w-0 flex-1">
                <div className={clsx("font-medium", doneLocal && "text-slate-400 line-through")}>{t.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
                  {/* Grund in „Zuerst erledigen“ (components/admin/aufgaben-liste.tsx) */}
                  {grund ? <span className={clsx("badge font-semibold", GRUND_FARBE[grund.ton])} data-grund>{grund.label}</span> : null}
                  <span className={clsx(overdue ? "font-medium text-rose-600" : today ? "font-medium text-amber-700" : "")}>
                    {t.doneAt ? `erledigt ${fmtDateTime(t.doneAt)}` : `${relDay(t.dueAt)}, ${fmtDateTime(t.dueAt).split(", ").pop()}`}
                  </span>
                  <span>· {TASK_LABEL[t.type]}</span>
                  {showContact && t.contact ? (
                    <>
                      <span>· {shortName(t.contact.name)}</span>
                      <span className={clsx("badge", STAGE_COLOR[t.contact.stage])}>{STAGE_LABEL[t.contact.stage]}</span>
                    </>
                  ) : null}
                </div>
                {t.note ? <p className="mt-1 line-clamp-2 text-sm text-slate-500">{t.note}</p> : null}
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
            </>
          );
          return showContact && t.contact ? (
            <Link href={`/admin/neu/vertrieb/kontakte/${t.contact.id}`} className="flex min-w-0 items-start gap-2" title="Kontakt öffnen">
              {body}
            </Link>
          ) : (
            <button type="button" onClick={() => setOpen(true)} className="flex w-full min-w-0 items-start gap-2 text-left">
              {body}
            </button>
          );
        })()}
        {!doneLocal && isTerminReview(t.title) ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" data-termin-ergebnis>
            {TERMIN_REVIEW_CHOICES.map((c) => (
              <button
                key={c.outcome}
                type="button"
                disabled={pending}
                onClick={() => {
                  setDoneLocal(true);
                  run(async () => {
                    const res = await meetingOutcomeAction(t.id, c.outcome);
                    if (!res.ok) {
                      setDoneLocal(false);
                      toast.show({ message: res.error ?? "Das hat nicht geklappt. Bitte die Seite neu laden.", tone: "error" });
                    } else if (res.undo) {
                      // Versehentlich geklickt? Sofort zurücknehmen (Ole, 24.11.2026); später im Verlauf am Eintrag
                      const undo = res.undo;
                      toast.show({
                        message: res.message,
                        actionLabel: "Rückgängig",
                        durationMs: 10_000,
                        onAction: () =>
                          run(async () => {
                            const back = await undoHeuteAction(undo).catch(() => null);
                            if (back?.ok) setDoneLocal(false);
                            toast.show({ message: back?.ok ? "Rückgängig gemacht" : back && !back.ok ? back.error : "Das hat nicht geklappt. Bitte die Seite neu laden.", tone: back?.ok ? undefined : "error" });
                          }),
                      });
                    }
                  });
                }}
                className={clsx(
                  "relative rounded-full border px-2.5 py-0.5 text-xs font-medium after:absolute after:-inset-y-2 after:inset-x-0 after:content-['']",
                  c.outcome === "gewonnen"
                    ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                    : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-white",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : null}
        {!doneLocal ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => snoozeTask(fd({ id: t.id, days: "1" })))}
              className="relative rounded-full border border-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600 after:absolute after:-inset-y-2 after:inset-x-0 after:content-[''] hover:border-slate-300 hover:bg-white"
            >
              +1 Tag
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => snoozeTask(fd({ id: t.id, days: "7" })))}
              className="relative rounded-full border border-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600 after:absolute after:-inset-y-2 after:inset-x-0 after:content-[''] hover:border-slate-300 hover:bg-white"
            >
              +1 Woche
            </button>
          </div>
        ) : null}
      </div>
      <button type="button" onClick={() => setOpen(true)} aria-label="Weitere Aktionen" title="Weitere Aktionen" className="-mr-3 -mt-2 shrink-0 rounded-md p-3 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <ActionSheet open={open} onClose={() => setOpen(false)} title={t.title} message={t.contact ? shortName(t.contact.name) : undefined} actions={actions} />
    </li>
  );
}
