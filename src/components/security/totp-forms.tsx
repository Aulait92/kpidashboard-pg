"use client";

import { createContext, useActionState, useContext, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type { TotpState } from "@/lib/totp-account";

type FormAction = (prev: TotpState, fd: FormData) => Promise<TotpState>;

const codeInput =
  "h-12 w-40 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white text-center text-xl tracking-[0.3em] outline-none focus:border-[color:var(--brand)]";
const btn =
  "inline-flex h-12 items-center gap-2 rounded-[var(--radius-sm)] px-5 text-sm font-semibold transition disabled:opacity-60";

// Das Bestätigen läuft über den Rahmen (TotpRahmen), nicht über das Formular: Nach dem Bestätigen setzt der Server ein
// neues Sitzungs-Cookie, Next rendert die Seite in derselben Antwort neu und TotpPanel zeigt „aktiv“; das Formular ist
// dann weg. Der Rahmen steht in jedem Zweig an derselben Stelle, behält das Ergebnis und zeigt die Notfall-Codes.
type Bestaetigen = { action: (fd: FormData) => void; pending: boolean; error?: string };
const RahmenCtx = createContext<Bestaetigen | null>(null);

function NotfallCodes({ codes, doneHref, doneLabel }: { codes: string[]; doneHref: string; doneLabel: string }) {
  const [kopiert, setKopiert] = useState(false);
  const kopieren = () =>
    void navigator.clipboard
      ?.writeText(codes.join("\n"))
      .then(() => setKopiert(true))
      .catch(() => setKopiert(false));
  return (
    <div className="space-y-3" data-notfall-codes>
      <p className="font-medium text-emerald-700">Zwei-Faktor-Login ist aktiv.</p>
      <p className="text-sm">
        <b>Notfall-Codes jetzt sichern</b> (z. B. im Passwort-Manager). Jeder Code funktioniert einmal, falls das Handy fehlt.
        Sie werden nur jetzt angezeigt.
      </p>
      <div className="grid grid-cols-2 gap-2 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] p-4 font-mono text-sm sm:grid-cols-4">
        {codes.map((c) => (
          <span key={c} className="select-all">
            {c}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={kopieren} className={`${btn} border border-[color:var(--border)] bg-white`} data-codes-kopieren>
          {kopiert ? "Kopiert" : "Codes kopieren"}
        </button>
        <a href={doneHref} className="inline-flex h-12 items-center rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-sm font-semibold text-white" data-totp-fertig>
          {doneLabel}
        </a>
      </div>
    </div>
  );
}

/** Rahmen um den Zwei-Faktor-Bereich: bestätigt und zeigt danach die Notfall-Codes, auch wenn die Seite neu lädt. */
export function TotpRahmen({
  children,
  confirmAction,
  doneHref,
  doneLabel = "Gesichert, fertig",
}: {
  children: React.ReactNode;
  confirmAction: FormAction;
  doneHref: string;
  doneLabel?: string;
}) {
  const [state, action, pending] = useActionState<TotpState, FormData>(confirmAction, {});
  const wert = useMemo(() => ({ action, pending, error: state.error }), [action, pending, state.error]);
  if (state.backupCodes) return <NotfallCodes codes={state.backupCodes} doneHref={doneHref} doneLabel={doneLabel} />;
  return <RahmenCtx.Provider value={wert}>{children}</RahmenCtx.Provider>;
}

export function ConfirmTotpForm({ confirmAction, doneHref, doneLabel = "Gesichert, fertig" }: { confirmAction: FormAction; doneHref: string; doneLabel?: string }) {
  const [eigen, eigeneAction, eigenPending] = useActionState<TotpState, FormData>(confirmAction, {});
  const rahmen = useContext(RahmenCtx);
  if (!rahmen && eigen.backupCodes) return <NotfallCodes codes={eigen.backupCodes} doneHref={doneHref} doneLabel={doneLabel} />;
  const action = rahmen?.action ?? eigeneAction;
  const pending = rahmen ? rahmen.pending : eigenPending;
  const error = rahmen ? rahmen.error : eigen.error;
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input name="code" inputMode="numeric" autoComplete="one-time-code" required placeholder="123456" className={codeInput} />
      <button type="submit" disabled={pending} className={`${btn} bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-dark)]`}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Bestätigen und aktivieren
      </button>
      {error ? <span className="w-full text-sm font-medium text-rose-700">{error}</span> : null}
    </form>
  );
}

export function DisableTotpForm({ disableAction }: { disableAction: FormAction }) {
  const [state, action, pending] = useActionState<TotpState, FormData>(disableAction, {});
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-[color:var(--muted)]">Zwei-Faktor-Login ausschalten</summary>
      <form action={action} className="mt-3 flex flex-wrap items-center gap-3">
        <input name="code" inputMode="numeric" autoComplete="one-time-code" required placeholder="123456" className={codeInput} />
        <button type="submit" disabled={pending} className={`${btn} border border-rose-200 bg-white text-rose-700`}>
          Ausschalten
        </button>
        {state.error ? <span className="w-full font-medium text-rose-700">{state.error}</span> : null}
      </form>
    </details>
  );
}
