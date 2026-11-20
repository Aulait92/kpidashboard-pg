"use client";

// Sammelanfrage Einwilligung (Paket 3, 20.11.2026): die eine Hauptaktion der Seite Einwilligungen. Fenster mit der Zahl
// und der Vorschau der E-Mail; der Vermittler bestätigt mit „{n} Kunden fragen“. Versand gedrosselt im Hintergrund.

import { useActionState, useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { bulkConsentRequestAction, type BulkAskState } from "@/app/buyer/bestand/actions";

const de = (n: number) => n.toLocaleString("de-DE");

export function ConsentBulkButton({ count, preview, readOnly }: { count: number; preview: { subject: string; body: string }; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<BulkAskState, FormData>(bulkConsentRequestAction, {});
  return (
    <>
      <Button variant="primary" size="md" icon={Mail} className="w-full sm:w-auto" disabled={readOnly || count === 0} onClick={() => setOpen(true)} data-consent-bulk-open>
        {readOnly ? "Vorschau: Versand ist aus" : `${de(count)} Kunden per E-Mail fragen`}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`${de(count)} Kunden um Einwilligung bitten`} message="Jeder bekommt eine persönliche E-Mail mit Ihrem Link und entscheidet selbst.">
        <form action={action} className="space-y-4 px-5 py-4 text-sm" data-consent-bulk-sheet>
          <input type="hidden" name="confirm" value="on" />
          <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-4 py-3" data-consent-bulk-preview>
            <p className="text-xs text-[color:var(--muted)]">Betreff: {preview.subject}</p>
            <p className="mt-2 whitespace-pre-line">{preview.body}</p>
            <p className="mt-2 text-xs text-[color:var(--muted)]">Darunter immer: Abmeldelink und Widerspruchshinweis</p>
          </div>
          {state.ok ? (
            <p className="font-medium text-emerald-700" data-consent-bulk-done>
              {de(state.planned ?? 0)} Anfragen sind eingeplant und gehen werktags nach und nach raus.
            </p>
          ) : (
            <>
              {state.error ? <p className="text-rose-700">{state.error}</p> : null}
              <Button type="submit" variant="primary" size="md" className="w-full" disabled={pending || readOnly}>
                {de(count)} Kunden fragen
              </Button>
              <p className="text-xs text-[color:var(--muted)]">Wer zustimmt, bestätigt per E-Mail. Wer nicht reagiert, wird frühestens nach 30 Tagen wieder gefragt.</p>
            </>
          )}
        </form>
      </Sheet>
    </>
  );
}
