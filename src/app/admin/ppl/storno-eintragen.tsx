"use client";

import { useActionState } from "react";
import { adminStornoAction, undoStornoAction, type AdminStornoState } from "./actions";

const input = "h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm";

/** „Storno eintragen“ (Admin, sofort anerkannt): Grund aus dem Bezug oder frei, optional Notiz. */
export function StornoEintragen({ leadId, reasons, outsideWindow }: { leadId: string; reasons: string[]; outsideWindow: boolean }) {
  const [state, action, pending] = useActionState<AdminStornoState, FormData>(adminStornoAction, {});
  const listId = `storno-gruende-${leadId}`;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-[color:var(--brand)]">Storno eintragen</summary>
      <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="leadId" value={leadId} />
        <input name="reason" list={listId} required placeholder="Grund (Liste oder frei)" className={`${input} w-56`} />
        <datalist id={listId}>
          {[...new Set([...reasons, "Sonstiges"])].map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <input name="note" placeholder="Notiz (optional), z. B. Abrechnungsmail vom …" className={`${input} w-72`} />
        <button disabled={pending} className="h-9 rounded-[var(--radius-sm)] bg-rose-600 px-3 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? "…" : "Storno eintragen"}
        </button>
        {outsideWindow ? <span className="text-xs text-amber-700">Außerhalb des Storno-Fensters, wird trotzdem anerkannt.</span> : null}
      </form>
      {state.error ? <p className="mt-1 text-xs text-rose-700">{state.error}</p> : null}
      {state.message ? <p className="mt-1 text-xs text-emerald-700">{state.message}</p> : null}
    </details>
  );
}

export function StornoZuruecknehmen({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState<AdminStornoState, FormData>(undoStornoAction, {});
  return (
    <form action={action} className="text-sm">
      <input type="hidden" name="leadId" value={leadId} />
      <button
        disabled={pending}
        onClick={(e) => {
          if (!confirm("Storno zurücknehmen? Gutschrift und Storno-Status werden entfernt.")) e.preventDefault();
        }}
        className="text-xs font-medium text-[color:var(--muted)] hover:text-rose-700"
      >
        Storno zurücknehmen
      </button>
      {state.error ? <p className="mt-1 text-xs text-rose-700">{state.error}</p> : null}
      {state.message ? <p className="mt-1 text-xs text-emerald-700">{state.message}</p> : null}
    </form>
  );
}
