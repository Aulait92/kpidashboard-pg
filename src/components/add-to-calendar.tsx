import { CalendarPlus } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { customerEventByToken, googleCalendarUrl } from "@/lib/calendar/add-to-calendar";

/** „Zum Kalender hinzufügen": ICS-Datei (iPhone/Outlook) + Google-Link (Android). */
export async function AddToCalendar({ token }: { token: string }) {
  const ev = await customerEventByToken(token);
  if (!ev) return null;
  const btn = buttonClass("secondary", "md", "min-w-0 px-2");
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-xs font-medium text-[color:var(--muted)]">
        Zum Kalender hinzufügen
      </div>
      <div className="grid grid-cols-2 gap-2">
        <a href={`/book/manage/${token}/ics`} className={btn}>
          <CalendarPlus className="h-4 w-4 shrink-0" /> Apple / Outlook
        </a>
        <a href={googleCalendarUrl(ev)} target="_blank" rel="noreferrer" className={btn}>
          <CalendarPlus className="h-4 w-4 shrink-0" /> Google
        </a>
      </div>
    </div>
  );
}
