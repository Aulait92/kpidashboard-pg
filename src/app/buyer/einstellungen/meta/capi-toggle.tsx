"use client";

// Schalter „Rückmeldung an Meta“ (Conversions API für CRM, Ole 15.11.2026); nur der Inhaber schaltet.

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { setCapiEnabledAction } from "./actions";

export function CapiToggle({ on: initial, canEdit }: { on: boolean; canEdit: boolean }) {
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const toggle = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      const res = await setCapiEnabledAction(next);
      if (!res.ok) {
        setOn(!next);
        toast.show({ message: res.error, tone: "error" });
      } else toast.show({ message: next ? "Rückmeldung an" : "Rückmeldung aus" });
    });
  };
  // Schalter wie in den übrigen Einstellungen (UX-Runde 19.11.2026, vorher Kästchen)
  return (
    <div className="flex items-center gap-4 p-5" data-capi-toggle>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">Ergebnisse an Meta zurückmelden</span>
        <span className="mt-1 block text-sm text-[color:var(--muted)]">
          Meta erfährt, welche Leads aus Ihren Anzeigen erreicht wurden, einen Termin hatten oder abgeschlossen haben, und sucht gezielter nach ähnlichen
          Menschen.
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Ergebnisse an Meta zurückmelden"
        disabled={!canEdit || pending}
        onClick={toggle}
        className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${on ? "bg-[color:var(--brand)]" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
