"use client";

import { useActionState } from "react";
import {
  forgotPasswordAction,
  type ForgotPasswordState,
} from "./actions";

export function ForgotPasswordForm({ email = "" }: { email?: string }) {
  const [state, formAction, pending] = useActionState<
    ForgotPasswordState,
    FormData
  >(forgotPasswordAction, {});

  if (state.ok) {
    return (
      <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <div className="font-medium">E-Mail ist unterwegs.</div>
        <p className="mt-1 text-xs text-emerald-700">
          Falls es für diese Adresse einen Zugang gibt, kommt in den nächsten
          Minuten eine E-Mail mit einem Link. Er ist 1 Stunde gültig.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium">E-Mail</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          defaultValue={email}
          className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-base focus:border-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-soft)]"
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
        {pending ? "Wird gesendet …" : "Link anfordern"}
      </button>
    </form>
  );
}
