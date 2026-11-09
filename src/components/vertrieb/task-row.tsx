"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, Check, ChevronRight, Phone, Trash2, UserRound } from "lucide-react";
import { deleteTask, snoozeTask, toggleTask } from "@/app/admin/vertrieb/actions";
import { ActionSheet, type SheetAction } from "@/components/ui/sheet";
import { STAGE_COLOR, STAGE_LABEL, TASK_LABEL, shortName } from "@/lib/vertrieb/crm";
import { dayKey, fmtDateTime, relDay, todayKey } from "@/lib/vertrieb/dates";
import type { TaskWithContact } from "@/components/vertrieb/ui";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

/** Aufgabe: Haken = erledigt; Zeile antippen = verschieben, Kontakt, löschen. */
export function TaskRow({ t, showContact = true }: { t: TaskWithContact; showContact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [doneLocal, setDoneLocal] = useState(!!t.doneAt);
  const overdue = !t.doneAt && dayKey(t.dueAt) < todayKey();
  const today = !t.doneAt && dayKey(t.dueAt) === todayKey();
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const actions: SheetAction[] = [
    ...(t.contact ? [{ label: "Kontakt öffnen", icon: UserRound, tone: "primary" as const, href: `/admin/vertrieb/kontakte/${t.contact.id}` }] : []),
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
          setDoneLocal((v) => !v);
          run(() => toggleTask(fd({ id: t.id })));
        }}
        className={clsx(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition",
          doneLocal ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 hover:border-emerald-600",
        )}
      >
        {doneLocal ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
      </button>
      <button type="button" onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
        <div className="min-w-0 flex-1">
          <div className={clsx("font-medium", doneLocal && "text-slate-400 line-through")}>{t.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
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
      </button>
      <ActionSheet open={open} onClose={() => setOpen(false)} title={t.title} message={t.contact ? shortName(t.contact.name) : undefined} actions={actions} />
    </li>
  );
}
