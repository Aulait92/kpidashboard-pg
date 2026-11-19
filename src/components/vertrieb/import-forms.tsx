"use client";

import { useActionState, useState, useTransition } from "react";
import { FileDrop } from "@/components/ui/file-drop";
import { LISTEN_GRUENDE, LISTEN_GRUND_LABEL, istVermittlerListe, summeUebersprungen, type ListenErgebnis } from "@/lib/vertrieb/vermittler-format";
import { backfillContactDataAction, connectCalendlyAction, instantlyNachholenAction, sperrenNachholenAction, importColdCrmAction, replaceColdCrmAction, importContactsAction, importInstantlyAction, syncCalendlyAction, syncInstantlyAction, type ImportState } from "@/app/admin/vertrieb/actions";

// Server-Action-Grenze liegt bei 16 MB (next.config.ts)
const CSV_MAX_BYTES = 15 * 1024 * 1024;

function Result({ state }: { state: ImportState }) {
  if (!state) return null;
  return <p className={`text-sm ${state.ok ? "text-emerald-700" : "text-rose-600"}`}>{state.message}</p>;
}

/**
 * Agenturliste (Numbers-Export) oder öffentlich gesammelte Vermittlerliste (Semikolon, erkannt an der Kopfzeile).
 * Die Vermittlerliste wird gleich nach der Auswahl geprüft (Trockenlauf) und erst mit dem Knopf angelegt.
 */
export function ContactsImport() {
  const [state, action, pending] = useActionState(importContactsAction, null);
  const [file, setFile] = useState<File | null>(null);
  const [liste, setListe] = useState(false);
  const [, startTransition] = useTransition();

  function senden(modus: "pruefen" | "importieren", f: File | null = file) {
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    fd.set("modus", modus);
    startTransition(() => action(fd));
  }

  async function waehlen(files: File[]) {
    const f = files[0] ?? null;
    setFile(f);
    const erkannt = f ? istVermittlerListe(await f.slice(0, 4096).text()) : false;
    setListe(erkannt);
    if (f && erkannt) senden("pruefen", f);
  }

  const r = state?.liste;
  const vorschau = liste && file && r && !r.angewendet ? r : null;
  const fertig = r?.angewendet ? r : null;
  return (
    <div className="space-y-3" data-kontakte-import>
      <FileDrop accept=".csv,text/csv" maxBytes={CSV_MAX_BYTES} label="CSV auswählen" value={file ? [file] : []} onFiles={waehlen} busy={pending} pendingLabel={liste && !vorschau ? "Wird geprüft …" : "Wird importiert …"} />
      {!liste && (
        <button className="btn-primary" disabled={pending || !file} onClick={() => senden("importieren")}>
          {pending ? "Importiere … (kann 1 Min. dauern)" : "Agenturliste importieren"}
        </button>
      )}
      {liste && pending && !vorschau && <p className="text-sm text-slate-500">Vermittlerliste erkannt, wird geprüft …</p>}
      {vorschau && <ListenVorschau r={vorschau} pending={pending} onImport={() => senden("importieren")} />}
      {fertig && <ListenVorschau r={fertig} />}
      {state?.message ? <Result state={state} /> : null}
    </div>
  );
}

/** Vorschau bzw. Ergebnis der Vermittlerliste: neu, übersprungen je Grund, je Gesellschaft. */
export function ListenVorschau({ r, pending = false, onImport }: { r: ListenErgebnis; pending?: boolean; onImport?: () => void }) {
  const zahl = (n: number) => n.toLocaleString("de-DE");
  const gruende = LISTEN_GRUENDE.filter((g) => r.uebersprungen[g] > 0);
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4 text-sm" data-vermittlerliste-vorschau>
      <p className="font-medium">
        Vermittlerliste · {zahl(r.zeilen)} Zeilen: <span className="text-emerald-700">{zahl(r.neu)} {r.angewendet ? "angelegt" : "neu"}</span>, {zahl(summeUebersprungen(r))} übersprungen
      </p>
      {gruende.length > 0 && (
        <ul className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-slate-600">
          {gruende.map((g) => (
            <li key={g} className="contents">
              <span>
                {LISTEN_GRUND_LABEL[g]}
                {g === "vorhanden" && r.ergaenzt > 0 ? ` (${zahl(r.ergaenzt)} mit leeren Feldern ergänzt)` : ""}
              </span>
              <span className="text-right tabular-nums">{zahl(r.uebersprungen[g])}</span>
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary className="cursor-pointer text-slate-500">Je Gesellschaft ({r.jeGesellschaft.length})</summary>
        <ul className="mt-2 grid max-h-72 grid-cols-[1fr_auto_auto] gap-x-4 gap-y-0.5 overflow-y-auto text-slate-600">
          <li className="contents text-xs text-slate-400">
            <span>Gesellschaft</span>
            <span className="text-right">neu</span>
            <span className="text-right">Zeilen</span>
          </li>
          {r.jeGesellschaft.map((g) => (
            <li key={g.name} className="contents">
              <span className="truncate">{g.name}</span>
              <span className="text-right tabular-nums">{zahl(g.neu)}</span>
              <span className="text-right tabular-nums text-slate-400">{zahl(g.zeilen)}</span>
            </li>
          ))}
        </ul>
      </details>
      {onImport && (
        <div className="space-y-1">
          <button className="btn-primary" disabled={pending || r.neu + r.ergaenzt === 0} onClick={onImport}>
            {pending ? "Importiere …" : r.neu > 0 ? `${zahl(r.neu)} Kontakte importieren` : `${zahl(r.ergaenzt)} Kontakte ergänzen`}
          </button>
          <p className="text-xs text-slate-500">Nichts wird verschickt; neue Kontakte landen in der Stufe „Neu“, die Gesellschaft steht als Versicherer.</p>
        </div>
      )}
    </div>
  );
}

/**
 * Tagesportion der Vermittlerliste für Instantly (CSV): gemischt nach Gesellschaft und Mail-Domain, je Ziel-Domain
 * höchstens N am Tag. Erneut am selben Tag: dieselbe Portion.
 */
export function InstantlyPortion({ proDomain }: { proDomain: number }) {
  return (
    <form method="post" action="/admin/vertrieb/import/instantly-portion" className="flex flex-wrap items-end gap-3" data-instantly-portion>
      <label className="text-sm">
        <span className="mb-1 block text-slate-500">Kontakte heute</span>
        <input name="menge" type="number" min={1} max={5000} defaultValue={500} className="input w-28" />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-500">je Domain höchstens</span>
        <input name="proDomain" type="number" min={1} max={500} defaultValue={proDomain} className="input w-28" />
      </label>
      <button className="btn-ghost">Portion herunterladen</button>
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

/**
 * Einmalig rückwirkend (Ole, 19.11.2026): bisherige Antworten mit Austragungswunsch, Widerspruch oder Datenschutzfrage
 * und Abmeldungen in Instantly auf „nie kontaktieren“ setzen. Erst Vorschau, dann sperren; mehrfach ausführbar.
 */
export function SperrenNachholen() {
  const [state, action, pending] = useActionState(sperrenNachholenAction, null);
  const r = state?.ergebnis;
  const neu = r ? r.neu.austragen + r.neu.widerspruch + r.neu.datenschutz : 0;
  return (
    <details className="text-sm" data-sperren-nachholen>
      <summary className="cursor-pointer text-slate-500">Austragungen aus bisherigen Antworten sperren</summary>
      <form action={action} className="mt-2 space-y-3">
        <div className="flex flex-wrap gap-2">
          <button name="mode" value="vorschau" className="btn-ghost" disabled={pending}>
            {pending ? "Prüfe …" : "Vorschau"}
          </button>
          {r && !r.angewendet && neu > 0 && (
            <button name="mode" value="anwenden" className="btn-primary" disabled={pending}>
              {neu.toLocaleString("de-DE")} sperren
            </button>
          )}
        </div>
        <Result state={state} />
        {r && (
          <p className="text-xs text-slate-500">
            {r.gelesen.toLocaleString("de-DE")} Antworten geprüft
            {r.abgemeldetInInstantly ? `, ${r.abgemeldetInInstantly} Abmeldungen in Instantly` : ""}
            {r.uebersprungen ? `, ${r.uebersprungen} übersprungen (später Termin oder Zusage)` : ""}
            {r.angewendet && r.instantly.offen ? `, ${r.instantly.offen} in Instantly noch offen (wird alle 15 Min. wiederholt)` : ""}
          </p>
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
