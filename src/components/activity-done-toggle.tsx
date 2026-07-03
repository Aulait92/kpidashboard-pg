"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { toggleDealActivityDoneAction } from "@/app/admin/crm/actions";

// Abhaken-Toggle einer Aktivität. Abgehakt → fällt aus „Heute"/„Kommende".
export function ActivityDoneToggle({
  activityId,
  done,
}: {
  activityId: string;
  done: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      await toggleDealActivityDoneAction(activityId, !done);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={done ? "Als offen markieren" : "Als erledigt abhaken"}
      className={
        done
          ? "inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 transition disabled:opacity-60"
          : "inline-flex items-center gap-1 rounded-md border border-[color:var(--border)] bg-white px-1.5 py-0.5 text-[11px] font-medium text-[color:var(--muted)] transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60"
      }
    >
      <Check className="h-3 w-3" />
      {done ? "Erledigt" : "Abhaken"}
    </button>
  );
}
