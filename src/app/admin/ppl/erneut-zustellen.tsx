"use client";

import { useActionState } from "react";
import { erneutZustellenAction, type ZustellenState } from "./zustellen-actions";

/** Gelieferten Lead noch einmal über den Weg des Bezugs zustellen (Mail, PDF, Webhook). */
export function ErneutZustellen({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState<ZustellenState, FormData>(erneutZustellenAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Lead noch einmal an den Kunden zustellen?")) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      <input type="hidden" name="leadId" value={leadId} />
      <button disabled={pending} className="font-medium text-[color:var(--brand)] disabled:opacity-60">
        {pending ? "Stellt zu …" : "Nochmal zustellen"}
      </button>
      {state.error ? <span className="text-xs text-rose-700">{state.error}</span> : null}
      {state.message ? <span className="text-xs text-emerald-700">{state.message}</span> : null}
    </form>
  );
}
