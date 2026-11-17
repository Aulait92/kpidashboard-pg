// Kontakt: Einwilligung aus dem Leadformular (Nachweis) und Gesundheitsangaben (vertraulich, nur für den
// Vermittler; gehen nicht an den Assistenten). lib/einwilligung-leadformular.ts, lib/gesundheitsdaten.ts

import { Lock } from "lucide-react";
import { EinwilligungHinweis } from "@/components/einwilligung-kontakt";
import type { EinwilligungStand } from "@/lib/einwilligung-stand";

// Einwilligung (Ole, 17.11.2026): vollständig steht als Etikett am Namen (components/einwilligung-kontakt.tsx),
// hier nur noch der Hinweis, wenn sie fehlt oder eingeschränkt ist.
export function LeadLegalCard({ einwilligung, health }: { einwilligung: EinwilligungStand; health: { label: string; value: string }[] }) {
  const hinweis = einwilligung.stufe !== "vollstaendig" && einwilligung.stufe !== "ohne";
  if (!hinweis && health.length === 0) return null;
  return (
    <div className="mb-5 space-y-3 [&>*]:mb-0" data-lead-legal>
      {hinweis ? <EinwilligungHinweis stand={einwilligung} /> : null}
      {health.length ? (
        <details className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm" data-lead-health>
          <summary className="flex cursor-pointer items-center gap-2 font-medium">
            <Lock className="h-4 w-4 shrink-0 text-[color:var(--muted)]" /> Gesundheitsangaben (vertraulich)
          </summary>
          <p className="mt-2 text-xs text-[color:var(--muted)]">
            Nur für Sie sichtbar. Der Assistent bekommt diese Angaben nicht und schreibt sie nicht per WhatsApp. Bitte im Gespräch persönlich klären.
          </p>
          <dl className="mt-2 space-y-1.5">
            {health.map((h) => (
              <div key={`${h.label}:${h.value}`}>
                <dt className="text-xs text-[color:var(--muted)]">{h.label}</dt>
                <dd>{h.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}
