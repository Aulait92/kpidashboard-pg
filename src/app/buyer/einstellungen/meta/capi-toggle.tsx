"use client";

// Schalter „Rückmeldung an Meta“ (Conversions API für CRM, Ole 15.11.2026); nur der Inhaber schaltet.

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { setCapiEnabledAction } from "./actions";

export function CapiToggle({ on: initial, canEdit }: { on: boolean; canEdit: boolean }) {
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <label className="flex cursor-pointer items-start gap-3 p-5" data-capi-toggle>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4"
        checked={on}
        disabled={!canEdit || pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          start(async () => {
            const res = await setCapiEnabledAction(next);
            if (!res.ok) {
              setOn(!next);
              toast.show({ message: res.error, tone: "error" });
            } else toast.show({ message: next ? "Rückmeldung an" : "Rückmeldung aus" });
          });
        }}
      />
      <span>
        <span className="block text-[15px] font-semibold">Ergebnisse an Meta zurückmelden</span>
        <span className="mt-1 block text-sm text-[color:var(--muted)]">
          Meta erfährt, welche Leads aus Ihren Anzeigen erreicht wurden, einen Termin hatten oder abgeschlossen haben. So lernt Meta, welche Leads abschließen, und
          sucht gezielter nach ähnlichen Menschen.
        </span>
      </span>
    </label>
  );
}
