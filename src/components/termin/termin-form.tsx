"use client";

import { useActionState, useState } from "react";
import { CalendarCheck, Loader2 } from "lucide-react";
import { PhoneField } from "@/components/phone-field";

export type TerminDay = { ymd: string; weekday: string; date: string; long: string; slots: { start: string; time: string }[] };
export type TerminFormState = { error?: string; values?: Record<string, string> };
type Action = (prev: TerminFormState, fd: FormData) => Promise<TerminFormState>;

const input =
  "w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2.5 text-base transition focus:border-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/15";
const chip =
  "cursor-pointer rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white py-2.5 text-center text-sm font-semibold tabular-nums transition hover:border-[color:var(--brand)] has-checked:border-[color:var(--brand)] has-checked:bg-[color:var(--brand)] has-checked:text-white";

/**
 * Zeit wählen, dann (nur bei der Buchung) Kontaktdaten. Handy zuerst: Tage als waagerechte Leiste,
 * Uhrzeiten des gewählten Tages darunter, Formular erst nach Wahl einer Uhrzeit.
 */
export function TerminForm({
  action,
  days,
  hidden,
  fields,
  prefill,
  interests = [],
  consentText = "",
  privacyUrl = "",
  submitLabel,
}: {
  action: Action;
  days: TerminDay[];
  hidden: Record<string, string>;
  fields: boolean;
  prefill?: { name?: string; email?: string; phone?: string; company?: string };
  interests?: string[];
  consentText?: string;
  privacyUrl?: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<TerminFormState, FormData>(action, {});
  const v = { ...prefill, ...state.values } as Record<string, string | undefined>;
  const [day, setDay] = useState(() => days.find((d) => d.slots.some((s) => s.start === v.start))?.ymd ?? days[0]?.ymd);
  const [start, setStart] = useState<string | null>(v.start ?? null);
  const [message, setMessage] = useState(!!v.message);
  const current = days.find((d) => d.ymd === day) ?? days[0];
  const chosen = days.flatMap((d) => d.slots.map((s) => ({ ...s, long: d.long }))).find((s) => s.start === start);

  return (
    <form action={formAction} className="space-y-6" data-termin-form>
      {Object.entries(hidden).map(([k, val]) => (
        <input key={k} type="hidden" name={k} value={val} />
      ))}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Tag wählen</h2>
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Tag">
          {days.map((d) => (
            <button
              key={d.ymd}
              type="button"
              role="radio"
              aria-checked={d.ymd === current?.ymd}
              onClick={() => setDay(d.ymd)}
              className={`flex w-16 shrink-0 snap-start flex-col items-center rounded-[var(--radius-sm)] border py-2 text-sm transition ${
                d.ymd === current?.ymd
                  ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]"
                  : "border-[color:var(--border)] bg-white hover:border-[color:var(--brand)]"
              }`}
            >
              <span className="text-xs font-medium">{d.weekday}</span>
              <span className="font-semibold tabular-nums">{d.date}</span>
            </button>
          ))}
        </div>
        {current ? (
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-medium text-[color:var(--muted)]">{current.long}</div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {current.slots.map((s) => (
                <label key={s.start} className={chip}>
                  <input type="radio" name="start" value={s.start} required checked={start === s.start} onChange={() => setStart(s.start)} className="sr-only" />
                  {s.time}
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {chosen ? (
        <>
          <p className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2.5 text-sm font-medium" data-termin-gewaehlt>
            <CalendarCheck className="h-4 w-4 shrink-0 text-[color:var(--brand)]" />
            {chosen.long}, {chosen.time} Uhr
          </p>
          {fields ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Ihre Angaben</h2>
              <Field name="name" label="Vor- und Nachname" autoComplete="name" defaultValue={v.name} />
              <Field name="company" label="Agentur oder Firma" autoComplete="organization" defaultValue={v.company} />
              <Field name="email" label="E-Mail" type="email" autoComplete="email" defaultValue={v.email} />
              <PhoneField name="phone" label="Telefon (für WhatsApp und Rückfragen)" defaultInternational={v.phone?.replace(/^\+/, "")} />
              <fieldset>
                <legend className="mb-1 block text-xs font-medium text-[color:var(--muted)]">Sie sind</legend>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["vertreter", "Vertreter"],
                    ["makler", "Makler"],
                  ].map(([key, label]) => (
                    <label key={key} className={chip}>
                      <input type="radio" name="role" value={key} required defaultChecked={v.role === key} className="sr-only" />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">Interesse</span>
                <select name="interest" required defaultValue={v.interest ?? ""} className={input}>
                  <option value="" disabled>
                    Sparte wählen
                  </option>
                  {interests.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </label>
              {message ? (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">Nachricht (optional)</span>
                  <textarea name="message" rows={3} maxLength={1000} defaultValue={v.message} className={input} />
                </label>
              ) : (
                <button type="button" onClick={() => setMessage(true)} className="text-sm font-semibold text-[color:var(--brand)] hover:underline">
                  Nachricht hinzufügen
                </button>
              )}
              {/* Bot-Falle: für Menschen unsichtbar */}
              <input
                type="text"
                name="zq_hp_field"
                tabIndex={-1}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                aria-hidden="true"
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
              />
              <label className="flex items-start gap-2 pt-1 text-xs leading-relaxed text-[color:var(--muted)]">
                <input type="checkbox" name="consent" required defaultChecked={v.consent === "on"} className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {consentText} Hinweise in der{" "}
                  <a href={privacyUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    Datenschutzerklärung
                  </a>
                  .
                </span>
              </label>
            </section>
          ) : null}
          {state.error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
              {state.error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-base font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </button>
        </>
      ) : state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function Field({ name, label, type = "text", autoComplete, defaultValue }: { name: string; label: string; type?: string; autoComplete?: string; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">{label}</span>
      <input name={name} type={type} required autoComplete={autoComplete} defaultValue={defaultValue} className={input} />
    </label>
  );
}
