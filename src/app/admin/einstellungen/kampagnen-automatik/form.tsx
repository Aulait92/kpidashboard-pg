"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import type { AutomationSettings } from "@/lib/kampagnen/settings";
import { saveAutomationAction, type AutomationState } from "./actions";

function Toggle({ name, checked, title, text }: { name: string; checked: boolean; title: string; text: string }) {
  return (
    <label className="flex items-start gap-3 px-5 py-4">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-1 h-4 w-4 shrink-0" />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-[color:var(--muted)]">{text}</span>
      </span>
    </label>
  );
}

function Num({ name, label, value, suffix, step }: { name: string; label: string; value: number; suffix: string; step: string }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1.5">
        <input name={name} type="number" step={step} defaultValue={value} className="input h-9 w-24 text-right" />
        <span className="w-8 text-[color:var(--muted)]">{suffix}</span>
      </span>
    </label>
  );
}

export function AutomationForm({ s }: { s: AutomationSettings }) {
  const [state, action, pending] = useActionState<AutomationState, FormData>(saveAutomationAction, {});
  return (
    <form action={action} className="space-y-4">
      <div className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
        <Toggle
          name="budgetSync"
          checked={s.budgetSync}
          title="Budgetänderungen automatisch bei Meta umsetzen"
          text="Neues Werbebudget des Kunden landet im Tagesbudget seiner Kampagne, im Zweifel als Aufgabe."
        />
        <Toggle
          name="autoLaunch"
          checked={s.autoLaunch}
          title="Gebuchte Produkte starten das Agenten-Team"
          text="Neues Produkt oder angenommenes Angebot legt die Kampagne pausiert an. Fehlt etwas, kommt eine Aufgabe."
        />
        <Toggle
          name="refresh"
          checked={s.refresh}
          title="Müde Anzeigen erkennen und neue Anzeigen vorbereiten"
          text="Legt bei Ermüdung 2 bis 3 neue Anzeigen pausiert an. Aktiviert wird nichts automatisch."
        />
      </div>
      {/* UX-Umbau 20.11.2026: Schwellen selten geändert, darum eingeklappt (Standardwerte gesetzt) */}
      <details className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-5 shadow-[var(--shadow-sm)]">
        <summary className="flex min-h-12 cursor-pointer items-center text-sm font-medium">Schwellen für müde Anzeigen</summary>
        <div className="space-y-3 pb-5">
        <p className="text-sm text-[color:var(--muted)]">Gemessen über die letzten 14 Tage.</p>
        <Num name="refreshMaxFrequency" label="Frequenz über" value={s.refreshMaxFrequency} suffix="" step="0.1" />
        <Num name="refreshCtrDrop" label="Klickrate gesunken (ggü. ersten 7 Tagen) um" value={Math.round(s.refreshCtrDrop * 100)} suffix="%" step="1" />
        <Num name="refreshCplRise" label="Leadpreis über Kampagnenschnitt um" value={Math.round(s.refreshCplRise * 100)} suffix="%" step="1" />
        <Num name="refreshMinSpendEur" label="… sobald die Anzeige mindestens ausgegeben hat" value={s.refreshMinSpendEur} suffix="€" step="1" />
        </div>
      </details>
      <div className="flex items-center gap-3">
        <button className="btn-primary h-10 text-sm" disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Speichern
        </button>
        {state.error ? <span className="text-sm text-rose-700">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-emerald-700">Gespeichert.</span> : null}
      </div>
    </form>
  );
}
