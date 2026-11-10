"use client";

import { useActionState } from "react";
import { loginAction, totpAction, type LoginActionState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<
    LoginActionState,
    FormData
  >(loginAction, {});
  const [totpState, totpFormAction, totpPending] = useActionState<LoginActionState, FormData>(totpAction, {});

  // Zweiter Schritt: Code aus der Authenticator-App.
  if (state.needsTotp && !(totpState.error && !totpState.needsTotp)) {
    return (
      <form action={totpFormAction} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <p className="text-sm text-[color:var(--muted)]">Code aus deiner Authenticator-App eingeben.</p>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          placeholder="123456"
          className="w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-3 text-center text-2xl tracking-[0.4em] focus:border-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-soft)]"
        />
        {totpState.error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{totpState.error}</div> : null}
        <button
          type="submit"
          disabled={totpPending}
          className="w-full rounded-lg bg-[color:var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
        >
          {totpPending ? "Prüfe…" : "Bestätigen"}
        </button>
        <p className="text-center text-xs text-[color:var(--muted)]">Handy nicht zur Hand? Einen Notfall-Code eingeben.</p>
      </form>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
          E-Mail
        </span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-soft)]"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
          Passwort
        </span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-soft)]"
        />
      </label>

      {state.error || (totpState.error && !totpState.needsTotp) ? (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {state.error ?? totpState.error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[color:var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
      >
        {pending ? "Anmelden…" : "Anmelden"}
      </button>
    </form>
  );
}
