"use client";

// Wochen-Mail „Ihr Team diese Woche“ an bzw. aus (Ole, 27.11.2026); gleicher Schalter wie die übrigen Zeilen.

import { useState, useTransition } from "react";
import { setTeamWocheMailAction } from "./actions";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function TeamWocheToggle({ initial, disabled = false }: { initial: boolean; disabled?: boolean }) {
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const toggle = () =>
    start(async () => {
      const next = !on;
      setOn(next);
      const res = await setTeamWocheMailAction(next);
      if (!res.ok) {
        setOn(!next);
        return toast.show({ message: res.error, tone: "error" });
      }
      toast.show({ message: next ? "Wochen-Mail an" : "Wochen-Mail aus" });
    });
  return (
    <div className="flex min-h-[64px] items-center gap-4 px-5 py-3" data-team-woche>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Wochen-Mail „Ihr Team diese Woche“</span>
        <span className="block text-sm text-[color:var(--muted)]">Montags: Anrufe, Termine und fällige Wiedervorlagen je Person</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Wochen-Mail an das Team"
        disabled={pending || disabled}
        onClick={toggle}
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50", on ? "bg-[color:var(--brand)]" : "bg-slate-300")}
      >
        <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
      </button>
    </div>
  );
}
