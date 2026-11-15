"use client";

// „Verbindung prüfen“: wenn das Verbinden bei 360dialog fertig war, hier aber nichts ankam.

import { useActionState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { checkWhatsAppConnectionAction, resetWhatsAppAction, type WaCheckState } from "./actions";

export function WaCheckButton({ readOnly, intro = true }: { readOnly: boolean; intro?: boolean }) {
  const [state, action, pending] = useActionState<WaCheckState, FormData>(checkWhatsAppConnectionAction, {});
  return (
    <form action={action} className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 py-3 text-sm" data-wa-check>
      {intro ? <p className="mb-2 text-[color:var(--muted)]">Sie haben das Verbinden bei 360dialog schon abgeschlossen, hier steht aber noch nicht „Verbunden“?</p> : null}
      <button type="submit" className={buttonClass("secondary", "md")} disabled={pending || readOnly}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Verbindung prüfen
      </button>
      {state.message ? <p className="mt-2 font-medium text-emerald-700">{state.message}</p> : null}
      {state.error ? <p className="mt-2 font-medium text-rose-700">{state.error}</p> : null}
    </form>
  );
}

/** „Neu beginnen“: halb fertige Verbindung verwerfen (z. B. falsche E-Mail, abgebrochen). */
export function WaResetButton({ readOnly }: { readOnly: boolean }) {
  const [state, action, pending] = useActionState<WaCheckState, FormData>(resetWhatsAppAction, {});
  if (readOnly) return null;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Verbinden abbrechen und neu beginnen? Ihr Konto bei 360dialog bleibt bestehen.")) e.preventDefault();
      }}
      className="mt-3 text-sm"
      data-wa-reset
    >
      <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 text-[color:var(--muted)] underline decoration-dotted underline-offset-4 hover:text-[color:var(--text)]">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Abbrechen und neu beginnen
      </button>
      {state.message ? <p className="mt-2 font-medium text-emerald-700">{state.message}</p> : null}
      {state.error ? <p className="mt-2 font-medium text-rose-700">{state.error}</p> : null}
    </form>
  );
}
