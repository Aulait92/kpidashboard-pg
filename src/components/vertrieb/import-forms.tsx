"use client";

import { useActionState, useState } from "react";
import { connectCalendlyAction, importColdCrmAction, replaceColdCrmAction, importContactsAction, importInstantlyAction, syncCalendlyAction, syncInstantlyAction, type ImportState } from "@/app/admin/vertrieb/actions";

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

/** Neu-Import: ersetzt alle Vertriebsdaten (nur in der Testumgebung freigeschaltet). */
export function ColdCrmReplace({ source = "cold" }: { source?: "cold" | "staging" }) {
  const [state, action, pending] = useActionState(replaceColdCrmAction, null);
  const from = source === "staging" ? "der Testumgebung (staging)" : "dem Cold CRM";
  return (
    <form action={action} className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/60 p-4">
      <input type="hidden" name="source" value={source} />
      <p className="text-sm font-medium text-rose-800">Neu-Import: ersetzt alle Vertriebsdaten</p>
      <p className="text-sm text-slate-600">
        Löscht hier alle Kontakte, Verlauf, Aufgaben, Kampagnen, Termine, Leads und Angebote im Vertrieb und holt alles frisch aus
        {" "}{from}. Vorher wird alles in eine Sicherung in der Datenbank kopiert. Kunden bleiben erhalten
        {source === "staging" ? "; Verknüpfungen zu Kundenakten werden danach neu gesetzt (am Kontakt „Mit Kundenakte verknüpfen“)." : "."}
      </p>
      <label className="block text-sm">
        Zur Bestätigung <b>ERSETZEN</b> eintippen
        <input name="confirm" autoComplete="off" className="input mt-1" placeholder="ERSETZEN" />
      </label>
      <button className="btn-primary bg-rose-600 hover:bg-rose-700" disabled={pending}>{pending ? "Ersetze … (kann 1–2 Min. dauern)" : "Vertrieb neu importieren"}</button>
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

/** Adresse mit Kopier-Knopf (Webhook-URLs auf der Seite „Anbindungen“). */
export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="input min-w-0 flex-1 font-mono text-xs" aria-label="Adresse" />
      <button
        type="button"
        className="btn-ghost shrink-0"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* Zwischenablage gesperrt: Feld ist markierbar */
          }
        }}
      >
        {copied ? "Kopiert" : "Kopieren"}
      </button>
    </div>
  );
}
