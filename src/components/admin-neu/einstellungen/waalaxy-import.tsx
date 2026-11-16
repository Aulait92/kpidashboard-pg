"use client";

import { useActionState } from "react";
import { importWaalaxyAction } from "@/app/admin/vertrieb/actions";
import { Button } from "@/components/ui";
import { FileDrop } from "@/components/ui/file-drop";

// Waalaxy-Export (CSV) einlesen: ordnet LinkedIn-Prospects den Vertriebskontakten zu. Die Server Action gab es schon,
// aber ohne Oberfläche (heute nur per Skript); im neuen Admin unter Anbindungen → LinkedIn.
export function WaalaxyImport() {
  const [state, action, pending] = useActionState(importWaalaxyAction, null);
  return (
    <form action={action} className="space-y-3">
      <FileDrop name="file" accept=".csv,text/csv" maxBytes={15 * 1024 * 1024} label="Waalaxy-CSV auswählen" pendingLabel="Wird eingelesen …" required />
      <Button disabled={pending}>{pending ? "Lese ein …" : "Waalaxy-CSV einlesen"}</Button>
      {state ? <p className={`text-sm ${state.ok ? "text-emerald-700" : "text-rose-600"}`}>{state.message}</p> : null}
    </form>
  );
}
