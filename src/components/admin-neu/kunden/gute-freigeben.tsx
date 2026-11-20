"use client";

import { useActionState, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { alleGutenFreigebenAction } from "@/app/admin/neu/kunden/berichte/actions";
import type { ReportActionState } from "@/app/admin/monatsberichte/actions";

// Hauptaktion auf Betreuen › Monatsberichte: alle guten Entwürfe des Monats senden. Vorher eine Rückfrage im Fenster,
// weil die Berichte per E-Mail an die Kunden gehen.
export function GuteFreigeben({ month, anzahl, monat }: { month: string; anzahl: number; monat: string }) {
  const [state, action, pending] = useActionState<ReportActionState, FormData>(alleGutenFreigebenAction, {});
  const [frage, setFrage] = useState(false);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="primary" size="md" icon={pending ? Loader2 : Check} disabled={pending} onClick={() => setFrage(true)}>
        {anzahl === 1 ? "1 guten Bericht senden" : `${anzahl} gute Berichte senden`}
      </Button>
      {state.message || state.error ? <p className={`text-xs ${state.error ? "text-rose-700" : "text-emerald-700"}`}>{state.error ?? state.message}</p> : null}
      <Sheet
        open={frage}
        onClose={() => setFrage(false)}
        title={`${anzahl} ${anzahl === 1 ? "Bericht" : "Berichte"} für ${monat} senden?`}
        message="Nur Berichte mit „gut“ und sicheren Daten. Sie gehen unverändert per E-Mail an die Kunden."
      >
        <form action={action} onSubmit={() => setFrage(false)} className="p-4">
          <input type="hidden" name="month" value={month} />
          <Button type="submit" variant="primary" size="md" className="w-full justify-center">
            Jetzt senden
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
