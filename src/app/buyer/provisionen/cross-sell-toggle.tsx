"use client";

// Schalter für Aufgaben auf „Heute“ nach einem Abschluss; stehen unter Einstellungen → Aufgaben und Erinnerungen
// (Ole, 15.11.2026, vorher unter Meine Provisionen). Seit der UX-Runde 19.11.2026 als Schalter wie die übrigen Zeilen der Seite
// (vorher Kästchen), Beschreibung in einem Satz.

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { setCrossSellReminderAction, setPoliceReminderAction } from "./actions";

/** Zeile mit Titel, einem Satz und Schalter rechts (gleiches Muster wie „Neue Leads per E-Mail“ und das Team). */
function SchalterZeile({
  titel,
  text,
  on: initial,
  canEdit,
  speichern,
  meldung,
  data,
}: {
  titel: string;
  text: string;
  on: boolean;
  canEdit: boolean;
  speichern: (next: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
  meldung: (next: boolean) => string;
  data: Record<string, string>;
}) {
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <div className="flex min-h-[64px] items-center gap-4 px-5 py-3" {...data}>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{titel}</span>
        <span className="block text-sm text-[color:var(--muted)]">{text}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={titel}
        disabled={!canEdit || pending}
        onClick={() => {
          const next = !on;
          setOn(next);
          start(async () => {
            const res = await speichern(next);
            if (!res.ok) {
              setOn(!next);
              toast.show({ message: res.error, tone: "error" });
            } else toast.show({ message: meldung(next) });
          });
        }}
        className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${on ? "bg-[color:var(--brand)]" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

/** Erinnerung „Weiteres Produkt anbieten?“ 6 Wochen nach dem ersten Abschluss (Standard an). */
export function CrossSellReminderToggle({ on, canEdit }: { on: boolean; canEdit: boolean }) {
  return (
    <SchalterZeile
      titel="Weiteres Produkt anbieten?"
      text="Aufgabe 6 Wochen nach dem ersten Abschluss, mit passenden Sparten. Nicht, wenn schon ein weiterer Vertrag da ist."
      on={on}
      canEdit={canEdit}
      speichern={setCrossSellReminderAction}
      meldung={(next) => (next ? "Erinnerung an" : "Erinnerung aus")}
      data={{ "data-cross-sell-toggle": "" }}
    />
  );
}

/** Aufgabe „Police da und erste Zahlung erfolgt?“ 2 Wochen nach dem ersten Abschluss (Standard an). */
export function PoliceReminderToggle({ on, canEdit }: { on: boolean; canEdit: boolean }) {
  return (
    <SchalterZeile
      titel="Police da und erste Zahlung erfolgt?"
      text="Aufgabe 2 Wochen nach dem ersten Abschluss, je Kontakt einmal. Nicht, wenn die Police schon hochgeladen ist."
      on={on}
      canEdit={canEdit}
      speichern={setPoliceReminderAction}
      meldung={(next) => (next ? "Aufgabe an" : "Aufgabe aus")}
      data={{ "data-police-toggle": "" }}
    />
  );
}
