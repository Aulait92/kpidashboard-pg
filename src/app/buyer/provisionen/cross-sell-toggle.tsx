"use client";

// Schalter für Aufgaben auf „Heute“ nach einem Abschluss; stehen unter Einstellungen → Aufgaben und Erinnerungen
// (Ole, 15.11.2026, vorher unter Meine Provisionen).

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { setCrossSellReminderAction, setPoliceReminderAction } from "./actions";

/** Erinnerung „Weiteres Produkt anbieten?“ 3 Wochen nach dem ersten Abschluss (Standard an). */
export function CrossSellReminderToggle({ on: initial, canEdit }: { on: boolean; canEdit: boolean }) {
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3 p-5" data-cross-sell-toggle>
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={on}
          disabled={!canEdit || pending}
          onChange={(e) => {
            const next = e.target.checked;
            setOn(next);
            start(async () => {
              const res = await setCrossSellReminderAction(next);
              if (!res.ok) {
                setOn(!next);
                toast.show({ message: res.error, tone: "error" });
              } else toast.show({ message: next ? "Erinnerung an" : "Erinnerung aus" });
            });
          }}
        />
        <span>
          <span className="block text-[15px] font-semibold">Erinnerung „Weiteres Produkt anbieten?“</span>
          <span className="mt-1 block text-sm text-[color:var(--muted)]">
            3 Wochen nach dem ersten Abschluss erscheint auf „Heute“ eine Aufgabe mit naheliegenden Sparten, z. B. Haftpflicht oder Unfall zum Tierschutz. Nicht,
            wenn schon ein weiterer Vertrag eingetragen ist.
          </span>
        </span>
      </label>
    </div>
  );
}

/** Aufgabe „Police da und erste Zahlung erfolgt?“ 2 Wochen nach dem ersten Abschluss (Standard an). */
export function PoliceReminderToggle({ on: initial, canEdit }: { on: boolean; canEdit: boolean }) {
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3 p-5" data-police-toggle>
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={on}
          disabled={!canEdit || pending}
          onChange={(e) => {
            const next = e.target.checked;
            setOn(next);
            start(async () => {
              const res = await setPoliceReminderAction(next);
              if (!res.ok) {
                setOn(!next);
                toast.show({ message: res.error, tone: "error" });
              } else toast.show({ message: next ? "Aufgabe an" : "Aufgabe aus" });
            });
          }}
        />
        <span>
          <span className="block text-[15px] font-semibold">Aufgabe „Police da und erste Zahlung erfolgt?“</span>
          <span className="mt-1 block text-sm text-[color:var(--muted)]">
            2 Wochen nach dem ersten Abschluss erscheint auf „Heute“ eine Aufgabe zur Kontrolle. Nicht, wenn die Police schon hochgeladen ist oder schon eine andere
            Wiedervorlage offen ist. Je Kontakt nur einmal.
          </span>
        </span>
      </label>
    </div>
  );
}
