"use client";

import { useActionState } from "react";
import { hvkAssignAction, hvkBackfillAction, hvkFetchNowAction, hvkUploadAction, type HvkReklamationState, type HvkRunRow, type HvkRunState } from "./hvk-actions";

const btn = "h-9 rounded-[var(--radius-sm)] px-3 text-sm font-semibold disabled:opacity-60";
const eur = (c: number | null) => (c == null ? "–" : (Math.abs(c) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" }));
const STATUS: Record<string, string> = { neu: "übernommen", vorhanden: "schon da", vorschau: "neu" };
const STORNO: Record<string, string> = { eingetragen: "Storno eingetragen", "schon storniert": "schon storniert", "würde eingetragen": "Storno würde eingetragen", fehler: "Fehler" };

function Feedback({ state }: { state: { error?: string; message?: string } }) {
  if (state.error) return <p className="text-xs text-rose-700">{state.error}</p>;
  if (state.message) return <p className="text-xs text-emerald-700">{state.message}</p>;
  return null;
}

/** „Jetzt abrufen“ (letzte 3 Wochen) */
export function HvkFetchNow() {
  const [state, action, pending] = useActionState<HvkRunState, FormData>(hvkFetchNowAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <Feedback state={state} />
      <button disabled={pending} className={`${btn} bg-[color:var(--foreground)] text-white`}>
        {pending ? "Prüfe Postfach …" : "Jetzt abrufen"}
      </button>
    </form>
  );
}

/** Rückwirkend ab Juli: erst Vorschau (ändert nichts), dann übernehmen. */
export function HvkBackfill({ connected }: { connected: boolean }) {
  const [state, action, pending] = useActionState<HvkRunState, FormData>(hvkBackfillAction, {});
  const previewed = state.dryRun && !!state.rows?.length;
  return (
    <div className="space-y-2">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <button name="mode" value="vorschau" disabled={pending || !connected} title={connected ? undefined : "Erst das Postfach verbinden"} className={`${btn} border border-[color:var(--border)] bg-white`}>
          {pending ? "Lese Mails …" : "Vorschau"}
        </button>
        <button
          name="mode"
          value="uebernehmen"
          disabled={pending || !previewed}
          onClick={(e) => {
            if (!confirm("Alle neuen Abrechnungen seit Juli übernehmen und eindeutige Reklamationen als Storno eintragen?")) e.preventDefault();
          }}
          className={`${btn} bg-[color:var(--brand)] text-white`}
          title={previewed ? undefined : "Erst die Vorschau ansehen"}
        >
          Übernehmen
        </button>
        <Feedback state={state} />
      </form>
      {state.rows?.length ? <RunTable rows={state.rows} /> : null}
    </div>
  );
}

/** PDF von Hand (falls das Postfach nicht verbunden ist) */
export function HvkUpload() {
  const [state, action, pending] = useActionState<HvkRunState, FormData>(hvkUploadAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="file" name="pdf" accept="application/pdf,.pdf" required className="max-w-full text-sm file:mr-2 file:h-9 file:rounded-[var(--radius-sm)] file:border file:border-[color:var(--border)] file:bg-white file:px-3 file:text-sm" />
      <button disabled={pending} className={`${btn} border border-[color:var(--border)] bg-white`}>
        {pending ? "…" : "Hochladen"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

function RunTable({ rows }: { rows: HvkRunRow[] }) {
  return (
    <ul className="divide-y divide-[color:var(--border)] rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white text-sm">
      {rows.map((r, i) =>
        r.ok ? (
          <li key={`${r.invoiceNo}-${i}`} className="space-y-1 px-3 py-2">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{r.invoiceNo}</span>
              <span className="text-xs text-[color:var(--muted)]">{r.period}</span>
              <span className="text-xs text-[color:var(--muted)]">· {STATUS[r.status] ?? r.status}</span>
              <span className="ml-auto tabular-nums">{eur(r.netCents)}</span>
            </div>
            <div className="text-xs text-[color:var(--muted)]">
              geliefert {r.delivered} · abgerechnet {r.billed} · Stornos {r.stornoAuto} automatisch, {r.stornoReview} prüfen
              {r.unbilled ? ` · ${r.unbilled} nicht abgerechnet` : ""}
              {r.foreign ? ` · ${r.foreign} nicht von uns` : ""}
            </div>
            {r.reklamationen.map((k) => (
              <div key={k.hvkLeadId} className="text-xs">
                Reklamation {k.hvkLeadId} ({k.plz} {k.ort}, {k.date.split("-").reverse().join(".")}):{" "}
                {k.outcome === "eindeutig" ? (
                  <span className="text-emerald-700">{STORNO[k.storno ?? ""] ?? "zugeordnet"}</span>
                ) : (
                  <span className="text-amber-700">{k.outcome === "keiner" ? "kein passender Lead, zu prüfen" : `${k.candidateIds.length} mögliche Leads, zu prüfen`}</span>
                )}
                {k.error ? <span className="text-rose-700"> ({k.error})</span> : null}
              </div>
            ))}
            {r.warnings.map((w) => (
              <div key={w} className="text-xs text-amber-700">
                {w}
              </div>
            ))}
          </li>
        ) : (
          <li key={`err-${i}`} className="px-3 py-2 text-xs text-rose-700">
            {r.error}
          </li>
        ),
      )}
    </ul>
  );
}

/** „Storno prüfen“: Reklamation einem Lead zuordnen (Kandidat wählen oder Lead-ID eingeben) */
export function HvkAssign({ reklamationId, candidates }: { reklamationId: string; candidates: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<HvkReklamationState, FormData>(hvkAssignAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="reklamationId" value={reklamationId} />
      {candidates.length ? (
        <select name="leadId" required className="h-9 max-w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm">
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      ) : (
        <input name="leadId" required placeholder="Lead-ID (Gelieferte Leads)" className="h-9 w-56 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm" />
      )}
      <button disabled={pending} className={`${btn} bg-rose-600 text-white`}>
        {pending ? "…" : "Storno eintragen"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
