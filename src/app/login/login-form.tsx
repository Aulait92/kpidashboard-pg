"use client";

import { useActionState } from "react";
import { loginAction, type LoginActionState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<
    LoginActionState,
    FormData
  >(loginAction, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
          Email
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

      {state.error ? (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {state.error}
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
