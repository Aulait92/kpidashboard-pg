"use client";

import { useActionState } from "react";
import { nachholenAction, type NachholenState } from "./nachholen-actions";

/** Lead aus Airtable nachholen (Umstellungsphase): Lead-Nr. eingeben, er läuft durch den normalen Eingang. */
export function AirtableNachholen() {
  const [state, action, pending] = useActionState<NachholenState, FormData>(nachholenAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 border-b border-[color:var(--border)] px-5 py-3 text-sm">
      <span className="text-[color:var(--muted)]">Lead aus Airtable nachholen</span>
      <input name="leadNr" inputMode="numeric" placeholder="Lead-Nr., z. B. 3587" className="h-9 w-40 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2" required />
      <button disabled={pending} className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 font-semibold hover:bg-[color:var(--surface-sunken)]">
        {pending ? "Holt …" : "Holen und verteilen"}
      </button>
      {state.error ? <span className="text-rose-700">{state.error}</span> : null}
      {state.message ? <span className="text-emerald-700">{state.message}</span> : null}
    </form>
  );
}
