"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { requestEmailChangeAction, type EmailChangeState } from "./actions";

const input =
  "mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";

/** Login-E-Mail ändern: Bestätigungslink an die neue Adresse (lib/email-aendern.ts). */
export function EmailChangeForm({ current, hasPassword, readOnly }: { current: string; hasPassword: boolean; readOnly: boolean }) {
  const [state, action, pending] = useActionState<EmailChangeState, FormData>(requestEmailChangeAction, {});
  if (state.ok) {
    return (
      <p className="flex items-start gap-2 rounded-[var(--radius-md)] bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-email-change-sent>
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Fast geschafft: Wir haben einen Bestätigungslink an <b>{state.to}</b> geschickt. Bis Sie ihn anklicken, gilt weiter {current}.
        </span>
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3 text-sm" data-email-change>
      <p className="text-[color:var(--muted)]">
        Aktuell: <b className="break-all text-[color:var(--foreground)]">{current}</b>. Nach der Änderung melden Sie sich mit der neuen Adresse an, Ihr Passwort bleibt.
      </p>
      <label className="block">
        <span className="font-medium">Neue E-Mail-Adresse</span>
        <input name="email" type="email" required autoComplete="email" className={input} disabled={readOnly} />
      </label>
      {hasPassword ? (
        <label className="block">
          <span className="font-medium">Ihr Passwort zur Bestätigung</span>
          <input name="password" type="password" required autoComplete="current-password" className={input} disabled={readOnly} />
        </label>
      ) : null}
      {state.error ? <p className="font-medium text-rose-700">{state.error}</p> : null}
      <button type="submit" className={buttonClass("primary", "md")} disabled={pending || readOnly}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Bestätigungslink senden
      </button>
    </form>
  );
}
