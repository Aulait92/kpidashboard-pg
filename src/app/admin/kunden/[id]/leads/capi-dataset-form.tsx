"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { setCapiDatasetAction, type CapiDatasetState } from "./capi-actions";

export function CapiDatasetForm({ customerId, current }: { customerId: string; current: string | null }) {
  const [state, action, pending] = useActionState<CapiDatasetState, FormData>(setCapiDatasetAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="customerId" value={customerId} />
      <div className="flex gap-2">
        <input
          name="dataset"
          defaultValue={current ?? ""}
          placeholder="leer = automatisch aus dem Werbekonto"
          inputMode="numeric"
          className="h-10 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3"
        />
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? "Speichere …" : "Speichern"}
        </Button>
      </div>
      {state.message ? <p className="text-emerald-700">{state.message}</p> : null}
      {state.error ? <p className="text-rose-700">{state.error}</p> : null}
    </form>
  );
}
