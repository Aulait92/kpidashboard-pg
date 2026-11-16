"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { setAnspracheAction, type AnspracheState } from "@/app/buyer/ansprache-actions";
import type { Ansprache } from "@/lib/ansprache";

/** Sie oder Du für alle Texte an Leads und Kunden (nur Inhaber). */
export function AnspracheForm({ current, readOnly }: { current: Ansprache; readOnly: boolean }) {
  const [state, action, pending] = useActionState<AnspracheState, FormData>(setAnspracheAction, {});
  return (
    <form action={action} className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 text-sm" data-ansprache-form>
      <p className="font-semibold">Ansprache Ihrer Leads und Kunden</p>
      <p className="mt-1 text-[color:var(--muted)]">Gilt für den WhatsApp-Assistenten, WhatsApp-Vorlagen, Termin-Nachrichten und E-Mail-Vorlagen.</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {(["sie", "du"] as const).map((v) => (
          <label key={v} className="flex min-h-10 cursor-pointer items-center gap-2">
            <input type="radio" name="ansprache" value={v} defaultChecked={current === v} disabled={readOnly} className="h-4 w-4" />
            {v === "sie" ? "Sie (förmlich)" : "Du (persönlich)"}
          </label>
        ))}
        <Button type="submit" variant="secondary" size="md" disabled={readOnly || pending}>
          {pending ? "Speichert …" : "Speichern"}
        </Button>
      </div>
      {state.error ? <p className="mt-2 font-medium text-rose-700">{state.error}</p> : null}
      {state.message ? <p className="mt-2 font-medium text-emerald-700">{state.message}</p> : null}
    </form>
  );
}
