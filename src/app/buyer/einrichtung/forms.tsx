"use client";

import { useActionState, useState, useTransition } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Copy, Loader2, ShieldCheck, XCircle } from "lucide-react";
import type { MetaCheck } from "@/lib/selbst-einrichtung";
import type { TerminFormate } from "@/lib/termin-formate";
import { TerminFormateFelder } from "@/components/termin-formate";
import {
  bookHelpCallAction,
  checkMetaAccessAction,
  confirmConsentAction,
  confirmMetaAccessAction,
  saveImpressumUrlAction,
  saveQuestionnaireAction,
  skipSetupStepAction,
  type MetaSetupState,
  type SetupState,
} from "./actions";

const input =
  "h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";
const label = "text-sm font-medium";

type Answers = {
  ansprache?: "sie" | "du";
  callbackBy?: string;
  special?: string;
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

export function QuestionnaireForm({ software, initial, formate, readOnly }: { software: boolean; initial: Answers; formate?: TerminFormate; readOnly: boolean }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(saveQuestionnaireAction, {});
  return (
    <form action={action} className="space-y-4">
      {software ? (
        <>
          <TerminFormateFelder defaultValue={formate} />
        </>
      ) : (
        <div>
          <label className={label} htmlFor="leadEmails">Neue Leads per E-Mail an</label>
          <input id="leadEmails" name="leadEmails" className={`${input} mt-1`} placeholder="z. B. agentur@beispiel.de, mitarbeiter@beispiel.de" defaultValue={initial.leadEmails?.join(", ") ?? ""} />
        </div>
      )}
      {software ? (
        <fieldset>
          <legend className={label}>Wie sollen Ihre Leads angesprochen werden?</legend>
          <span className="block text-sm text-[color:var(--muted)]">Gilt für WhatsApp-Assistent, Termin-Nachrichten und E-Mail-Vorlagen. Später änderbar.</span>
          <div className="mt-2 flex flex-wrap gap-4 text-[15px]">
            {(
              [
                ["sie", "Sie (förmlich)"],
                ["du", "Du (persönlich)"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="radio" name="ansprache" value={k} defaultChecked={(initial.ansprache ?? "sie") === k} className="h-4 w-4 accent-[color:var(--brand)]" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div>
        <label className={label} htmlFor="special">Was macht Ihre Agentur besonders? (optional)</label>
        <span className="block text-sm text-[color:var(--muted)]">Wir nutzen das für Ihre Anzeigentexte.</span>
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

/** Impressum-Adresse nachtragen (Einrichtung, Schritt Erstinformation); freiwillig, blockiert nichts. */
export function ImpressumUrlForm({ readOnly }: { readOnly: boolean }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(saveImpressumUrlAction, {});
  if (state.ok)
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700" data-impressum-gespeichert>
        <CheckCircle2 className="h-4 w-4" /> Gespeichert. Ihre Seiten für Kunden verlinken jetzt Ihr Impressum.
      </p>
    );
  return (
    <form action={action} className="space-y-2" data-impressum-form>
      <label className={label} htmlFor="impressumUrl">
        Adresse Ihres Impressums
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="impressumUrl" name="impressumUrl" className={input} placeholder="z. B. agentur-muster.de/impressum" inputMode="url" autoComplete="url" disabled={readOnly || pending} />
        <button
          type="submit"
          disabled={pending || readOnly}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-5 text-[15px] font-semibold transition hover:bg-[color:var(--surface-sunken)] disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Speichern
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

/** Ampel-Zeile der Meta-Prüfung. */
function CheckRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <li className="flex items-start gap-2 text-[15px]">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />}
      <span>
        <b>{label}</b>
        {detail ? <span className="block text-sm text-[color:var(--muted)]">{detail}</span> : null}
      </span>
    </li>
  );
}

export function MetaCheckResult({ check }: { check: MetaCheck }) {
  return (
    <ul className="space-y-2 rounded-[var(--radius-md)] border border-[color:var(--border)] p-3" data-meta-check>
      <CheckRow label="Werbekonto" ok={check.adAccount.ok} detail={check.adAccount.ok ? check.adAccount.name : check.adAccount.error} />
      <CheckRow label="Facebook-Seite" ok={check.page.ok} detail={check.page.ok ? check.page.name : check.page.error} />
      <CheckRow label="Zugriff auf Leads" ok={check.leads.ok} detail={check.leads.ok ? "Leads kommen direkt bei Ihnen an." : check.leads.error} />
      {/* Datensatz: nicht nötig für den Schritt, daher Hinweis statt Fehler. Ältere Prüfungen haben das Feld nicht. */}
      {check.dataset ? <DatasetRow ds={check.dataset} /> : null}
    </ul>
  );
}

function DatasetRow({ ds }: { ds: NonNullable<MetaCheck["dataset"]> }) {
  const named = ds.name ? ` „${ds.name}“` : "";
  const row =
    ds.state === "ok"
      ? { label: "Datensatz freigegeben", detail: ds.name ? `${ds.name} (Rückmeldung an Meta möglich)` : "Rückmeldung an Meta möglich." }
      : ds.state === "found_not_shared"
        ? { label: `Datensatz${named} gefunden, aber noch nicht freigegeben`, detail: ds.error }
        : ds.state === "none"
          ? { label: "Kein Datensatz vorhanden (empfohlen: anlegen und freigeben)", detail: "Anleitung oben unter „Noch keinen Datensatz?“. Starten können wir auch ohne Datensatz." }
          : { label: "Datensatz", detail: ds.error };
  return (
    <li className="flex items-start gap-2 text-[15px]" data-meta-dataset={ds.state}>
      {ds.state === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
      <span>
        <b>{row.label}</b>
        {row.detail ? <span className="block text-sm text-[color:var(--muted)]">{row.detail}</span> : null}
      </span>
    </li>
  );
}

/** Meta freigeben: Kunde gibt uns als Partner frei, trägt Werbekonto + Seite ein und prüft den Zugriff. */
export function MetaAccessForm({
  initial,
  lastCheck,
  readOnly,
}: {
  initial: { adAccount: string; page: string };
  lastCheck: MetaCheck | null;
  readOnly: boolean;
}) {
  const [checkState, checkAction, checking] = useActionState<MetaSetupState, FormData>(checkMetaAccessAction, {});
  const check = checkState.check ?? lastCheck;
  const busy = checking || readOnly;
  return (
    <form className="space-y-3" data-meta-form>
      <div>
        <label className={label} htmlFor="adAccount">Werbekonto-ID</label>
        <input id="adAccount" name="adAccount" className={`${input} mt-1`} placeholder="act_123456789012345" defaultValue={initial.adAccount} />
        <p className="mt-1 text-xs text-[color:var(--muted)]">
          Zu finden im Werbeanzeigenmanager oben links unter dem Kontonamen oder in der Adresse nach „act=“. Den ganzen Link einfügen geht auch.
        </p>
      </div>
      <div>
        <label className={label} htmlFor="page">Facebook-Seite</label>
        <input id="page" name="page" className={`${input} mt-1`} placeholder="facebook.com/ihre-agentur oder Seiten-ID" defaultValue={initial.page} />
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="submit"
          formAction={checkAction}
          disabled={busy}
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Zugriff prüfen
        </button>
      </div>
      {checkState.message ? <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {checkState.message}</p> : null}
      {checkState.error ? <p className="text-sm font-medium text-rose-700">{checkState.error}</p> : null}
      {check ? <MetaCheckResult check={check} /> : null}
    </form>
  );
}

/** Text zum Kopieren (Einwilligung). */
export function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken,#f8fafc)] p-3">
      <p className="whitespace-pre-line text-[15px]" data-consent-text>{text}</p>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => setCopied(true));
        }}
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--brand)]"
      >
        <Copy className="h-4 w-4" /> {copied ? "Kopiert" : "Text kopieren"}
      </button>
    </div>
  );
}

export function ConsentDoneButton({ done, readOnly }: { done: boolean; readOnly: boolean }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(confirmConsentAction, {});
  if (done || state.ok)
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> Erledigt, danke!
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
        Ist in meinem Formular enthalten
      </button>
      {state.error ? <span className="text-sm font-medium text-rose-700">{state.error}</span> : null}
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

/** Schritt abhaken ohne Formular: App überspringen, Provisionen „Passt so“. */
export function SkipButton({ kind, label, readOnly, primary }: { kind: string; label: string; readOnly: boolean; primary?: boolean }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(skipSetupStepAction, {});
  if (state.ok)
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> Erledigt
      </p>
    );
  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-3">
      <input type="hidden" name="kind" value={kind} />
      <button
        type="submit"
        disabled={pending || readOnly}
        className={
          primary
            ? "inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
            : "inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--muted)] underline decoration-dotted underline-offset-2 hover:text-[color:var(--brand)] disabled:opacity-60"
        }
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : primary ? <CheckCircle2 className="h-4 w-4" /> : null}
        {label}
      </button>
      {state.error ? <span className="text-sm font-medium text-rose-700">{state.error}</span> : null}
    </form>
  );
}

/**
 * „Weiter“ (P8, eine Hauptaktion je Schritt): Schritt als erledigt merken und zum nächsten offenen Schritt springen.
 */
export function WeiterButton({ kind, next, readOnly }: { kind: string; next: string; readOnly: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Nach dem Speichern ganz neu laden: der nächste Schritt ist serverseitig aufgeklappt und der Anker scrollt hin
  // (der Knopf selbst verschwindet beim Neuzeichnen, deshalb nicht über useActionState)
  const weiter = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("kind", kind);
      const res = await skipSetupStepAction({}, fd);
      if (res.error) return setError(res.error);
      window.location.assign(next);
    });
  return (
    <div className="mt-5" data-weiter={kind}>
      <button
        type="button"
        onClick={weiter}
        disabled={pending || readOnly}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60 sm:w-auto sm:min-w-[200px]"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Weiter
        {!pending ? <ArrowRight className="h-4 w-4" /> : null}
      </button>
      {error ? <p className="mt-2 text-sm font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}

/**
 * Ausgänge eines Schritts (Ole, 15.11.2026): „Später“ (Schritt bleibt offen) und Überspringen mit Grund
 * (z. B. „Meine Gesellschaft erlaubt das nicht“). Der Grund wird gespeichert, der Schritt gilt dann als erledigt.
 */
export function StepExits({ laterHref, skips, readOnly }: { laterHref: string; skips: { kind: string; label: string }[]; readOnly: boolean }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[color:var(--border)] pt-4" data-step-exits>
      <a href={laterHref} className="text-sm font-semibold text-[color:var(--muted)] underline decoration-dotted underline-offset-2 hover:text-[color:var(--brand)]">
        Später
      </a>
      {skips.map((x) => (
        <SkipButton key={x.kind} kind={x.kind} label={x.label} readOnly={readOnly} />
      ))}
    </div>
  );
}
