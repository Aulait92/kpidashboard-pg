"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { d360AssignAction, d360ResetAction, type D360AssignState } from "./d360-actions";

type Free = { id: string; phone: string | null; name: string | null; clientName: string | null; availability: string | null; createdAt: string | null };

/** Admin: 360dialog-Nummer finden („Verbindung prüfen“) oder eine freie Nummer von Hand zuordnen. */
export function D360Assign({ customerId, free, resettable }: { customerId: string; free: Free[]; resettable?: string | null }) {
  const [state, action, pending] = useActionState<D360AssignState, FormData>(d360AssignAction, {});
  const [resetState, resetAction, resetting] = useActionState<D360AssignState, FormData>(d360ResetAction, {});
  return (
    <div className="space-y-3 text-sm" data-d360-assign>
      <form action={action}>
        <input type="hidden" name="customerId" value={customerId} />
        <button type="submit" disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 font-medium hover:bg-[color:var(--surface-sunken)]">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Verbindung prüfen (Kunden-ID bzw. Login-E-Mail)
        </button>
      </form>
      {resettable ? (
        <form
          action={resetAction}
          onSubmit={(e) => {
            if (!confirm("Halb fertige WhatsApp-Verbindung dieses Kunden zurücksetzen? Das 360dialog-Konto selbst bleibt bestehen.")) e.preventDefault();
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="customerId" value={customerId} />
          <span className="text-[color:var(--muted)]">Stand: {resettable}</span>
          <button type="submit" disabled={resetting} className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-rose-200 bg-white px-3 text-xs font-medium text-rose-700 hover:bg-rose-50">
            {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Verbindung zurücksetzen
          </button>
        </form>
      ) : null}
      {resetState.message ? <p className="font-medium text-emerald-700">{resetState.message}</p> : null}
      {resetState.error ? <p className="font-medium text-rose-700">{resetState.error}</p> : null}
      {state.message ? <p className="font-medium text-emerald-700">{state.message}</p> : null}
      {state.error ? <p className="font-medium text-rose-700">{state.error}</p> : null}
      {free.length ? (
        <div>
          <p className="mb-1 text-[color:var(--muted)]">Freie Nummern bei 360dialog (keinem Kunden zugeordnet):</p>
          <ul className="divide-y divide-[color:var(--border)] rounded-[var(--radius-sm)] border border-[color:var(--border)]">
            {free.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  <b>{c.phone ? `+${c.phone.replace(/^\+/, "")}` : "ohne Nummer"}</b>
                  {c.name ? ` · ${c.name}` : ""}
                  {c.clientName ? ` · Kunde bei 360dialog: ${c.clientName}` : ""}
                  {c.availability ? ` · ${c.availability}` : ""}
                  {c.createdAt ? ` · ${c.createdAt.slice(0, 10)}` : ""}
                </span>
                <form action={action}>
                  <input type="hidden" name="customerId" value={customerId} />
                  <input type="hidden" name="channelId" value={c.id} />
                  <button type="submit" disabled={pending} className="rounded-[var(--radius-sm)] border border-[color:var(--border)] px-2 py-1 text-xs font-medium hover:bg-[color:var(--surface-sunken)]">
                    Diesem Kunden zuordnen
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[color:var(--muted)]">Keine freien Nummern bei 360dialog (bzw. Partner-Zugang nicht erreichbar).</p>
      )}
    </div>
  );
}
