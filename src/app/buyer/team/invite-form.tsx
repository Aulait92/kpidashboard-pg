"use client";

import { useActionState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { inviteMemberAction, type TeamFormState } from "./actions";

const input =
  "h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";

export function InviteForm({ readOnly, costHint = null }: { readOnly: boolean; costHint?: string | null }) {
  const [state, action, pending] = useActionState<TeamFormState, FormData>(inviteMemberAction, {});
  return (
    <Card>
      <CardHeader title="Berater einladen" icon={UserPlus} />
      <form action={action} className="space-y-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="name" required placeholder="Vor- und Nachname" className={input} />
          <input name="email" type="email" required placeholder="E-Mail-Adresse" className={input} />
        </div>
        <p className="text-sm text-[color:var(--muted)]">Die Person bekommt per E-Mail einen Link zum Passwort-Festlegen.</p>
        {costHint ? (
          <p className="rounded-[var(--radius-sm)] bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 ring-1 ring-amber-200" data-seat-cost>
            + {costHint}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || readOnly}
            className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Einladen
          </button>
          {state.error ? <span className="text-sm font-medium text-rose-700">{state.error}</span> : null}
          {state.message ? <span className="text-sm font-medium text-emerald-700">{state.message}</span> : null}
        </div>
      </form>
    </Card>
  );
}
