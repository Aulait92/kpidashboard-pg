"use client";

import { useActionState, useState } from "react";
import { FileDrop } from "@/components/ui/file-drop";
import { backfillContactDataAction, connectCalendlyAction, instantlyNachholenAction, importColdCrmAction, replaceColdCrmAction, importContactsAction, importInstantlyAction, syncCalendlyAction, syncInstantlyAction, type ImportState } from "@/app/admin/vertrieb/actions";

// Server-Action-Grenze liegt bei 16 MB (next.config.ts)
const CSV_MAX_BYTES = 15 * 1024 * 1024;

function Result({ state }: { state: ImportState }) {
  if (!state) return null;
  return <p className={`text-sm ${state.ok ? "text-emerald-700" : "text-rose-600"}`}>{state.message}</p>;
}

export function ContactsImport() {
  const [state, action, pending] = useActionState(importContactsAction, null);
  return (
    <form action={action} className="space-y-3">
      <FileDrop name="file" accept=".csv,text/csv" maxBytes={CSV_MAX_BYTES} label="CSV auswählen" pendingLabel="Wird importiert …" required />
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

/**
 * Fehlende Instantly-Antworten der letzten 90 Tage (alle Postfächer und Kampagnen): erst Vorschau
 * mit Anzahl und Liste, dann nachholen. Mehrfach ausführbar, schon Vorhandenes wird erkannt.
 */
export function InstantlyNachholen({ hasKey }: { hasKey: boolean }) {
  const [state, action, pending] = useActionState(instantlyNachholenAction, null);
  const r = state?.ergebnis;
  const preview = r && !r.angewendet;
  return (
    <details className="text-sm" data-instantly-nachholen>
      <summary className="cursor-pointer text-slate-500">Fehlende Antworten nachholen (90 Tage)</summary>
      <form action={action} className="mt-2 space-y-3">
        <div className="flex flex-wrap gap-2">
          <button name="mode" value="vorschau" className="btn-ghost" disabled={pending || !hasKey}>
            {pending ? "Prüfe … (kann 1 Min. dauern)" : "Vorschau"}
          </button>
          {preview && r.fehlend > 0 && (
            <button name="mode" value="anwenden" className="btn-primary" disabled={pending}>
              {r.fehlend.toLocaleString("de-DE")} nachholen
            </button>
          )}
        </div>
        <Result state={state} />
        {r && (
          <p className="text-xs text-slate-500">
            {r.gelesen.toLocaleString("de-DE")} empfangen, {r.schonImCrm.toLocaleString("de-DE")} schon im CRM
            {r.gesperrt ? `, ${r.gesperrt} gesperrt` : ""}
            {r.ignoriert ? `, ${r.ignoriert} aus ausgeblendeten Kampagnen` : ""}
            {r.automatisch ? `, ${r.automatisch} automatische Antworten` : ""}
            {r.ohneKampagne ? `, ${r.ohneKampagne} ohne Kampagne` : ""}
          </p>
        )}
        {preview && r.liste.length > 0 && (
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {r.liste.map((x, i) => (
              <li key={`${x.lead}-${x.at}-${i}`} className="space-y-0.5 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium text-slate-800">{x.lead}</span>
                  {x.kontakt === "neu" && <span className="badge bg-sky-50 text-sky-700">neu</span>}
                  {x.spaeter && <span className="badge bg-amber-50 text-amber-700">später</span>}
                </div>
                <div className="truncate text-slate-500">
                  {new Date(x.at).toLocaleDateString("de-DE")} · {x.postfach ?? "?"}
                  {x.kampagne ? ` · ${x.kampagne}` : ""}
                  {x.betreff ? ` · ${x.betreff}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </form>
    </details>
  );
}

/** Einmalig rückwirkend: Kontaktdaten aus vorhandenen Mails und Buchungen ergänzen (idempotent). */
export function ContactDataBackfill() {
  const [state, action, pending] = useActionState(backfillContactDataAction, null);
  return (
    <form action={action} className="space-y-2" data-kontaktdaten-rueckwirkend>
      <button className="btn-ghost" disabled={pending}>{pending ? "Ergänze … (kann einige Minuten dauern)" : "Kontaktdaten aus Mails und Buchungen ergänzen"}</button>
      <Result state={state} />
    </form>
  );
}

export function InstantlyCsvImport() {
  const [state, action, pending] = useActionState(importInstantlyAction, null);
  return (
    <form action={action} className="space-y-3">
      <input name="campaign" placeholder="Kampagnenname (falls nicht in der CSV)" className="input" />
      <FileDrop name="file" accept=".csv,text/csv" maxBytes={CSV_MAX_BYTES} label="CSV auswählen" pendingLabel="Wird importiert …" required />
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
