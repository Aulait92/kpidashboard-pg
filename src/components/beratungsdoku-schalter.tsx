"use client";

// Schalter „Beratungsdokumentation nach dem Termin“ (Paket B, Ole 18.11.2026): Einstellungen und, optional eingeklappt,
// die Einrichtung. Standard aus; aus = nichts davon sichtbar. Nur Inhaber ändern ihn (Server prüft).

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { beratungsdokuSchalterAction } from "@/app/buyer/beratungsdoku-actions";

export const BD_SCHALTER_TITEL = "Beratungsdokumentation nach dem Termin";
export const BD_SCHALTER_TEXT = "Am Termin vorbefüllt erstellen und per E-Mail senden, Ihr Kunde bestätigt den Erhalt per Klick.";

export function BeratungsdokuSchalter({ an: start, darf }: { an: boolean; darf: boolean }) {
  const [an, setAn] = useState(start);
  const [pending, go] = useTransition();
  const toast = useToast();
  const umschalten = () =>
    go(async () => {
      const neu = !an;
      setAn(neu);
      const r = await beratungsdokuSchalterAction(neu);
      if (!r.ok) {
        setAn(!neu);
        toast.show({ message: "Das kann nur der Inhaber des Kontos ändern.", tone: "error" });
        return;
      }
      toast.show({ message: neu ? "Eingeschaltet: Sie finden es nach dem Termin an der Terminkarte." : "Ausgeschaltet" });
    });
  return (
    <div className="flex items-center gap-3 px-4 py-3.5" data-bd-schalter={an ? "an" : "aus"}>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">{BD_SCHALTER_TITEL}</p>
        <p className="text-sm text-[color:var(--muted)]">{BD_SCHALTER_TEXT}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={an}
        aria-label={BD_SCHALTER_TITEL}
        disabled={pending || !darf}
        onClick={umschalten}
        className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition disabled:opacity-60 ${an ? "bg-[color:var(--brand)]" : "bg-slate-300"}`}
      >
        <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all ${an ? "left-[23px]" : "left-[3px]"}`} />
      </button>
    </div>
  );
}
