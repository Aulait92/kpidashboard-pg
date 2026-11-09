"use client";

import { useActionState } from "react";
import { connectCalendlyAction, importColdCrmAction, importContactsAction, importInstantlyAction, syncCalendlyAction, syncInstantlyAction, type ImportState } from "@/app/admin/vertrieb/actions";

function Result({ state }: { state: ImportState }) {
  if (!state) return null;
  return <p className={`text-sm ${state.ok ? "text-emerald-700" : "text-rose-600"}`}>{state.message}</p>;
}

export function ContactsImport() {
  const [state, action, pending] = useActionState(importContactsAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="file" name="file" accept=".csv,text/csv" className="input" required />
      <button className="btn-primary" disabled={pending}>{pending ? "Importiere … (kann 1 Min. dauern)" : "Agenturliste importieren"}</button>
      <Result state={state} />
    </form>
  );
}

export function ColdCrmImport({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(importColdCrmAction, null);
  return (
    <form action={action} className="space-y-3">
      <button className="btn-primary" disabled={pending || !configured}>{pending ? "Übernehme …" : "Daten aus Cold CRM übernehmen"}</button>
      {!configured && <p className="text-sm text-amber-700">COLD_CRM_DATABASE_URL ist nicht gesetzt.</p>}
      <Result state={state} />
    </form>
  );
}

export function InstantlySync({ hasKey }: { hasKey: boolean }) {
  const [state, action, pending] = useActionState(syncInstantlyAction, null);
  return (
    <form action={action} className="space-y-3">
      <button className="btn-primary" disabled={pending || !hasKey}>{pending ? "Synchronisiere …" : "Jetzt mit Instantly abgleichen"}</button>
      {!hasKey && <p className="text-sm text-amber-700">INSTANTLY_API_KEY ist nicht gesetzt.</p>}
      <Result state={state} />
    </form>
  );
}

export function InstantlyCsvImport() {
  const [state, action, pending] = useActionState(importInstantlyAction, null);
  return (
    <form action={action} className="space-y-3">
      <input name="campaign" placeholder="Kampagnenname (falls nicht in der CSV)" className="input" />
      <input type="file" name="file" accept=".csv,text/csv" className="input" required />
      <button className="btn-ghost" disabled={pending}>{pending ? "Importiere …" : "Instantly-CSV importieren"}</button>
      <Result state={state} />
    </form>
  );
}

export function CalendlyForms({ hasToken }: { hasToken: boolean }) {
  const [cState, connect, cPending] = useActionState(connectCalendlyAction, null);
  const [sState, sync, sPending] = useActionState(syncCalendlyAction, null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <form action={connect}>
          <button className="btn-primary" disabled={cPending || !hasToken}>{cPending ? "Verbinde …" : "1. Calendly verbinden"}</button>
        </form>
        <form action={sync}>
          <button className="btn-ghost" disabled={sPending || !hasToken}>{sPending ? "Gleiche ab …" : "2. Bestehende Termine abgleichen"}</button>
        </form>
      </div>
      {!hasToken && <p className="text-sm text-amber-700">CALENDLY_TOKEN ist nicht gesetzt.</p>}
      <Result state={cState} />
      <Result state={sState} />
    </div>
  );
}
