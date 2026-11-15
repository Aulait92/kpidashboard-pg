"use client";

import { useActionState } from "react";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui";
import { eraseCustomerDataAction, type EraseCustomerState } from "./erase-actions";

export function EraseCustomerCard({
  customerId,
  customerName,
  leadCount,
  bestandCount = 0,
  archived = false,
  lastExport = null,
}: {
  customerId: string;
  customerName: string;
  leadCount: number;
  bestandCount?: number;
  archived?: boolean;
  /** Letzter Datenexport (Konto → „Daten herunterladen“), deutsch formatiert */
  lastExport?: string | null;
}) {
  const [state, action, pending] = useActionState<EraseCustomerState, FormData>(eraseCustomerDataAction, {});
  return (
    <details className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white">
      <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Vertragsende: Daten löschen</summary>
      <form action={action} className="space-y-3 border-t border-[color:var(--border)] px-5 py-4 text-sm">
        <p className="text-[color:var(--muted)]">
          Laut AVV spätestens 30 Tage nach Vertragsende. Anonymisiert alle {leadCount} Leads (Zahlen bleiben) und löscht Chats,
          Termine, Einwilligungen, Kalender- und Postfach-Verbindungen sowie den Bestand ({bestandCount} Bestandskunden mit Verträgen, Kampagnen,
          Einwilligungsprotokoll). Die Sperrliste der Abmeldungen (nur verschlüsselt) bleibt. Vorher dem Kunden den Datenexport anbieten (Konto → „Daten
          herunterladen“, auch in „Als Kunde ansehen“). Logins im Reiter „Logins“ entfernen.
        </p>
        <p className={lastExport ? "text-emerald-700" : "text-amber-800"} data-erase-export>
          {lastExport ? `Letzter Datenexport: ${lastExport}` : "Noch kein Datenexport heruntergeladen."}
        </p>
        <input type="hidden" name="customerId" value={customerId} />
        {!archived ? (
          <label className="flex items-start gap-2">
            <input type="checkbox" name="contractEnded" className="mt-0.5" />
            <span>Der Vertrag ist beendet (der Kunde ist noch nicht archiviert).</span>
          </label>
        ) : null}
        <label className="block">
          <span className="text-xs text-[color:var(--muted)]">Grund (steht im Protokoll)</span>
          <input name="reason" autoComplete="off" maxLength={300} className="mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3" />
        </label>
        <label className="block">
          <span className="text-xs text-[color:var(--muted)]">Zur Bestätigung „{customerName}“ eingeben</span>
          <input name="confirm" autoComplete="off" className="mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3" />
        </label>
        {state.error ? <p className="text-rose-700">{state.error}</p> : null}
        {state.message ? <p className="text-emerald-700">{state.message}</p> : null}
        <Button type="submit" variant="danger" size="md" icon={ShieldX} disabled={pending}>
          {pending ? "Wird gelöscht …" : "Endgültig löschen"}
        </Button>
      </form>
    </details>
  );
}
