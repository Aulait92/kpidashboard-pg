"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Circle, LifeBuoy, ListChecks, PlayCircle } from "lucide-react";
import { IntroVideo } from "@/components/intro-video";
import { VIDEOS } from "@/lib/intro-videos";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { istFreemail } from "@/lib/freemail";
import {
  ANBIETER_GUIDE,
  ANBIETER_OPTION,
  businessCanStart,
  GUIDES,
  PATH_OPTIONS,
  PROVIDER_QUESTION,
  PROVIDER_UNSURE,
  PROVIDER_YES,
  VORPRUEFUNG_ANBIETER,
  type ConnectPath,
  type GuideStep,
  type ProviderAnswer,
} from "@/lib/whatsapp/connect-guide";

/** Gewählter Weg: einer der drei Verbindungswege oder „Nummer läuft bei einem anderen Anbieter“ (erst freigeben). */
type Wahl = ConnectPath | "anbieter";

const WHERE_LABEL: Record<GuideStep["where"], string> = {
  app: "Bei uns",
  mail: "Ihr E-Mail-Postfach",
  "360dialog": "360dialog",
  meta: "Fenster von Meta",
  whatsapp: "WhatsApp Business App",
};

const WHERE_CLASS: Record<GuideStep["where"], string> = {
  app: "bg-blue-50 text-blue-700",
  mail: "bg-amber-50 text-amber-800",
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
  inviteEmail,
}: {
  /** Adresse für die Einladung von 360dialog (Login); vor dem Start änderbar (Ole, 20.11.2026). */
  inviteEmail?: string;
  initialPath: ConnectPath | null;
  readOnly: boolean;
  helpHref: string;
  connectHref?: string;
  showMoreLink?: boolean;
  /** Video „WhatsApp verbinden“ aufklappbar über dem Knopf (Hilfeseite zeigt es separat). */
  showVideo?: boolean;
}) {
  const [wahl, setWahl] = useState<Wahl | null>(initialPath);
  const anbieter = wahl === "anbieter";
  const path: ConnectPath | null = wahl && wahl !== "anbieter" ? wahl : null;
  // Firmen- bzw. Konzernadresse vorbelegt (Go-live-Prüfung 20./21.11.2026): Die Einladung von 360dialog bleibt dort oft im
  // Filter hängen. Dann das Feld leer und offen zeigen und nach einer privaten Adresse fragen; leer = Firmenadresse.
  const firmenAdresse = !!inviteEmail && !istFreemail(inviteEmail);
  const [email, setEmail] = useState(firmenAdresse ? "" : (inviteEmail ?? ""));
  const [emailAendern, setEmailAendern] = useState(firmenAdresse);
  const andereEmail = !!inviteEmail && email.trim().toLowerCase() !== inviteEmail.toLowerCase() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const startHref = (() => {
    const q = new URLSearchParams();
    if (path) q.set("weg", path);
    if (andereEmail) q.set("email", email.trim());
    const qs = q.toString();
    return qs ? `${connectHref}?${qs}` : connectHref;
  })();
  const [provider, setProvider] = useState<ProviderAnswer | null>(null);
  const guide = path ? GUIDES[path] : null;
  // Beim Business-Weg erst klären, ob die Nummer schon bei einem anderen Anbieter hängt.
  const isBusiness = path === "business";
  const canStart = !guide ? false : isBusiness ? businessCanStart(provider) : guide.canStart;
  const showSteps = !!guide && (!isBusiness || canStart);
  const needsHelp = anbieter || (isBusiness && provider === "unklar");
  const hilfeKnopf = (
    <Link href={helpHref} className={buttonClass(needsHelp ? "primary" : "secondary", "md", "justify-center gap-1.5")}>
      <LifeBuoy className="h-4 w-4" /> Lieber gemeinsam? 15-Minuten-Hilfetermin buchen
    </Link>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken,#f8fafc)] px-4 py-3" data-wa-checklist>
        <p className="text-[15px] font-medium">Vorher kurz prüfen:</p>
        <ul className="mt-2 space-y-1.5 text-[15px]">
          <li className="flex gap-2" data-wa-pruefpunkt-anbieter><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--muted)]" /> <span>{VORPRUEFUNG_ANBIETER}</span></li>
          <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--muted)]" /> <span>Eine Nummer, die <b>nicht</b> in der normalen WhatsApp-App genutzt wird (z. B. zweite SIM, Festnetz oder neue Nummer).</span></li>
          <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--muted)]" /> <span>Sie können an dieser Nummer jetzt eine SMS oder einen Anruf mit Bestätigungscode empfangen.</span></li>
          <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--muted)]" /> <span>Sie sind bei Facebook angemeldet und Admin Ihres Business Managers.</span></li>
        </ul>
      </div>
      <fieldset>
        <legend className="mb-2 text-[15px] font-semibold">Welche Nummer soll Ihr Assistent nutzen?</legend>
        <div className="grid gap-2" role="radiogroup" aria-label="Welche Nummer soll Ihr Assistent nutzen?">
          {[...PATH_OPTIONS, { path: "anbieter" as const, ...ANBIETER_OPTION }].map((o) => {
            const on = wahl === o.path;
            return (
              <button
                key={o.path}
                type="button"
                role="radio"
                aria-checked={on}
                data-weg={o.path}
                onClick={() => setWahl(o.path)}
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

      {anbieter ? (
        <div className="space-y-5" data-guide="anbieter">
          <p className={cn("rounded-[var(--radius-md)] border px-4 py-3 text-sm", TONE_CLASS.warn)}>{ANBIETER_GUIDE.intro}</p>
          <ol className="space-y-3">
            {ANBIETER_GUIDE.steps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-sunken,#f1f5f9)] text-xs font-semibold tabular-nums">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <span className="text-[15px] font-medium">{s.title}</span>
                  <p className="mt-0.5 text-sm text-[color:var(--muted)]">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-2 sm:flex-row">{hilfeKnopf}</div>
        </div>
      ) : guide ? (
        <div className="space-y-5" data-guide={path}>
          <p className={cn("rounded-[var(--radius-md)] border px-4 py-3 text-sm", TONE_CLASS[guide.tone])}>{guide.intro}</p>

          {isBusiness ? (
            <div className="space-y-3 rounded-[var(--radius-md)] border border-[color:var(--border)] p-4">
              <Choice
                name="provider"
                question={PROVIDER_QUESTION.question}
                options={PROVIDER_QUESTION.answers}
                value={provider}
                onChange={setProvider}
              />
              {provider === "ja" ? (
                <div className="space-y-2" data-wa-anbieter-ja>
                  <p className="text-sm">{PROVIDER_YES}</p>
                  <button type="button" onClick={() => setWahl("anbieter")} className={buttonClass("primary", "md", "justify-center")}>
                    So lassen Sie die Nummer freigeben
                  </button>
                </div>
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

          {canStart && showVideo ? (
            <div data-whatsapp-video>
              <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
                <PlayCircle className="h-4 w-4 text-[color:var(--brand)]" /> So läuft es ab: {VIDEOS.whatsapp.title}
              </h3>
              <IntroVideo kind="whatsapp" />
            </div>
          ) : null}

          {/* Video statt langer Schrittliste (Ole, 15.11.2026); die Schritte bleiben zum Nachlesen eingeklappt. */}
          {showSteps && guide.steps.length ? (
            canStart && showVideo ? (
              <details className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3" data-whatsapp-steps>
                <summary className="flex cursor-pointer items-center gap-2 text-[15px] font-medium text-[color:var(--brand)]">
                  <ListChecks className="h-4 w-4" /> Alle Schritte zum Nachlesen ({guide.steps.length})
                </summary>
                <div className="mt-3">
              <ol className="space-y-3">
                {guide.steps.map((s, i) => (
                  <GuideStepItem key={s.title} step={s} n={i + 1} />
                ))}
              </ol>
                </div>
              </details>
            ) : (
              <div>
                <h3 className="mb-2 text-[15px] font-semibold">So läuft es ab</h3>
              <ol className="space-y-3">
                {guide.steps.map((s, i) => (
                  <GuideStepItem key={s.title} step={s} n={i + 1} />
                ))}
              </ol>
              </div>
            )
          ) : null}

          {canStart && inviteEmail ? (
            <div className="text-sm" data-wa-einladung-email>
              {emailAendern ? (
                <label className="block">
                  <span className="font-medium">
                    {firmenAdresse ? "An welche private E-Mail soll die Einladung gehen? Firmen-Postfächer blockieren sie oft." : "Einladung von 360dialog an"}
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder={firmenAdresse ? "z. B. name@gmail.com" : undefined}
                    className="mt-1 block w-full rounded-[var(--radius-md)] border border-[color:var(--border)] px-3 py-2 text-[15px]"
                    data-wa-einladung-email-feld
                  />
                </label>
              ) : (
                <p>
                  Einladung von 360dialog an <b className="break-all">{email}</b>{" "}
                  <button type="button" onClick={() => setEmailAendern(true)} className="font-medium text-[color:var(--brand)] underline" disabled={readOnly}>
                    Ändern
                  </button>
                </p>
              )}
              <p className="mt-1 text-[color:var(--muted)]">
                {firmenAdresse ? (
                  <>
                    Leer lassen, dann geht sie an <span className="break-all">{inviteEmail}</span>.
                  </>
                ) : (
                  "Firmen-Postfächer filtern diese E-Mail manchmal, dann besser eine private Adresse nehmen."
                )}
              </p>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {canStart ? (
              <a
                href={startHref}
                className={buttonClass("primary", "md", cn("justify-center", readOnly && "pointer-events-none opacity-60"))}
                aria-disabled={readOnly || undefined}
              >
                Jetzt WhatsApp verbinden
              </a>
            ) : null}
            {hilfeKnopf}
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

/** Ein Schritt der Anleitung, mit Bildschirmfoto zum Vergrößern (Ole, 15.11.2026). */
export function GuideStepItem({ step: s, n }: { step: GuideStep; n: number }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-sunken,#f1f5f9)] text-xs font-semibold tabular-nums">{n}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-medium">{s.title}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", WHERE_CLASS[s.where])}>{WHERE_LABEL[s.where]}</span>
        </div>
        <p className="mt-0.5 text-sm text-[color:var(--muted)]">{s.text}</p>
        {s.pitfall ? <p className="mt-1 text-sm text-amber-800">Falls es hakt: {s.pitfall}</p> : null}
        {s.image ? (
          <a href={s.image.src} target="_blank" rel="noopener noreferrer" className="mt-2 block max-w-md" title="Zum Vergrößern antippen" data-guide-image>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.image.src} alt={s.image.alt} loading="lazy" className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] shadow-sm" />
          </a>
        ) : null}
      </div>
    </li>
  );
}
