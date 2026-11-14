"use client";

// Termin verschieben oder absagen direkt im Kundenbereich (statt die Seite des
// Leads in einem neuen Tab zu öffnen). Freie Zeiten wie auf /book/manage: Lead-
// Zeiten, Kalender frei, Dauer bleibt. Auf dem Handy von unten (Sheet).

import { useEffect, useState, useTransition } from "react";
import { CalendarX, ChevronLeft, ChevronRight, Phone, Video } from "lucide-react";
import {
  cancelAppointmentBuyerAction,
  loadRescheduleDialog,
  rescheduleAppointmentBuyerAction,
} from "@/app/buyer/appointment-actions";
import type { AppointmentChangeResult, RescheduleLoadResult } from "@/lib/calendar/manage";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const TZ = "Europe/Berlin";
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, ...opts }).format(new Date(iso));
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const longDay = (iso: string) => fmt(iso, { weekday: "long", day: "numeric", month: "long" });
const clock = (iso: string) => fmt(iso, { hour: "2-digit", minute: "2-digit" });
const shortWhen = (iso: string) => `${fmt(iso, { weekday: "short", day: "numeric", month: "numeric" })}, ${clock(iso)} Uhr`;

export type RescheduleStep = "move" | "cancel";

/**
 * Server-Aktionen hinter dem Dialog. Standard: Kundenbereich (Kunden- bzw.
 * Team-Rechte). Der Admin-Chat gibt eigene Aktionen mit Admin-Prüfung mit.
 */
export type RescheduleActions = {
  load: (appointmentId: string) => Promise<RescheduleLoadResult>;
  reschedule: (appointmentId: string, start: string) => Promise<AppointmentChangeResult>;
  cancel: (appointmentId: string) => Promise<AppointmentChangeResult>;
  /** Hinweis, wenn freie Zeiten fehlen (wo der Kalender verbunden wird). */
  calendarHint?: string;
};

const BUYER_ACTIONS: RescheduleActions = {
  load: loadRescheduleDialog,
  reschedule: rescheduleAppointmentBuyerAction,
  cancel: cancelAppointmentBuyerAction,
};

export function RescheduleDialog({
  appointmentId,
  open,
  onClose,
  initialStep = "move",
  actions = BUYER_ACTIONS,
  onChanged,
}: {
  appointmentId: string | null;
  open: boolean;
  onClose: () => void;
  /** „cancel“: direkt die Rückfrage zum Absagen zeigen. */
  initialStep?: RescheduleStep;
  actions?: RescheduleActions;
  /** Nach erfolgreichem Verschieben oder Absagen (z. B. Seite neu laden). */
  onChanged?: () => void;
}) {
  return (
    <Sheet open={open && !!appointmentId} onClose={onClose} title={initialStep === "cancel" ? "Termin absagen" : "Termin verschieben"}>
      {appointmentId ? (
        <RescheduleContent
          key={`${appointmentId}:${initialStep}`}
          appointmentId={appointmentId}
          initialStep={initialStep}
          actions={actions}
          onDone={() => {
            onClose();
            onChanged?.();
          }}
        />
      ) : null}
    </Sheet>
  );
}

/** Knopf, der den Dialog öffnet (für Server-Seiten wie Lead und Chats). */
export function RescheduleButton({
  appointmentId,
  className,
  initialStep = "move",
  actions,
  onChanged,
  children,
}: {
  appointmentId: string;
  className?: string;
  initialStep?: RescheduleStep;
  actions?: RescheduleActions;
  onChanged?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} data-reschedule={initialStep}>
        {children}
      </button>
      <RescheduleDialog
        appointmentId={appointmentId}
        open={open}
        onClose={() => setOpen(false)}
        initialStep={initialStep}
        actions={actions}
        onChanged={onChanged}
      />
    </>
  );
}

function RescheduleContent({
  appointmentId,
  initialStep,
  actions,
  onDone,
}: {
  appointmentId: string;
  initialStep: RescheduleStep;
  actions: RescheduleActions;
  onDone: () => void;
}) {
  const toast = useToast();
  const [res, setRes] = useState<RescheduleLoadResult | null>(null);
  const [reload, setReload] = useState(0);
  const [step, setStep] = useState<RescheduleStep>(initialStep);
  const [dayIdx, setDayIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    actions
      .load(appointmentId)
      .then((r) => alive && setRes(r))
      .catch(() => alive && setRes({ ok: false, error: "Das hat leider nicht geklappt. Bitte versuchen Sie es erneut." }));
    return () => {
      alive = false;
    };
  }, [appointmentId, reload, actions]);

  if (!res) {
    return (
      <div className="space-y-3 p-5" aria-busy="true">
        <div className="h-16 animate-pulse rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)]" />
        <div className="h-28 animate-pulse rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)]" />
      </div>
    );
  }
  if (!res.ok) {
    return <p className="p-5 text-sm text-[color:var(--muted)]">{res.error}</p>;
  }

  const d = res.data;
  const days: { key: string; label: string; slots: typeof d.slots }[] = [];
  for (const s of d.slots) {
    const k = dayKey(s.start);
    const g = days.find((x) => x.key === k);
    if (g) g.slots.push(s);
    else days.push({ key: k, label: longDay(s.start), slots: [s] });
  }
  const idx = Math.min(dayIdx, Math.max(0, days.length - 1));
  const day = days[idx];
  const who = d.name ?? "Der Kontakt";
  const channels = [d.notify.whatsapp ? "WhatsApp" : null, d.notify.email ? "E-Mail" : null].filter(Boolean).join(" und ");

  const move = () => {
    if (!picked) return;
    const start = picked;
    startTransition(async () => {
      const r = await actions.reschedule(d.id, start);
      if (!r.ok) {
        toast.show({ message: r.error, tone: "error" });
        if (r.code === "taken") {
          setPicked(null);
          setRes(null);
          setReload((n) => n + 1);
        }
        return;
      }
      toast.show({ message: `Termin verschoben auf ${shortWhen(r.start ?? start)}` });
      onDone();
    });
  };
  const cancel = () =>
    startTransition(async () => {
      const r = await actions.cancel(d.id);
      if (!r.ok) {
        toast.show({ message: r.error, tone: "error" });
        return;
      }
      toast.show({ message: "Termin abgesagt" });
      onDone();
    });

  const ModeIcon = d.mode === "video" ? Video : Phone;
  const current = (
    <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-4 py-3" data-current-appointment>
      <ModeIcon className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--brand)]" />
      <div className="min-w-0">
        <div className="text-xs text-[color:var(--muted)]">{d.name ? `Aktueller Termin mit ${d.name}` : "Aktueller Termin"}</div>
        <div className="font-semibold">
          {longDay(d.startsAt)}, {clock(d.startsAt)} Uhr
        </div>
        <div className="text-xs text-[color:var(--muted)]">
          {d.mode === "video" ? "Videocall" : "Telefonat"} · {d.durationMin} Minuten
        </div>
      </div>
    </div>
  );

  if (step === "cancel") {
    return (
      <div className="space-y-4 p-5" data-cancel-step>
        {current}
        <p className="text-sm">Möchten Sie diesen Termin wirklich absagen?</p>
        <p className="text-xs text-[color:var(--muted)]">
          {d.notify.email ? `${who} erhält eine Absage per E-Mail.` : `${who} wird nicht automatisch informiert. Bitte geben Sie kurz Bescheid.`} Der
          Kalendereintrag wird gelöscht.
        </p>
        {!d.canEdit ? <p className="text-xs text-[color:var(--muted)]">In der Vorschau sind Änderungen deaktiviert.</p> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {initialStep === "move" ? (
            <Button size="md" onClick={() => setStep("move")} disabled={pending}>
              Zurück
            </Button>
          ) : null}
          <Button variant="danger" size="md" icon={CalendarX} onClick={cancel} disabled={pending || !d.canEdit}>
            {pending ? "Wird abgesagt …" : "Ja, Termin absagen"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5" data-move-step>
      {current}
      {d.slotsError ? (
        <p className="text-sm text-[color:var(--muted)]">
          Freie Zeiten konnten gerade nicht geladen werden. {actions.calendarHint ?? "Bitte prüfen Sie unter „Mein Kalender“, ob Ihr Kalender verbunden ist."}
        </p>
      ) : !day ? (
        <p className="text-sm text-[color:var(--muted)]">In den nächsten zwei Wochen sind keine freien Lead-Zeiten mehr verfügbar.</p>
      ) : (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Button aria-label="Vorheriger Tag" onClick={() => setDayIdx(idx - 1)} disabled={idx === 0} icon={ChevronLeft} className="w-8 px-0" />
            <div className="min-w-0 flex-1 text-center">
              <div className="truncate text-sm font-semibold" data-day-label>
                {day.label}
              </div>
              <div className="text-[11px] text-[color:var(--muted)]">
                {day.slots.length === 1 ? "1 freie Zeit" : `${day.slots.length} freie Zeiten`}
              </div>
            </div>
            <Button aria-label="Nächster Tag" onClick={() => setDayIdx(idx + 1)} disabled={idx >= days.length - 1} icon={ChevronRight} className="w-8 px-0" />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Neue Uhrzeit">
            {day.slots.map((s) => {
              const on = picked === s.start;
              return (
                <button
                  key={s.start}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!d.canEdit || pending}
                  onClick={() => setPicked(on ? null : s.start)}
                  className={cn(
                    "h-11 rounded-[var(--radius-sm)] border text-sm font-semibold tabular-nums transition disabled:opacity-50",
                    on
                      ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white"
                      : "border-[color:var(--border)] bg-white hover:border-[color:var(--brand)]",
                  )}
                >
                  {clock(s.start)}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {!d.canEdit ? (
        <p className="text-xs text-[color:var(--muted)]">In der Vorschau sind Änderungen deaktiviert.</p>
      ) : (
        <p className="text-xs text-[color:var(--muted)]">
          {channels ? `${who} erhält die neue Zeit per ${channels}.` : `${who} wird nicht automatisch informiert. Bitte geben Sie kurz Bescheid.`}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:justify-between">
        <Button variant="primary" size="md" onClick={move} disabled={!picked || pending || !d.canEdit} className="w-full sm:w-auto">
          {pending ? "Wird verschoben …" : picked ? `Auf ${shortWhen(picked)} verschieben` : "Verschieben"}
        </Button>
        <Button variant="ghost" size="md" icon={CalendarX} onClick={() => setStep("cancel")} disabled={pending} className="text-rose-700 hover:text-rose-800">
          Termin absagen
        </Button>
      </div>
    </div>
  );
}
