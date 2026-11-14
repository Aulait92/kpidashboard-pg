"use client";

// Einstellungen: tägliche Erinnerung um 8 Uhr „Leads ohne nächsten Schritt“ an bzw. aus (je Login).

import { useState, useTransition } from "react";
import { BellRing } from "lucide-react";
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
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-amber-500 text-white">
        <BellRing className="h-5 w-5" />
      </span>
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
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50", on ? "bg-emerald-600" : "bg-slate-300")}
      >
        <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
      </button>
    </div>
  );
}
