"use client";

import { useActionState } from "react";
import { Loader2, PauseCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { endPauseAction, planPauseAction, type PauseFormState } from "./actions";

const input =
  "h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";
const btn =
  "inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] px-5 text-[15px] font-semibold transition disabled:opacity-60";

export function PauseCard({
  pause,
  today,
  minDate,
  softwareFeeText,
  readOnly,
}: {
  pause: { status: string; startsAt: string; endsAt: string | null } | null;
  today: string;
  minDate: string;
  softwareFeeText: string;
  readOnly: boolean;
}) {
  const [planState, plan, planning] = useActionState<PauseFormState, FormData>(planPauseAction, {});
  const [endState, end, ending] = useActionState<PauseFormState, FormData>(endPauseAction, {});
  const d = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

  return (
    <Card>
      <CardHeader title="Pause / Urlaub" icon={PauseCircle} />
      <div className="space-y-4 p-5">
        {pause ? (
          <>
            <div className={`rounded-[var(--radius-md)] px-4 py-3 text-[15px] ${pause.status === "active" ? "bg-amber-50 text-amber-900" : "bg-sky-50 text-sky-900"}`}>
              {pause.status === "active" ? (
                <>
                  <b>Pausiert</b> seit {d(pause.startsAt)}
                  {pause.endsAt ? `, Neustart am ${d(pause.endsAt)}` : ", bis Sie fortsetzen"}.
                </>
              ) : (
                <>
                  <b>Pause geplant</b> ab {d(pause.startsAt)}
                  {pause.endsAt ? `, Neustart am ${d(pause.endsAt)}` : ", bis Sie fortsetzen"}.
                </>
              )}
            </div>
            <form action={end} className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={ending || readOnly} className={`${btn} bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-dark)]`}>
                {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {pause.status === "active" ? "Jetzt fortsetzen" : "Geplante Pause absagen"}
              </button>
              {endState.error ? <span className="text-sm font-medium text-rose-700">{endState.error}</span> : null}
            </form>
          </>
        ) : (
          <>
            <p className="text-sm text-[color:var(--muted)]">
              Urlaub oder volle Auslastung? Pausieren Sie die Anzeigen. {softwareFeeText} Zum Neustart-Termin laufen die
              Anzeigen automatisch wieder an.
            </p>
            {planState.ok ? <p className="text-sm font-medium text-emerald-700">Pause eingetragen.</p> : null}
            <form action={plan} className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm font-medium">Pause ab</span>
                <input type="date" name="from" required min={minDate} defaultValue={minDate > today ? minDate : today} className={input} />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Neustart am (optional)</span>
                <input type="date" name="until" min={minDate} className={input} />
              </label>
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-sm font-medium">Grund (optional)</span>
                <input name="reason" placeholder="z. B. Urlaub, volle Auslastung" className={input} />
              </label>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                <button type="submit" disabled={planning || readOnly} className={`${btn} bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-dark)]`}>
                  {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Pause eintragen
                </button>
                {planState.error ? <span className="text-sm font-medium text-rose-700">{planState.error}</span> : null}
              </div>
            </form>
          </>
        )}
      </div>
    </Card>
  );
}
