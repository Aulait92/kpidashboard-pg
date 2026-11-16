"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import type { SourceResult } from "@/lib/calendar/sources";

type Action = (prev: SourceResult, fd: FormData) => Promise<SourceResult>;
const select = "w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-sm";
const NOTICE_LABEL: Record<number, string> = { 60: "1 Stunde", 120: "2 Stunden", 240: "4 Stunden", 720: "12 Stunden", 1440: "1 Tag", 2880: "2 Tage" };

/** Einstellungen eines Termintyps der Vertriebs-Buchungsseite (Admin). */
export function BookingTypeForm({
  action,
  type,
  durations,
  buffers,
  notices,
  windows,
}: {
  action: Action;
  type: { id: string; durationMin: number; bufferMin: number; noticeMin: number; bookingWindowDays: number; videoUrl: string | null; active: boolean };
  durations: readonly number[];
  buffers: readonly number[];
  notices: readonly number[];
  windows: readonly number[];
}) {
  const [state, formAction, pending] = useActionState<SourceResult, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-3" data-termintyp={type.id}>
      <input type="hidden" name="id" value={type.id} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block text-xs font-medium text-[color:var(--muted)]">
          Dauer
          <select name="durationMin" defaultValue={type.durationMin} className={`${select} mt-1`}>
            {durations.map((d) => (
              <option key={d} value={d}>
                {d} Min.
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-[color:var(--muted)]">
          Puffer
          <select name="bufferMin" defaultValue={type.bufferMin} className={`${select} mt-1`}>
            {buffers.map((d) => (
              <option key={d} value={d}>
                {d ? `${d} Min.` : "keiner"}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-[color:var(--muted)]">
          Vorlauf
          <select name="noticeMin" defaultValue={type.noticeMin} className={`${select} mt-1`}>
            {notices.map((d) => (
              <option key={d} value={d}>
                {NOTICE_LABEL[d] ?? `${d} Min.`}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-[color:var(--muted)]" title="Interessenten sehen nur Zeiten in den nächsten N Tagen ab heute. Sie selbst buchen im Vertriebskontakt ohne Grenze.">
          Zeitraum
          <select name="bookingWindowDays" defaultValue={type.bookingWindowDays} className={`${select} mt-1`}>
            {windows.map((d) => (
              <option key={d} value={d}>
                {d} Tage
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        Fester Videolink, falls der Kalender keinen Meet- oder Teams-Link erzeugt
        <input name="videoUrl" type="url" defaultValue={type.videoUrl ?? ""} placeholder="https://" className={`${select} mt-1`} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={type.active} className="h-4 w-4" /> Online buchbar
        </label>
        <button type="submit" disabled={pending} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm font-semibold">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Speichern
        </button>
        {state.error ? <span className="text-sm text-rose-700">{state.error}</span> : state.info ? <span className="text-sm text-emerald-700">{state.info}</span> : null}
      </div>
    </form>
  );
}
