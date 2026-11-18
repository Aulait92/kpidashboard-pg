"use client";

// Kampagne beenden (Ole, 18.11.2026): endgültig, mit kurzer Bestätigung im Auswahlfenster. Danach geht keine
// Nachricht mehr raus; wartende Empfänger werden übersprungen. Steht als Textknopf neben „Pausieren“.

import { useActionState, useState } from "react";
import { Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { endCampaignAction, type EndState } from "@/app/buyer/bestand/actions";

export function CampaignEndButton({ id, waiting, readOnly }: { id: string; waiting: number; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<EndState, FormData>(endCampaignAction, {});
  if (state.ok) return null;
  return (
    <>
      <button type="button" className="text-sm font-medium text-rose-700 hover:underline" disabled={readOnly} onClick={() => setOpen(true)} data-campaign-end>
        Beenden
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Kampagne beenden?" message="Endgültig, lässt sich nicht fortsetzen.">
        <form action={action} className="space-y-3 px-5 py-4 text-sm" data-campaign-end-dialog>
          <input type="hidden" name="id" value={id} />
          <p>
            {waiting > 0
              ? `${waiting.toLocaleString("de-DE")} Empfänger warten noch: Sie bekommen keine Nachricht mehr.`
              : "Es geht keine weitere Nachricht raus."}{" "}
            Antworten auf schon gesendete Nachrichten kommen weiter an.
          </p>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="confirm" required className="mt-0.5 h-4 w-4" data-campaign-end-confirm />
            <span>Ich möchte diese Kampagne endgültig beenden.</span>
          </label>
          {state.error ? <p className="font-medium text-rose-700">{state.error}</p> : null}
          <Button type="submit" variant="danger" size="md" className="w-full" disabled={pending || readOnly} icon={pending ? Loader2 : Square} data-campaign-end-submit>
            Kampagne beenden
          </Button>
        </form>
      </Sheet>
    </>
  );
}
