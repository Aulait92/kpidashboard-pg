"use client";

import { useActionState } from "react";
import { Check, Loader2, Wrench, X } from "lucide-react";
import { d360AssignAction, d360RepairAction, d360ResetAction, type D360AssignState } from "./d360-actions";

type Free = { id: string; phone: string | null; name: string | null; clientName: string | null; availability: string | null; createdAt: string | null };

/**
 * Admin: WhatsApp-Verbindung eines Kunden (Admin v2 A5, Ole 18.11.2026). Eine Hauptaktion „Verbindung reparieren“ (Nummer
 * suchen bzw. Webhook neu setzen, notfalls neuer Key, Vorlagen abgleichen), Ergebnis je Schritt ein Satz. Nur ohne
 * Verbindung darunter: halb fertige Verbindung zurücksetzen und eine freie 360dialog-Nummer von Hand zuordnen.
 */
export function D360Assign({ customerId, free, resettable, verbunden }: { customerId: string; free: Free[]; resettable?: string | null; verbunden?: boolean }) {
  const [repair, repairAction, repairing] = useActionState<D360AssignState, FormData>(d360RepairAction, {});
  const [state, action, pending] = useActionState<D360AssignState, FormData>(d360AssignAction, {});
  const [resetState, resetAction, resetting] = useActionState<D360AssignState, FormData>(d360ResetAction, {});
  return (
    <div className="space-y-3 text-sm" data-d360-assign>
      <form action={repairAction} data-funktion="d360-actions-d360repairaction--verbindung-reparieren">
        <input type="hidden" name="customerId" value={customerId} />
        <button
          type="submit"
          disabled={repairing}
          data-verbindung-reparieren
          className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-4 font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {repairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
          Verbindung reparieren
        </button>
      </form>
      {repair.schritte?.length ? (
        <ul className="space-y-1.5" data-reparatur-ergebnis={repair.ok ? "ok" : "fehler"}>
          {repair.schritte.map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              {s.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />}
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {repair.error && !repair.schritte?.length ? <p className="font-medium text-rose-700">{repair.error}</p> : null}
      {verbunden ? null : (
        <>
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
            <details className="group">
              <summary className="cursor-pointer text-[color:var(--muted)] hover:text-[color:var(--foreground)]">Freie Nummern bei 360dialog von Hand zuordnen ({free.length})</summary>
              <ul className="mt-2 divide-y divide-[color:var(--border)] rounded-[var(--radius-sm)] border border-[color:var(--border)]">
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
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
