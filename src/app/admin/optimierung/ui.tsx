"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Badge, buttonClass } from "@/components/ui";
import { MANUAL_TOPICS, KIND_LABEL } from "@/lib/optimierung/shared";
import type { MeasureKind } from "@/lib/optimierung/regeln";
import {
  addManualAction,
  approveAllAction,
  approveOneAction,
  doneAction,
  dryRunAction,
  rejectAction,
  runNowAction,
  saveAccountAction,
  saveGlobalAction,
  syncActivitiesAction,
  type DryRunState,
  type OptState,
} from "./actions";

const Spin = () => <Loader2 className="h-3.5 w-3.5 animate-spin" />;
const Msg = ({ s }: { s: OptState }) =>
  s.error ? <span className="text-sm text-rose-700">{s.error}</span> : s.info ? <span className="text-sm text-emerald-700">{s.info}</span> : s.ok ? <span className="text-sm text-emerald-700">Gespeichert.</span> : null;

export function GlobalForm({ enabled, autopilot }: { enabled: boolean; autopilot: boolean }) {
  const [state, action, pending] = useActionState<OptState, FormData>(saveGlobalAction, {});
  return (
    <form action={action} className="space-y-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
      <label className="flex items-start gap-3">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="mt-1 h-4 w-4" />
        <span>
          <span className="block font-medium">Wöchentlicher Optimierungslauf</span>
          <span className="block text-sm text-[color:var(--muted)]">Liest je Werbekonto höchstens alle 7 Tage die Kennzahlen und plant Maßnahmen. Ohne Freigabe wird nichts bei Meta geändert.</span>
        </span>
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="autopilot" defaultChecked={autopilot} className="mt-1 h-4 w-4" />
        <span>
          <span className="block font-medium">Autopilot für alle Konten</span>
          <span className="block text-sm text-[color:var(--muted)]">Geplante Maßnahmen werden sofort freigegeben und ausgeführt (außer Vorschlägen an Ole). Je Konto lässt sich der Modus abweichend festlegen.</span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button className={buttonClass("primary", "md")} disabled={pending}>
          {pending ? <Spin /> : null} Speichern
        </button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export function AccountSettingsForm(props: {
  accountId: string;
  customerId: string | null;
  kind: string;
  autopilot: boolean | null;
  globalAutopilot: boolean;
  targetCpl: number | null;
  agreedDailyBudget: number | null;
  campaignKeyword: string | null;
}) {
  const [state, action, pending] = useActionState<OptState, FormData>(saveAccountAction, {});
  const mode = props.autopilot == null ? "global" : props.autopilot ? "autopilot" : "vorschlag";
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <input type="hidden" name="accountId" value={props.accountId} />
      <input type="hidden" name="customerId" value={props.customerId ?? ""} />
      <label className="text-sm">
        <span className="mb-1 block font-medium">Modus</span>
        <select name="mode" defaultValue={mode} className="input h-9 w-full">
          <option value="global">Wie global ({props.globalAutopilot ? "Autopilot" : "Vorschlag"})</option>
          <option value="vorschlag">Vorschlag (Ole gibt frei)</option>
          <option value="autopilot">Autopilot</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Ziel-Leadpreis (€)</span>
        <input name="targetCpl" defaultValue={props.targetCpl ?? ""} inputMode="decimal" placeholder={props.kind === "kunde" ? "leer = Rechner bzw. Schnitt" : "leer = Kampagnenschnitt"} className="input h-9 w-full" />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Vereinbartes Tagesbudget gesamt (€)</span>
        <input name="agreedDailyBudget" defaultValue={props.agreedDailyBudget ?? ""} inputMode="decimal" placeholder={props.kind === "kunde" ? "leer = Werbebudget aus dem Vertrag" : "leer = nur umschichten"} className="input h-9 w-full" />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Nur Kampagnen mit Stichwort</span>
        <input name="campaignKeyword" defaultValue={props.campaignKeyword ?? ""} placeholder={props.kind === "kunde" ? "leer = alle aktiven Kampagnen" : "leer = Produktname"} className="input h-9 w-full" />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className={buttonClass("primary", "sm")} disabled={pending}>
          {pending ? <Spin /> : null} Speichern
        </button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export type MeasureView = {
  id: string;
  kind: string;
  status: string;
  title: string;
  reason: string;
  targetName: string | null;
  result: string | null;
  source: string;
  plannedAt: string;
  executedAt: string | null;
  decidedBy: string | null;
  suggestion: boolean;
};

export function PlannedList({ accountId, customerId, items }: { accountId: string; customerId: string | null; items: MeasureView[] }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<OptState>({});
  const planned = items.filter((i) => i.status === "geplant");
  const run = (fn: () => Promise<OptState>) => start(async () => setState(await fn()));
  if (!items.length) return <p className="px-5 pb-5 text-sm text-[color:var(--muted)]">Keine offenen Maßnahmen.</p>;
  return (
    <div className="px-5 pb-5">
      {planned.length ? (
        <div className="mb-3 flex items-center gap-3">
          <button className={buttonClass("primary", "sm")} disabled={pending} onClick={() => run(() => approveAllAction(accountId, customerId))}>
            {pending ? <Spin /> : null} Alle freigeben ({planned.length})
          </button>
          <Msg s={state} />
        </div>
      ) : (
        <div className="mb-3">
          <Msg s={state} />
        </div>
      )}
      <ul className="divide-y divide-[color:var(--border)]">
        {items.map((m) => (
          <li key={m.id} className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={m.suggestion ? "info" : "brand"}>{KIND_LABEL[m.kind as MeasureKind] ?? m.kind}</Badge>
              <span className="font-medium">{m.title}</span>
              {m.status === "freigegeben" ? <Badge tone="success">freigegeben{m.decidedBy ? ` von ${m.decidedBy}` : ""}</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-[color:var(--muted)]">{m.reason}</p>
            {m.result ? <p className="mt-1 text-xs text-[color:var(--muted)]">{m.result}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {m.status === "geplant" ? (
                <button className={buttonClass("secondary", "sm")} disabled={pending} onClick={() => run(() => approveOneAction(accountId, m.id, customerId))}>
                  Freigeben
                </button>
              ) : null}
              {m.suggestion ? (
                <button
                  className={buttonClass("secondary", "sm")}
                  disabled={pending}
                  onClick={() => {
                    const note = window.prompt("Was wurde umgesetzt? (optional)") ?? null;
                    run(() => doneAction(accountId, m.id, note, customerId));
                  }}
                >
                  Erledigt
                </button>
              ) : null}
              {m.result !== "Ausführung läuft" ? (
                <button
                  className={buttonClass("danger", "sm")}
                  disabled={pending}
                  onClick={() => {
                    const note = window.prompt("Grund für die Ablehnung (optional)");
                    if (note === null) return;
                    run(() => rejectAction(accountId, m.id, note, customerId));
                  }}
                >
                  Ablehnen
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ManualForm({ accountId, customerId }: { accountId: string | null; customerId: string | null }) {
  const [state, action, pending] = useActionState<OptState, FormData>(addManualAction, {});
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} key={state.at ?? 0} className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-[140px_180px_1fr]">
      <input type="hidden" name="accountId" value={accountId ?? ""} />
      <input type="hidden" name="customerId" value={customerId ?? ""} />
      <input type="date" name="date" defaultValue={today} max={today} className="input h-9" aria-label="Datum" />
      <select name="topic" defaultValue="anzeigen" className="input h-9" aria-label="Art">
        {MANUAL_TOPICS.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
      <input name="title" required minLength={3} maxLength={200} placeholder="Was wurde gemacht? z. B. Zielgruppe auf 25 km verkleinert" className="input h-9" />
      <textarea name="reason" rows={2} maxLength={2000} placeholder="Warum? (optional, mit Zahlen)" className="input sm:col-span-3" />
      <div className="flex items-center gap-3 sm:col-span-3">
        <button className={buttonClass("primary", "sm")} disabled={pending}>
          {pending ? <Spin /> : null} Maßnahme eintragen
        </button>
        {state.error ? <span className="text-sm text-rose-700">{state.error}</span> : state.ok ? <span className="text-sm text-emerald-700">Eingetragen.</span> : null}
      </div>
    </form>
  );
}

export function RunPanel({ accountId, customerId }: { accountId: string; customerId: string | null }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<DryRunState & { info?: string }>({});
  const plan = state.plan;
  return (
    <div className="space-y-3 px-5 pb-5">
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass("secondary", "sm")} disabled={pending} onClick={() => start(async () => setState(await dryRunAction(accountId)))}>
          {pending ? <Spin /> : null} Trockenlauf
        </button>
        <button className={buttonClass("secondary", "sm")} disabled={pending} onClick={() => start(async () => setState(await runNowAction(accountId, customerId)))}>
          Lauf jetzt (planen)
        </button>
        <button
          className={buttonClass("ghost", "sm")}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await syncActivitiesAction(accountId, customerId);
              setState({ error: r.error, info: r.info });
            })
          }
        >
          Meta-Änderungsprotokoll abrufen
        </button>
      </div>
      <p className="text-xs text-[color:var(--muted)]">Trockenlauf: liest Meta (nur lesend) und zeigt, was geplant würde. Gespeichert und geändert wird nichts.</p>
      {state.error ? <p className="text-sm text-rose-700">{state.error}</p> : null}
      {state.info ? <p className="text-sm text-emerald-700">{state.info}</p> : null}
      {plan ? (
        <div className="rounded-[var(--radius-sm)] border border-[color:var(--border)] p-3 text-sm">
          <p className="font-medium">
            {plan.dryRun ? "Trockenlauf" : `Lauf gespeichert (${plan.saved} neu)`}: {plan.problem ? `Problem: ${plan.problem}` : `${plan.measures.length} Maßnahme(n)`}
          </p>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            {plan.stats.campaigns} Kampagnen, {plan.stats.adSets} Anzeigengruppen, {plan.stats.ads} laufende Anzeigen, 14 Tage: {plan.stats.spend14d.toLocaleString("de-DE")} € und {plan.stats.leads14d} Leads
            {plan.stats.refCpl != null ? `, ${plan.stats.refCplLabel} ${plan.stats.refCpl.toLocaleString("de-DE")} €` : ""}
            {plan.stats.agreedDailyBudget != null ? `, vereinbart ${plan.stats.agreedDailyBudget.toLocaleString("de-DE")} €/Tag` : ""}
            {plan.stats.currentDailyBudget != null ? `, bei Meta ${plan.stats.currentDailyBudget.toLocaleString("de-DE")} €/Tag` : ""}
          </p>
          {plan.warnings.map((w) => (
            <p key={w} className="mt-1 text-amber-800">
              {w}
            </p>
          ))}
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {plan.measures.map((m, i) => (
              <li key={i}>
                <span className="font-medium">{m.title}</span>: {m.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
