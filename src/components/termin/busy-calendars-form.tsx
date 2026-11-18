"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

type State = { ok?: boolean; error?: string };
type Action = (prev: State, fd: FormData) => Promise<State>;

/** Weitere Kalender nur für „belegt“ (Vertrieb). Selten gebraucht, deshalb zugeklappt. */
export function BusyCalendarsForm({ action, ids }: { action: Action; ids: string[] }) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, {});
  return (
    <details className="mt-3" data-weitere-kalender>
      <summary className="cursor-pointer text-sm text-[color:var(--brand)]">
        Weitere Kalender für „belegt“{ids.length ? `: ${ids.length}` : ""}
      </summary>
      <form action={formAction} className="mt-2 space-y-2">
        <label className="block text-xs font-medium text-[color:var(--muted)]">
          Kalender-Adressen, die nur Zeiten blockieren (z. B. Ihr bisheriger Kalender, für dieses Konto freigegeben)
          <input
            name="ids"
            defaultValue={ids.join(", ")}
            placeholder="name@beispiel.de"
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-sm font-medium">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Speichern
          </button>
          {state.ok ? <span className="text-sm text-emerald-700">Gespeichert</span> : null}
          {state.error ? <span className="text-sm text-red-700">{state.error}</span> : null}
        </div>
      </form>
    </details>
  );
}
