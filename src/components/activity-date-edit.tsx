"use client";

import { CalendarPlus } from "lucide-react";
import {
  updateDealActivityDateAction,
  updateDealActivityScheduleAction,
} from "@/app/admin/crm/actions";

// Date → "YYYY-MM-DDTHH:mm" der WALL-CLOCK in Europe/Berlin (unabhängig davon,
// ob es beim SSR auf dem UTC-Server oder im Browser formatiert wird).
function toDatetimeLocal(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

// Inline editierbares Datum einer Aktivität — wiederverwendbar in der
// Aktivitäten-Übersicht (server-gerenderte Rows). kind="date" ändert das
// Aktivitäts-Datum (createdAt), kind="schedule" das „Geplant für" (scheduledFor).
export function ActivityDateEdit({
  activityId,
  dealId,
  kind,
  value,
}: {
  activityId: string;
  dealId: string;
  kind: "date" | "schedule";
  value: Date | null;
}) {
  const action =
    kind === "date"
      ? updateDealActivityDateAction
      : updateDealActivityScheduleAction;
  const name = kind === "date" ? "createdAt" : "scheduledFor";

  return (
    <form
      action={action}
      className={
        kind === "schedule"
          ? "inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-800"
          : "shrink-0"
      }
      title={kind === "date" ? "Datum der Aktivität ändern" : "Geplant für ändern"}
    >
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="dealId" value={dealId} />
      {kind === "schedule" ? (
        <span className="inline-flex items-center gap-1 font-medium">
          <CalendarPlus className="h-3 w-3" /> geplant für
        </span>
      ) : null}
      <input
        type="datetime-local"
        name={name}
        defaultValue={value ? toDatetimeLocal(value) : ""}
        onClick={(e) => {
          const el = e.currentTarget as HTMLInputElement & {
            showPicker?: () => void;
          };
          try {
            el.showPicker?.();
          } catch {
            /* ignore */
          }
        }}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={
          kind === "schedule"
            ? "rounded border border-blue-200 bg-white px-1 py-0.5 text-[11px] text-[color:var(--foreground)] focus:border-[color:var(--brand)] focus:outline-none"
            : "rounded border border-[color:var(--border)] bg-white px-1 py-0.5 text-[11px] text-[color:var(--muted)] focus:border-[color:var(--brand)] focus:outline-none"
        }
      />
    </form>
  );
}
