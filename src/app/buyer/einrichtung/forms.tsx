"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { bookHelpCallAction, confirmMetaAccessAction, saveQuestionnaireAction, type SetupState } from "./actions";

const input =
  "h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";
const label = "text-sm font-medium";

type Answers = {
  callbackBy?: string;
  special?: string;
  formats?: string[];
  hours?: string;
  advisorEmail?: string;
  leadEmails?: string[];
};

function Feedback({ state }: { state: SetupState }) {
  if (state.error) return <p className="text-sm font-medium text-rose-700">{state.error}</p>;
  if (state.ok)
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> Gespeichert. Vielen Dank!
      </p>
    );
  return null;
}

export function QuestionnaireForm({ software, initial, readOnly }: { software: boolean; initial: Answers; readOnly: boolean }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(saveQuestionnaireAction, {});
  return (
    <form action={action} className="space-y-4">
      {software ? (
        <>
          <fieldset>
            <legend className={label}>Wie sollen Termine stattfinden?</legend>
            <div className="mt-2 flex flex-wrap gap-4 text-[15px]">
              {(
                [
                  ["telefon", "Telefon"],
                  ["video", "Video"],
                  ["vorOrt", "Vor Ort in der Agentur"],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" name={`format_${k}`} defaultChecked={initial.formats?.includes(k) ?? k === "telefon"} className="h-4 w-4 accent-[color:var(--brand)]" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className={label} htmlFor="advisorEmail">E-Mail für Termineinladungen</label>
            <input id="advisorEmail" name="advisorEmail" type="email" className={`${input} mt-1`} placeholder="vorname.nachname@allianz.de" defaultValue={initial.advisorEmail ?? ""} />
          </div>
        </>
      ) : (
        <div>
          <label className={label} htmlFor="leadEmails">Neue Leads per E-Mail an</label>
          <input id="leadEmails" name="leadEmails" className={`${input} mt-1`} placeholder="z. B. agentur@beispiel.de, mitarbeiter@beispiel.de" defaultValue={initial.leadEmails?.join(", ") ?? ""} />
        </div>
      )}
      <div>
        <label className={label} htmlFor="callbackBy">Wer ruft die Leads zurück?</label>
        <input id="callbackBy" name="callbackBy" className={`${input} mt-1`} placeholder="z. B. ich selbst / Frau Müller (Innendienst)" defaultValue={initial.callbackBy ?? ""} />
      </div>
      <div>
        <label className={label} htmlFor="special">Was macht Ihre Agentur besonders? (optional)</label>
        <textarea id="special" name="special" rows={3} className={`${input} mt-1 h-auto py-2`} placeholder="z. B. 20 Jahre Erfahrung, Beratung auch auf Türkisch, Termine abends" defaultValue={initial.special ?? ""} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || readOnly}
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Speichern
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function MetaConfirmButton({ done, readOnly }: { done: boolean; readOnly: boolean }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(confirmMetaAccessAction, {});
  if (done || state.ok)
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> Erledigt. Wir prüfen den Zugriff und melden uns, falls etwas fehlt.
      </p>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending || readOnly}
        className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Zugriff ist erteilt
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function HelpCallPicker({ slots, readOnly }: { slots: { start: string }[]; readOnly: boolean }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(bookHelpCallAction, {});
  if (state.ok) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> Termin gebucht. Die Einladung mit dem Video-Link kommt per E-Mail.
      </p>
    );
  }
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {slots.map((s, i) => (
          <label key={s.start} className="cursor-pointer">
            <input type="radio" name="start" value={s.start} defaultChecked={i === 0} className="peer sr-only" />
            <span className="block rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-center text-sm transition peer-checked:border-[color:var(--brand)] peer-checked:bg-[#EFF6FF] peer-checked:font-semibold">
              {fmt(s.start)} Uhr
            </span>
          </label>
        ))}
      </div>
      <input name="topic" placeholder="Worum geht es? (optional)" className={input} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || readOnly}
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--brand)] bg-white px-5 text-[15px] font-semibold text-[color:var(--brand)] transition hover:bg-[#EFF6FF] disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          15-Minuten-Termin buchen
        </button>
        {state.error ? <span className="text-sm font-medium text-rose-700">{state.error}</span> : null}
      </div>
    </form>
  );
}
