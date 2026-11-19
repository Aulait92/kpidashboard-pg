"use client";

// Einstellungen: tägliche Erinnerung um 8 Uhr „Leads ohne nächsten Schritt“ an bzw. aus (je Login). Seit der UX-Runde
// 19.11.2026 ohne Symbol und mit dem gleichen Schalter wie die übrigen Zeilen (das Symbol ließ die Zeile wie einen Link wirken).

import { useState, useTransition } from "react";
import { setNextStepReminderAction } from "@/app/buyer/next-step-actions";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function NextStepReminderToggle({ initial, disabled = false }: { initial: boolean; disabled?: boolean }) {
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const toggle = () =>
    start(async () => {
      const next = !on;
      setOn(next);
      const res = await setNextStepReminderAction(next);
      if (!res.ok) {
        setOn(!next);
        return toast.show({ message: res.error, tone: "error" });
      }
      toast.show({ message: next ? "Tägliche Erinnerung an" : "Tägliche Erinnerung aus" });
    });
  return (
    <div className="flex min-h-[64px] items-center gap-4 px-5 py-3" data-next-step-reminder>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Tägliche Erinnerung um 8 Uhr</span>
        <span className="block text-sm text-[color:var(--muted)]">Per Push und E-Mail, wenn Leads keinen nächsten Schritt haben oder ein Termin-Ergebnis fehlt</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Tägliche Erinnerung"
        disabled={pending || disabled}
        onClick={toggle}
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50", on ? "bg-[color:var(--brand)]" : "bg-slate-300")}
      >
        <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
      </button>
    </div>
  );
}
