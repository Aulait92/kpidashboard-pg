"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  countInvoicesAction,
  customerFootersAction,
  saveTaxNumberAction,
  type CustomerFooterState,
  type InvoiceCountState,
  type TaxNumberState,
} from "./actions";

export function TaxNumberForm({ initial }: { initial: string }) {
  const [state, action, pending] = useActionState<TaxNumberState, FormData>(saveTaxNumberAction, {});
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="text-sm font-medium" htmlFor="taxNumber">
          USt-IdNr. oder Steuernummer
        </label>
        <input id="taxNumber" name="taxNumber" defaultValue={initial} placeholder="z. B. DE123456789 oder 29/123/45678" className="input mt-1 w-full" />
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Mit USt-IdNr. steht „USt-IdNr.:“ auf der Rechnung, sonst „Steuernummer:“. Nach dem Speichern werden alle Stripe-Kunden automatisch aktualisiert.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary inline-flex items-center gap-2" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Speichern
        </button>
        {state.ok ? (
          <span className="flex items-center gap-1 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> {state.message ?? "Gespeichert"}
          </span>
        ) : null}
        {state.error ? <span className="text-sm text-rose-700">{state.error}</span> : null}
      </div>
    </form>
  );
}

export function CustomerFootersForm() {
  const [state, action, pending] = useActionState<CustomerFooterState, FormData>(customerFootersAction, {});
  const r = state.result;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <form action={action}>
          <input type="hidden" name="mode" value="dry" />
          <button className="btn-ghost inline-flex items-center gap-2" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Trockenlauf: betroffene Kunden zählen
          </button>
        </form>
        {r?.dryRun && r.affected > 0 ? (
          <form action={action}>
            <input type="hidden" name="mode" value="apply" />
            <button className="btn-primary inline-flex items-center gap-2" disabled={pending}>
              {r.affected === 1 ? "1 Kunden jetzt aktualisieren" : `Alle ${r.affected} Kunden jetzt aktualisieren`}
            </button>
          </form>
        ) : null}
      </div>
      {r ? (
        <p className="text-sm" role="status">
          {r.dryRun
            ? r.affected
              ? `${r.affected} von ${r.total} Stripe-Kunden haben noch nicht die aktuellen Pflichtangaben.`
              : `Alle ${r.total} Stripe-Kunden sind aktuell.`
            : `${r.updated} von ${r.affected} betroffenen Kunden aktualisiert${r.failed ? `, ${r.failed} fehlgeschlagen (erneut versuchen)` : ""}.`}
        </p>
      ) : null}
      {state.error ? <p className="text-sm text-rose-700">{state.error}</p> : null}
    </div>
  );
}

export function InvoiceCountForm() {
  const [state, action, pending] = useActionState<InvoiceCountState, FormData>(countInvoicesAction, {});
  const r = state.result;
  return (
    <div className="space-y-3">
      <form action={action}>
        <button className="btn-ghost inline-flex items-center gap-2" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Verschickte Rechnungen zählen
        </button>
      </form>
      {r ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm" role="status">
          <dt className="text-[color:var(--muted)]">Finalisierte Rechnungen</dt>
          <dd className="font-medium tabular-nums">{r.finalized}</dd>
          <dt className="text-[color:var(--muted)]">davon ohne neue Pflichtangaben</dt>
          <dd className="font-medium tabular-nums">{r.withoutFooter}</dd>
          <dt className="text-[color:var(--muted)]">davon vor heute verschickt</dt>
          <dd className="font-medium tabular-nums">{r.beforeToday}</dd>
          <dt className="text-[color:var(--muted)]">ohne Pflichtangaben und vor heute</dt>
          <dd className="font-medium tabular-nums">{r.withoutFooterBeforeToday}</dd>
          {r.truncated ? <dd className="col-span-2 text-amber-800">Nur die neuesten 10.000 Rechnungen gezählt.</dd> : null}
        </dl>
      ) : null}
      {state.error ? <p className="text-sm text-rose-700">{state.error}</p> : null}
    </div>
  );
}
