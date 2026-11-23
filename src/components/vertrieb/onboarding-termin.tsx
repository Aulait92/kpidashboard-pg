// Onboarding-Termin (60 Minuten) aus dem Admin buchen (Ole, 23.11.2026). Freie Zeiten aus dem Team-Kalender
// (lib/help-call.ts), Einladung mit Video-Link an den Kunden. Seltene Fälle (andere Uhrzeit) hinter „Andere Zeit“.
import { onboardingTerminBuchenAction } from "@/app/admin/vertrieb/onboarding-actions";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export async function OnboardingTermin({ onboardingId, zurueck, meldung }: { onboardingId: string; zurueck: string; meldung?: string | null }) {
  const { helpCallSlots, teamCalendarStatus } = await import("@/lib/help-call");
  const status = await teamCalendarStatus().catch(() => ({ connected: false }));
  const slots = status.connected ? await helpCallSlots(60).catch(() => []) : [];
  return (
    <form action={onboardingTerminBuchenAction} className="space-y-2 border-t border-slate-100 px-4 py-3 text-sm" data-onboarding-termin>
      <input type="hidden" name="id" value={onboardingId} />
      <input type="hidden" name="zurueck" value={zurueck} />
      <div className="font-medium">Onboarding-Termin (60 Min.)</div>
      {meldung && meldung !== "ok" ? <p className="text-rose-700">{meldung}</p> : null}
      {meldung === "ok" ? <p className="text-emerald-700">Gebucht, die Einladung mit Video-Link ist raus.</p> : null}
      {!status.connected ? (
        <p className="text-slate-500">Team-Kalender ist nicht verbunden, Buchung gerade nicht möglich.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select name="start" className="input max-w-xs" defaultValue={slots[0]?.start ?? ""}>
              {slots.length ? slots.map((s) => <option key={s.start} value={s.start}>{fmt(s.start)} Uhr</option>) : <option value="">Keine freie Zeit gefunden</option>}
            </select>
            <button className="btn-ghost">Termin buchen</button>
          </div>
          <details>
            <summary className="cursor-pointer text-slate-500">Andere Zeit</summary>
            <input type="datetime-local" name="andereZeit" step={900} className="input mt-2 max-w-xs" />
          </details>
        </>
      )}
    </form>
  );
}
