"use client";

import { useActionState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { reactivateAction, type ReactivateState } from "./actions";

/** „Konto reaktivieren“: ein Klick, danach weiter in den Kundenbereich. */
export function Reaktivieren({ disabled = false }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState<ReactivateState, FormData>(reactivateAction, {});
  return (
    <form action={action} className="space-y-2">
      <button type="submit" className={buttonClass("primary", "md", "h-11")} disabled={pending || disabled} data-konto-reaktivieren>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        Konto reaktivieren
      </button>
      {state.error ? <p className="font-medium text-rose-700">{state.error}</p> : null}
    </form>
  );
}
