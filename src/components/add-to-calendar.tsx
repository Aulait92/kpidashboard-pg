import { customerEventByToken, googleCalendarUrl } from "@/lib/calendar/add-to-calendar";

/** „Zum Kalender hinzufügen": ICS-Datei (iPhone/Outlook) + Google-Link (Android). */
export async function AddToCalendar({ token }: { token: string }) {
  const ev = await customerEventByToken(token);
  if (!ev) return null;
  const btn =
    "flex-1 rounded-xl border border-[color:var(--border)] bg-white py-2.5 text-center text-sm font-semibold hover:border-[color:var(--brand)]";
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-xs font-medium text-[color:var(--muted)]">
        Zum Kalender hinzufügen
      </div>
      <div className="flex gap-2">
        <a href={`/book/manage/${token}/ics`} className={btn}>
           iPhone / Outlook
        </a>
        <a href={googleCalendarUrl(ev)} target="_blank" rel="noreferrer" className={btn}>
          Google Kalender
        </a>
      </div>
    </div>
  );
}
