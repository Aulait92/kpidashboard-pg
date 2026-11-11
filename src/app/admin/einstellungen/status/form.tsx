"use client";

import { useActionState, useEffect, useRef } from "react";
import { STATUS_COMPONENTS } from "@/lib/status";
import { createIncidentAction, type IncidentFormState } from "./actions";

const INPUT =
  "w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";

export function IncidentForm() {
  const [state, action, pending] = useActionState<IncidentFormState, FormData>(createIncidentAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.savedAt, state.ok]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Überschrift</span>
        <input name="title" required maxLength={120} placeholder="z. B. Verzögerungen beim WhatsApp-Versand" className={INPUT} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Text</span>
        <textarea name="message" rows={3} maxLength={1000} placeholder="Was Kunden wissen sollten. Keine internen Details oder Fehlermeldungen." className={`${INPUT} resize-y`} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Art</span>
          <select name="level" defaultValue="degraded" className={INPUT}>
            <option value="degraded">Eingeschränkt</option>
            <option value="down">Störung</option>
            <option value="info">Hinweis (z. B. Wartung)</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Betrifft</span>
          <select name="component" defaultValue="" className={INPUT}>
            <option value="">Allgemein</option>
            {STATUS_COMPONENTS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-emerald-700">Meldung veröffentlicht.</p> : null}
      <button disabled={pending} className="rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        Auf der Statusseite veröffentlichen
      </button>
    </form>
  );
}
