"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
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
      <div className="space-y-3">
        <p className="text-sm font-medium">Erklärvideos je Schritt (Loom oder YouTube, optional)</p>
        {steps.map((k) => (
          <div key={k}>
            <label className="text-sm text-[color:var(--muted)]" htmlFor={`video_${k}`}>
              {LABEL[k] ?? k}
            </label>
            <input id={`video_${k}`} name={`video_${k}`} defaultValue={initial.videos[k] ?? ""} placeholder="https://www.loom.com/share/…" className="input mt-1 w-full" />
          </div>
        ))}
      </div>
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
