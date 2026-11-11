"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import type { TotpState } from "@/lib/totp-account";

type FormAction = (prev: TotpState, fd: FormData) => Promise<TotpState>;

const codeInput =
  "h-12 w-40 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white text-center text-xl tracking-[0.3em] outline-none focus:border-[color:var(--brand)]";
const btn =
  "inline-flex h-12 items-center gap-2 rounded-[var(--radius-sm)] px-5 text-sm font-semibold transition disabled:opacity-60";

export function ConfirmTotpForm({ confirmAction, doneHref }: { confirmAction: FormAction; doneHref: string }) {
  const [state, action, pending] = useActionState<TotpState, FormData>(confirmAction, {});
  if (state.backupCodes) {
    return (
      <div className="space-y-3">
        <p className="font-medium text-emerald-700">Zwei-Faktor-Login ist aktiv.</p>
        <p className="text-sm">
          <b>Notfall-Codes jetzt sichern</b> (z. B. im Passwort-Manager). Jeder Code funktioniert einmal, falls das Handy fehlt.
          Sie werden nur jetzt angezeigt.
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] p-4 font-mono text-sm sm:grid-cols-4">
          {state.backupCodes.map((c) => (
            <span key={c} className="select-all">
              {c}
            </span>
          ))}
        </div>
        <a href={doneHref} className="inline-flex h-11 items-center rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-sm font-semibold text-white">
          Gesichert, fertig
        </a>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input name="code" inputMode="numeric" autoComplete="one-time-code" required placeholder="123456" className={codeInput} />
      <button type="submit" disabled={pending} className={`${btn} bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-dark)]`}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Bestätigen und aktivieren
      </button>
      {state.error ? <span className="w-full text-sm font-medium text-rose-700">{state.error}</span> : null}
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
