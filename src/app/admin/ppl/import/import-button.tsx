"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { runImportAction, type ImportState } from "../actions";

export function ImportButton() {
  const [state, action, pending] = useActionState<ImportState, FormData>(runImportAction, {});
  return (
    <form action={action} className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="history" defaultChecked className="h-4 w-4" />
        Leads der letzten 30 Tage für den Dubletten-Abgleich übernehmen (nur Telefon, E-Mail, Produkt, Datum)
      </label>
      {state.error ? <p className="text-sm text-rose-700">{state.error}</p> : null}
      {state.message ? <p className="text-sm text-emerald-700">{state.message}</p> : null}
      <Button type="submit" variant="primary" size="md" disabled={pending}>
        {pending ? "Wird übernommen …" : "Jetzt übernehmen"}
      </Button>
    </form>
  );
}
