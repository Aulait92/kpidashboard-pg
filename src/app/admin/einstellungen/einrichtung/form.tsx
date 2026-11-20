"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2, ChevronDown } from "lucide-react";
import { saveSetupSettingsAction, type SetupSettingsState } from "./actions";

const LABEL: Record<string, string> = {
  metaAccess: "Meta freigeben (Partnerzugriff)",
  whatsapp: "WhatsApp verbinden",
  calendar: "Kalender verbinden",
  app: "App aufs Handy und Mitteilungen",
  consent: "Einwilligung im Leadformular",
  provision: "Provisionen prüfen",
};

export function SetupSettingsForm({
  initial,
  steps,
  envHint,
}: {
  initial: { businessId: string; videos: Record<string, string> };
  steps: string[];
  envHint: string;
}) {
  const [state, action, pending] = useActionState<SetupSettingsState, FormData>(saveSetupSettingsAction, {});
  return (
    <form action={action} className="space-y-5">
      <div>
        <label className="text-sm font-medium" htmlFor="businessId">
          Unsere Meta Business-ID
        </label>
        <input id="businessId" name="businessId" defaultValue={initial.businessId} placeholder="z. B. 3089330734489612" className="input mt-1 w-full" />
        <p className="mt-1 text-sm text-[color:var(--muted)]">{envHint}</p>
      </div>
      {/* UX-Umbau 20.11.2026: sechs Video-Felder eingeklappt, im Titel steht, wie viele gesetzt sind */}
      <details className="group rounded-[var(--radius-md)] border border-[color:var(--border)] px-4">
        <summary className="flex min-h-12 cursor-pointer list-none [&::-webkit-details-marker]:hidden items-center text-sm font-medium">
          Erklärvideos je Schritt
          <span className="ml-1.5 font-normal text-[color:var(--muted)]">
            {steps.filter((k) => initial.videos[k]).length} von {steps.length}
          </span>
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
          </summary>
      <div className="space-y-3 pb-4">
        <p className="text-sm text-[color:var(--muted)]">Loom- oder YouTube-Link, leer: ohne Video.</p>
        {steps.map((k) => (
          <div key={k}>
            <label className="text-sm text-[color:var(--muted)]" htmlFor={`video_${k}`}>
              {LABEL[k] ?? k}
            </label>
            <input id={`video_${k}`} name={`video_${k}`} defaultValue={initial.videos[k] ?? ""} placeholder="https://www.loom.com/share/…" className="input mt-1 w-full" />
          </div>
        ))}
      </div>
      </details>
      <div className="flex items-center gap-3">
        <button className="btn-primary inline-flex items-center gap-2" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Speichern
        </button>
        {state.ok ? (
          <span className="flex items-center gap-1 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Gespeichert
          </span>
        ) : null}
        {state.error ? <span className="text-sm text-rose-700">{state.error}</span> : null}
      </div>
    </form>
  );
}
