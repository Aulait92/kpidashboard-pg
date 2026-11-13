"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Circle, LifeBuoy, ListChecks, PlayCircle } from "lucide-react";
import { IntroVideo } from "@/components/intro-video";
import { VIDEOS } from "@/lib/intro-videos";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  businessCanStart,
  COEX_QUESTION,
  COEX_WITH_PROVIDER,
  GUIDES,
  PATH_OPTIONS,
  PROVIDER_QUESTION,
  PROVIDER_UNSURE,
  PROVIDER_YES,
  type CoexAnswer,
  type ConnectPath,
  type GuideStep,
  type ProviderAnswer,
} from "@/lib/whatsapp/connect-guide";

const WHERE_LABEL: Record<GuideStep["where"], string> = {
  app: "Bei uns",
  "360dialog": "360dialog",
  meta: "Fenster von Meta",
  whatsapp: "WhatsApp Business App",
};

const WHERE_CLASS: Record<GuideStep["where"], string> = {
  app: "bg-blue-50 text-blue-700",
  "360dialog": "bg-teal-50 text-teal-700",
  meta: "bg-indigo-50 text-indigo-700",
  whatsapp: "bg-emerald-50 text-emerald-700",
};

const TONE_CLASS = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
} as const;

/**
 * Vorbereitung und Anleitung zum Verbinden der WhatsApp-Nummer: erst den Weg
 * wählen (neue Nummer / WhatsApp Business App / private Nummer), dann die
 * passende Checkliste und Schritte, dann der Knopf.
 */
export function WhatsAppGuide({
  initialPath,
  readOnly,
  helpHref,
  connectHref = "/buyer/whatsapp-verbinden",
  showMoreLink = true,
  showVideo = true,
}: {
  initialPath: ConnectPath | null;
  readOnly: boolean;
  helpHref: string;
  connectHref?: string;
  showMoreLink?: boolean;
  /** Video „WhatsApp verbinden“ aufklappbar über dem Knopf (Hilfeseite zeigt es separat). */
  showVideo?: boolean;
}) {
  const [path, setPath] = useState<ConnectPath | null>(initialPath);
  const [provider, setProvider] = useState<ProviderAnswer | null>(null);
  const [coex, setCoex] = useState<CoexAnswer | null>(null);
  const guide = path ? GUIDES[path] : null;
  // Beim Business-Weg erst klären, ob die Nummer schon bei einem anderen Anbieter hängt.
  const isBusiness = path === "business";
  const canStart = !guide ? false : isBusiness ? businessCanStart(provider, coex) : guide.canStart;
  const showSteps = !!guide && (!isBusiness || canStart);
  const needsHelp = isBusiness && (provider === "unklar" || (provider === "ja" && coex === "ja"));

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-[15px] font-semibold">Welche Nummer soll Ihr Assistent nutzen?</legend>
        <div className="grid gap-2" role="radiogroup" aria-label="Welche Nummer soll Ihr Assistent nutzen?">
          {PATH_OPTIONS.map((o) => {
            const on = path === o.path;
            return (
              <button
                key={o.path}
                type="button"
                role="radio"
                aria-checked={on}
                data-weg={o.path}
                onClick={() => setPath(o.path)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]",
                  on ? "border-[color:var(--brand)] bg-[color:var(--brand-soft,#eef3ff)]" : "border-[color:var(--border)] hover:border-[color:var(--brand)]",
                )}
              >
                {on ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--brand)]" />
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--muted)]" />
                )}
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium">{o.label}</span>
                  <span className="mt-0.5 block text-sm text-[color:var(--muted)]">{o.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {guide ? (
        <div className="space-y-5" data-guide={path}>
          <p className={cn("rounded-[var(--radius-md)] border px-4 py-3 text-sm", TONE_CLASS[guide.tone])}>{guide.intro}</p>

          {isBusiness ? (
            <div className="space-y-3 rounded-[var(--radius-md)] border border-[color:var(--border)] p-4">
              <Choice
                name="provider"
                question={PROVIDER_QUESTION.question}
                options={PROVIDER_QUESTION.answers}
                value={provider}
                onChange={(v) => {
                  setProvider(v);
                  setCoex(null);
                }}
              />
              {provider === "ja" ? (
                <>
                  <p className="text-sm">{PROVIDER_YES}</p>
                  <Choice
                    name="coex"
                    question={COEX_QUESTION}
                    options={[
                      { value: "nein" as const, label: "Nein" },
                      { value: "ja" as const, label: "Ja" },
                    ]}
                    value={coex}
                    onChange={setCoex}
                  />
                  {coex === "ja" ? (
                    <p className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                      {COEX_WITH_PROVIDER}
                    </p>
                  ) : null}
                </>
              ) : null}
              {provider === "unklar" ? (
                <div className="text-sm">
                  <p className="font-medium">Woran Sie es erkennen:</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-[color:var(--muted)]">
                    {PROVIDER_UNSURE.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {showSteps ? (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
                <ListChecks className="h-4 w-4 text-[color:var(--muted)]" />
                Halten Sie bereit
              </h3>
              <ul className="space-y-1.5 text-[15px]">
                {guide.checklist.map((c) => (
                  <li key={c} className="flex gap-2">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="min-w-0">{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {showSteps && guide.steps.length ? (
            <div>
              <h3 className="mb-2 text-[15px] font-semibold">So läuft es ab</h3>
              <ol className="space-y-3">
                {guide.steps.map((s, i) => (
                  <li key={s.title} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-sunken,#f1f5f9)] text-xs font-semibold tabular-nums">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-medium">{s.title}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", WHERE_CLASS[s.where])}>{WHERE_LABEL[s.where]}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-[color:var(--muted)]">{s.text}</p>
                      {s.pitfall ? <p className="mt-1 text-sm text-amber-800">Falls es hakt: {s.pitfall}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {canStart && showVideo ? (
            <details className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3" data-whatsapp-video>
              <summary className="flex cursor-pointer items-center gap-2 text-[15px] font-medium text-[color:var(--brand)]">
                <PlayCircle className="h-4 w-4" /> Erst ansehen: {VIDEOS.whatsapp.title}
              </summary>
              <div className="mt-3">
                <IntroVideo kind="whatsapp" />
              </div>
            </details>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {canStart ? (
              <a
                href={connectHref}
                className={buttonClass("primary", "md", cn("justify-center", readOnly && "pointer-events-none opacity-60"))}
                aria-disabled={readOnly || undefined}
              >
                Jetzt WhatsApp verbinden
              </a>
            ) : null}
            <Link href={helpHref} className={buttonClass(needsHelp ? "primary" : "secondary", "md", "justify-center gap-1.5")}>
              <LifeBuoy className="h-4 w-4" /> Lieber gemeinsam? 15-Minuten-Hilfetermin buchen
            </Link>
          </div>
          {canStart ? (
            <p className="text-sm text-[color:var(--muted)]">Dauer: etwa {guide.minutes} Minuten. Sie können jederzeit abbrechen und später weitermachen.</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-[color:var(--muted)]">Wählen Sie oben Ihre Nummer. Dann zeigen wir Ihnen genau, was Sie brauchen.</p>
      )}

      {showMoreLink ? (
        <p className="text-sm">
          <Link href={`/buyer/hilfe/whatsapp${path ? `?weg=${path}` : ""}`} className="font-medium text-[color:var(--brand)] underline">
            Ausführliche Anleitung mit Bildern
          </Link>
        </p>
      ) : null}
    </div>
  );
}

/** Kleine Auswahlfrage (Knöpfe nebeneinander, als Radiogruppe). */
function Choice<T extends string>({
  name,
  question,
  options,
  value,
  onChange,
}: {
  name: string;
  question: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p id={`frage-${name}`} className="mb-2 text-sm font-medium">
        {question}
      </p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={`frage-${name}`}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              data-antwort={`${name}-${o.value}`}
              onClick={() => onChange(o.value)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]",
                on ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white" : "border-[color:var(--border)] hover:border-[color:var(--brand)]",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
