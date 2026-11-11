"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { requestBestandModuleAction, type RequestState } from "@/app/buyer/bestand/actions";

/** Knopf „Modul anfragen“ – Anfrage geht an performancegrowth, gebucht wird von uns. */
export function ModuleRequestButton({ requestedAt, readOnly }: { requestedAt: string | null; readOnly: boolean }) {
  const [state, action, pending] = useActionState<RequestState, FormData>(requestBestandModuleAction, {});
  const done = state.ok || !!requestedAt;
  if (done) {
    return (
      <p className="rounded-[var(--radius-md)] bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 ring-1 ring-emerald-200" data-module-requested>
        Anfrage ist bei uns angekommen{requestedAt ? ` (${new Date(requestedAt).toLocaleDateString("de-DE")})` : ""}. Wir melden uns und schalten das Modul frei.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending || readOnly}
        className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Modul anfragen
      </button>
      {state.error ? <span className="text-sm font-medium text-rose-700">{state.error}</span> : null}
    </form>
  );
}
