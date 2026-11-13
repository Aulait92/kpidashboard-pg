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
          text="Ändert ein Kunde sein Werbebudget, stellt die App das Tagesbudget der passenden Kampagne um – nur bei genau einer passenden Kampagne, der Status bleibt unverändert. Sonst Aufgabe „Meta-Budget …“ mit Grund."
        />
        <Toggle
          name="autoLaunch"
          checked={s.autoLaunch}
          title="Gebuchte Produkte starten das Agenten-Team"
          text="Neues Produkt bzw. angenommenes Angebot → Kampagne wird automatisch pausiert angelegt. Fehlt etwas (Meta-Zugriff, Seite, Datenschutz-URL), gibt es eine Aufgabe; der Lauf startet von selbst, sobald alles da ist."
        />
        <Toggle
          name="refresh"
          checked={s.refresh}
          title="Müde Anzeigen erkennen und neue Anzeigen vorbereiten"
          text="Wöchentliche Prüfung laufender Kampagnen. Bei Ermüdung legt das Agenten-Team 2–3 neue Anzeigen pausiert in derselben Anzeigengruppe an (höchstens alle 14 Tage je Kampagne). Pausiert und aktiviert wird nichts automatisch."
        />
      </div>
      <div className="space-y-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        <h2 className="font-medium">Schwellen für müde Anzeigen (letzte 14 Tage)</h2>
        <Num name="refreshMaxFrequency" label="Frequenz über" value={s.refreshMaxFrequency} suffix="" step="0.1" />
        <Num name="refreshCtrDrop" label="CTR gesunken gegenüber den ersten 7 Tagen um mindestens" value={Math.round(s.refreshCtrDrop * 100)} suffix="%" step="1" />
        <Num name="refreshCplRise" label="Leadpreis über dem Kampagnenschnitt um mindestens" value={Math.round(s.refreshCplRise * 100)} suffix="%" step="1" />
        <Num name="refreshMinSpendEur" label="… sobald die Anzeige mindestens ausgegeben hat" value={s.refreshMinSpendEur} suffix="€" step="1" />
      </div>
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
