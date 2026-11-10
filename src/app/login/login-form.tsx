"use client";

import { useActionState } from "react";
import { loginAction, totpAction, type LoginActionState } from "./actions";

export function LoginForm({
  next,
  startWithCode = false,
  error,
  sso = { google: false, microsoft: false },
}: {
  next: string;
  /** Nach Microsoft/Google-Anmeldung mit aktivem 2FA direkt den Code abfragen. */
  startWithCode?: boolean;
  error?: string;
  sso?: { google: boolean; microsoft: boolean };
}) {
  const [state, formAction, pending] = useActionState<
    LoginActionState,
    FormData
  >(loginAction, startWithCode ? { needsTotp: true } : error ? { error } : {});
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

  const ssoHref = (p: string) => `/api/auth/${p}/start${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  const anySso = sso.google || sso.microsoft;

  return (
    <>
    {anySso ? (
      <div className="mb-5 space-y-2">
        {sso.microsoft ? (
          <a href={ssoHref("microsoft")} className={SSO_BTN}>
            <MicrosoftLogo /> Mit Microsoft anmelden
          </a>
        ) : null}
        {sso.google ? (
          <a href={ssoHref("google")} className={SSO_BTN}>
            <GoogleLogo /> Mit Google anmelden
          </a>
        ) : null}
        <div className="flex items-center gap-3 pt-2 text-xs text-[color:var(--muted)]">
          <span className="h-px flex-1 bg-[color:var(--border)]" />
          oder mit Passwort
          <span className="h-px flex-1 bg-[color:var(--border)]" />
        </div>
      </div>
    ) : null}
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
    </>
  );
}

const SSO_BTN =
  "flex w-full items-center justify-center gap-2.5 rounded-lg border border-[color:var(--border)] bg-white px-4 py-2.5 text-sm font-semibold text-[color:var(--foreground)] shadow-sm transition hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-sunken,#f8fafc)]";

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
