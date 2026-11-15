"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { d360AssignAction, type D360AssignState } from "./d360-actions";

type Free = { id: string; phone: string | null; name: string | null; clientName: string | null; availability: string | null; createdAt: string | null };

/** Admin: 360dialog-Nummer finden („Verbindung prüfen“) oder eine freie Nummer von Hand zuordnen. */
export function D360Assign({ customerId, free }: { customerId: string; free: Free[] }) {
  const [state, action, pending] = useActionState<D360AssignState, FormData>(d360AssignAction, {});
  return (
    <div className="space-y-3 text-sm" data-d360-assign>
      <form action={action}>
        <input type="hidden" name="customerId" value={customerId} />
        <button type="submit" disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 font-medium hover:bg-[color:var(--surface-sunken)]">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Verbindung prüfen (Kunden-ID bzw. Login-E-Mail)
        </button>
      </form>
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
