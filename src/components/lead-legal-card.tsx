// Kontakt: Einwilligung aus dem Leadformular (Nachweis) und Gesundheitsangaben (vertraulich, nur für den
// Vermittler; gehen nicht an den Assistenten). lib/einwilligung-leadformular.ts, lib/gesundheitsdaten.ts

import { Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import { consentLabel, type ConsentNachweis } from "@/lib/einwilligung-leadformular";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function LeadLegalCard({
  waConsent,
  consentData,
  health,
  meta,
}: {
  waConsent: string | null;
  consentData: unknown;
  health: { label: string; value: string }[];
  /** Lead kam direkt aus einem Meta-Formular (sonst kein Hinweis zur Einwilligung). */
  meta: boolean;
}) {
  const nachweis = consentData && typeof consentData === "object" ? (consentData as Partial<ConsentNachweis>) : null;
  const showConsent = meta || !!nachweis;
  if (!showConsent && health.length === 0) return null;
  const label = consentLabel(waConsent);
  const tone =
    label.tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : label.tone === "warn"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div className="mb-5 space-y-3" data-lead-legal>
      {showConsent ? (
        <div className={`rounded-[var(--radius-md)] border px-4 py-3 text-sm ${tone}`} data-lead-consent={waConsent ?? "ohne"}>
          <div className="flex items-start gap-2">
            {label.tone === "ok" ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}
            <div className="min-w-0 flex-1">
              <b>Einwilligung:</b> {label.text}
              {nachweis?.at ? (
                <div className="mt-1 text-xs opacity-80">
                  {fmt(nachweis.at)}
                  {nachweis.formId ? ` · Formular ${nachweis.formId}` : ""}
                  {nachweis.textVersion ? ` · Textversion ${nachweis.textVersion}` : ""}
                </div>
              ) : null}
              {nachweis?.text ? (
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer">Wortlaut anzeigen</summary>
                  <p className="mt-1 whitespace-pre-line">{nachweis.text}</p>
                </details>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
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
