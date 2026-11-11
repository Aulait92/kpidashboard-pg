"use client";

// „Ich bin abwesend“: Eintragen/Ändern als Fenster (Handy: von unten), danach
// direkt die Folgen – Termine im Zeitraum (alle verschieben, an Vertretung
// übergeben, einzeln), verschobene Aufgaben (rückgängig) und bei Einzel-
// Vertretern ab 7 Tagen das Angebot, die Anzeigen zu pausieren.

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CalendarClock, CalendarX2, Check, Loader2, PauseCircle, Plane, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { AbsenceView } from "@/lib/absence";
import type { AbsenceOverview } from "@/lib/absence-flow";
import {
  endAbsenceAction,
  handoverAbsenceAction,
  pauseAdsForAbsenceAction,
  rescheduleAbsenceAction,
  saveAbsenceAction,
  undoAbsenceTasksAction,
} from "@/app/buyer/absence-actions";

export type AbsencePerson = { userId: string; name: string; isMe: boolean };
export type AbsenceColleague = { id: string; name: string };

/** Daten für Banner + Fenster in der App-Shell (null = Admin-Vorschau). */
export type ShellAbsence = {
  person: AbsencePerson;
  current: AbsenceView | null;
  colleagues: AbsenceColleague[];
  today: string;
};

const KINDS = [
  { key: "urlaub", label: "Urlaub" },
  { key: "krank", label: "Krank" },
  { key: "sonstiges", label: "Sonstiges" },
] as const;

/** „Fr., 22.11.“ */
export function dayShort(ymd: string): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(`${ymd}T12:00:00Z`));
}

const timeShort = (iso: string) =>
  `${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))} Uhr`;

const input =
  "h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20 disabled:bg-[color:var(--surface-sunken)]";

export function AbsenceSheet({
  open,
  onClose,
  person,
  current,
  colleagues,
  today,
}: {
  open: boolean;
  onClose: () => void;
  person: AbsencePerson;
  current: AbsenceView | null;
  colleagues: AbsenceColleague[];
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState(current?.from ?? today);
  const [to, setTo] = useState(current?.to ?? today);
  const [kind, setKind] = useState<string>(current?.kind ?? "urlaub");
  const [sub, setSub] = useState(current?.substituteUserId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<AbsenceOverview | null>(null);
  // Termine, die erledigt sind (verschoben/übergeben/selbst klären)
  const [done, setDone] = useState<Record<string, string>>({});
  const [tasksUndone, setTasksUndone] = useState(false);
  const [paused, setPaused] = useState(false);

  const who = person.isMe ? "Du" : person.name;
  const subName = (id: string | null | undefined) => colleagues.find((c) => c.id === id)?.name ?? null;

  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveAbsenceAction({ absenceId: current?.id ?? null, userId: person.userId, from, to, kind, substituteUserId: sub || null });
      if (!res.ok) return setError(res.error);
      setOverview(res.data);
      router.refresh();
    });

  const end = () =>
    start(async () => {
      if (!current) return;
      const res = await endAbsenceAction(current.id);
      if (!res.ok) return setError(res.error);
      toast.show({ message: current.active ? (person.isMe ? "Willkommen zurück!" : `${person.name} ist wieder da`) : "Abwesenheit gelöscht" });
      onClose();
      router.refresh();
    });

  const reschedule = (ids: string[] | null) =>
    start(async () => {
      if (!overview) return;
      const res = await rescheduleAbsenceAction(overview.absence.id, ids);
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      const next = { ...done };
      for (const m of res.data.moved) next[m.id] = `verschoben auf ${timeShort(m.newStart)}`;
      setDone(next);
      toast.show({
        message: res.data.failed.length
          ? `${res.data.moved.length} verschoben, ${res.data.failed.length} ohne freie Zeit – bitte einzeln klären`
          : `${res.data.moved.length === 1 ? "Termin" : `${res.data.moved.length} Termine`} verschoben, Kontakte sind informiert`,
        tone: res.data.failed.length ? "error" : undefined,
      });
      router.refresh();
    });

  const handover = (ids: string[] | null) =>
    start(async () => {
      if (!overview) return;
      const res = await handoverAbsenceAction(overview.absence.id, ids);
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      const next = { ...done };
      const name = overview.absence.substituteName ?? "Vertretung";
      for (const id of res.data.handedOver) next[id] = `an ${name} übergeben`;
      setDone(next);
      toast.show({
        message: res.data.failed.length ? `${res.data.handedOver.length} übergeben, ${res.data.failed.length} nicht möglich` : `An ${name} übergeben`,
        tone: res.data.failed.length ? "error" : undefined,
      });
      router.refresh();
    });

  const undoTasks = () =>
    start(async () => {
      if (!overview) return;
      const res = await undoAbsenceTasksAction(overview.absence.id);
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      setTasksUndone(true);
      toast.show({ message: "Aufgaben wieder wie vorher" });
      router.refresh();
    });

  const pauseAds = () =>
    start(async () => {
      if (!overview) return;
      const res = await pauseAdsForAbsenceAction(overview.absence.id);
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      setPaused(true);
      toast.show({ message: "Anzeigen-Pause eingetragen" });
      router.refresh();
    });

  // ─── Schritt 2: Folgen ───────────────────────────────────────────────
  if (overview) {
    const a = overview.absence;
    const open_ = overview.appointments.filter((x) => !done[x.id]);
    const anyHandover = !!a.substituteUserId && open_.some((x) => x.canHandover);
    const t = overview.tasks;
    return (
      <Sheet open={open} onClose={onClose} title={person.isMe ? "Abwesenheit eingetragen" : `${person.name}: Abwesenheit eingetragen`}>
        <div className="max-h-[70dvh] space-y-4 overflow-y-auto p-5">
          <div className="flex gap-3 rounded-[var(--radius-md)] bg-[color:var(--brand-soft)] px-4 py-3 text-[15px] text-[color:var(--brand-dark)]">
            <Check className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <b>
                {who} {person.isMe ? "bist" : "ist"} {a.from === a.to ? `am ${dayShort(a.from)}` : `vom ${dayShort(a.from)} bis ${dayShort(a.to)}`} abwesend.
              </b>{" "}
              In der Zeit {person.isMe ? "bekommst du" : "bekommt"} keine neuen Leads und keine Termine. Ab {dayShort(a.returnDay)} geht es normal weiter.
            </div>
          </div>

          {overview.appointments.length ? (
            <section>
              <h3 className="text-[15px] font-semibold">
                {overview.appointments.length === 1 ? "1 Termin" : `${overview.appointments.length} Termine`} in dieser Zeit
              </h3>
              {open_.length ? (
                <>
                  <p className="mt-0.5 text-sm text-[color:var(--muted)]">
                    Beim Verschieben bekommt der Kontakt die neue Zeit nach der Rückkehr per E-Mail und WhatsApp, mit Link zum Umbuchen.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Button variant="primary" size="md" icon={CalendarClock} disabled={pending} onClick={() => reschedule(open_.map((x) => x.id))}>
                      Alle verschieben
                    </Button>
                    {anyHandover ? (
                      <Button size="md" icon={UserRoundCheck} disabled={pending} onClick={() => handover(open_.filter((x) => x.canHandover).map((x) => x.id))}>
                        An {a.substituteName} übergeben
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : null}
              <ul className="mt-3 divide-y divide-[color:var(--border)] rounded-[var(--radius-md)] border border-[color:var(--border)]">
                {overview.appointments.map((x) => (
                  <li key={x.id} className="px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{x.leadName}</span>
                      <span className="shrink-0 text-xs text-[color:var(--muted)]">{x.mode === "video" ? "Video" : "Telefon"}</span>
                    </div>
                    <div className="text-sm text-[color:var(--muted)]">{timeShort(x.startsAt)}</div>
                    {done[x.id] ? (
                      <div className="mt-1 flex items-center gap-1 text-sm font-medium text-emerald-700">
                        <Check className="h-4 w-4" /> {done[x.id]}
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button disabled={pending} onClick={() => reschedule([x.id])}>
                          Verschieben
                        </Button>
                        {x.canHandover ? (
                          <Button disabled={pending} onClick={() => handover([x.id])}>
                            An {a.substituteName}
                          </Button>
                        ) : null}
                        <Button variant="ghost" disabled={pending} onClick={() => setDone({ ...done, [x.id]: "kläre ich selbst" })}>
                          Selbst klären
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="text-sm text-[color:var(--muted)]">Keine Termine in dieser Zeit.</p>
          )}

          {t.moved + t.transferred > 0 ? (
            <div className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-4 py-3 text-sm">
              <span>
                {tasksUndone
                  ? "Aufgaben sind wieder wie vorher."
                  : [
                      t.transferred ? `${t.transferred} an ${a.substituteName} übergeben` : null,
                      t.moved ? `${t.moved} auf ${dayShort(a.returnDay)} verschoben` : null,
                    ]
                      .filter(Boolean)
                      .join(", ")
                      .replace(/^/, "Wiedervorlagen und Rückrufe: ") + "."}
              </span>
              {!tasksUndone ? (
                <button type="button" disabled={pending} onClick={undoTasks} className="shrink-0 font-semibold text-[color:var(--brand)] hover:underline">
                  Rückgängig
                </button>
              ) : null}
            </div>
          ) : null}

          {overview.pauseHint && !paused ? (
            <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <div className="flex items-center gap-2 font-semibold">
                <PauseCircle className="h-4 w-4" /> Anzeigen pausieren?
              </div>
              <p className="mt-1">
                Du bist länger weg. Pausierst du die Anzeigen, kommen keine Leads, die warten müssten. Neustart am {dayShort(overview.pauseHint.until)}. Die
                Pause verlängert auch den Garantie-Zeitraum.
              </p>
              <Button className="mt-2" disabled={pending} onClick={pauseAds}>
                Anzeigen in dieser Zeit pausieren
              </Button>
            </div>
          ) : paused ? (
            <p className="text-sm font-medium text-emerald-700">Anzeigen-Pause eingetragen (siehe Konto).</p>
          ) : null}

          <Button variant={open_.length ? "secondary" : "primary"} size="md" className="w-full" onClick={onClose}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Fertig
          </Button>
        </div>
      </Sheet>
    );
  }

  // ─── Schritt 1: Eintragen/Ändern ─────────────────────────────────────
  const started = !!current?.active;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={current ? (person.isMe ? "Abwesenheit ändern" : `${person.name}: Abwesenheit ändern`) : person.isMe ? "Ich bin abwesend" : `${person.name} ist abwesend`}
      message={person.isMe ? "Keine neuen Leads und Termine in dieser Zeit. Gilt sofort." : "Keine neuen Leads und Termine für diese Person. Gilt sofort."}
    >
      <form
        className="max-h-[70dvh] space-y-4 overflow-y-auto p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Von</span>
            <input
              type="date"
              required
              value={from}
              min={started ? undefined : today}
              disabled={started}
              onChange={(e) => {
                setFrom(e.target.value);
                if (to < e.target.value) setTo(e.target.value);
              }}
              className={input}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Bis einschließlich</span>
            <input type="date" required value={to} min={from > today ? from : today} onChange={(e) => setTo(e.target.value)} className={input} />
          </label>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Grund</legend>
          <div className="mt-1 grid grid-cols-3 gap-2" role="radiogroup">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                role="radio"
                aria-checked={kind === k.key}
                onClick={() => setKind(k.key)}
                className={cn(
                  "h-11 rounded-[var(--radius-sm)] border text-[15px] font-medium transition",
                  kind === k.key
                    ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]"
                    : "border-[color:var(--border)] bg-white hover:border-[color:var(--border-strong)]",
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-[color:var(--muted)]">Nur die Kategorie, keine Details. Kontakte erfahren den Grund nie.</p>
        </fieldset>

        {colleagues.length ? (
          <label className="block space-y-1">
            <span className="text-sm font-medium">Vertretung (optional)</span>
            <select value={sub} onChange={(e) => setSub(e.target.value)} className={input}>
              <option value="">Keine Vertretung</option>
              {colleagues.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="block text-xs text-[color:var(--muted)]">
              {sub ? `${subName(sub)} übernimmt Wiedervorlagen und auf Wunsch Termine.` : "Ohne Vertretung rücken Aufgaben auf den Tag nach der Rückkehr."}
            </span>
          </label>
        ) : null}

        {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}

        <Button type="submit" variant="primary" size="md" className="w-full" icon={pending ? undefined : Plane} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {current ? "Änderung speichern" : "Abwesenheit eintragen"}
        </Button>
        {current ? (
          <Button type="button" variant="danger" size="md" className="w-full" icon={CalendarX2} disabled={pending} onClick={end}>
            {current.active ? (person.isMe ? "Ich bin wieder da" : "Abwesenheit beenden") : "Abwesenheit löschen"}
          </Button>
        ) : null}
      </form>
    </Sheet>
  );
}

/**
 * Banner + Fenster in der App-Shell. Öffnet sich über das Profilmenü
 * (Ereignis „pg-absence-open“). Banner nur während der Abwesenheit.
 */
export function AbsenceControl({ data }: { data: ShellAbsence }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("pg-absence-open", onOpen);
    return () => window.removeEventListener("pg-absence-open", onOpen);
  }, []);
  const cur = data.current;
  return (
    <>
      {cur?.active ? (
        <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-950">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1">
            <Plane className="h-4 w-4 shrink-0" />
            <span>
              Du bist bis <b>{dayShort(cur.to)}</b> abwesend
              {cur.substituteName ? `, ${cur.substituteName} vertritt dich` : ""}.
            </span>
            <span className="ml-auto flex gap-3">
              <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={() => setOpen(true)}>
                ändern
              </button>
              <button
                type="button"
                disabled={pending}
                className="font-semibold underline-offset-2 hover:underline"
                onClick={() =>
                  start(async () => {
                    const res = await endAbsenceAction(cur.id);
                    toast.show(res.ok ? { message: "Willkommen zurück!" } : { message: res.error, tone: "error" });
                    router.refresh();
                  })
                }
              >
                beenden
              </button>
            </span>
          </div>
        </div>
      ) : null}
      {/* Nur offen gemountet: jedes Öffnen startet frisch mit den aktuellen Daten */}
      {open ? <AbsenceSheet open onClose={() => setOpen(false)} person={data.person} current={cur} colleagues={data.colleagues} today={data.today} /> : null}
    </>
  );
}
