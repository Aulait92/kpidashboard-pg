// Diagnose q=kalender-check&kunde=<id> (Ole, 25.11.2026): warum zeigt die Buchungsseite keine freien Zeiten?
// Nur lesend. Zeigt je Buchungs-Kalender Quelle, Lead-Zeiten, Allianz-Verbindung (ohne Zugangsdaten),
// belegte Zeiten der nächsten 14 Tage und die Zeiten, die suggestSlots daraus vorschlägt.
import { prisma } from "@/lib/prisma";
import { adapterFor, bookingKeys, suggestSlots } from "@/lib/calendar";
import { loadLeadTimes } from "@/lib/calendar/lead-times";
import { decodeAllianzCalendar, fetchFreeSlots } from "@/lib/calendar/allianz-online";

const fmt = (d: Date) => d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export async function kalenderCheckDiagnose(p: URLSearchParams) {
  const customerId = p.get("kunde") ?? "";
  if (!customerId) return { error: "kunde=<Kunden-ID> fehlt" };
  const now = new Date();
  const max = new Date(now.getTime() + 14 * 86_400_000);
  const [conn, agent, keys] = await Promise.all([
    prisma.calendarConnection.findUnique({ where: { customerId }, select: { provider: true, status: true } }),
    prisma.agentConfig.findUnique({
      where: { customerId },
      select: { allianzCalendarEnc: true, allianzConsentAt: true, allianzLastOkAt: true, allianzLastError: true, availabilityIcsUrlEnc: true },
    }),
    bookingKeys(customerId),
  ]);
  const cal = decodeAllianzCalendar(agent?.allianzCalendarEnc);
  let allianzFrei: { anzahl: number; erste: string[] } | { fehler: string } | null = null;
  if (cal) {
    try {
      const ts = await fetchFreeSlots(cal, now, max);
      allianzFrei = { anzahl: ts.length, erste: ts.slice(0, 12).map((t) => fmt(new Date(t))) };
    } catch (e) {
      allianzFrei = { fehler: e instanceof Error ? e.message : String(e) };
    }
  }
  const kalender = [];
  for (const key of keys) {
    const lt = await loadLeadTimes(key).catch(() => null);
    let busy: { anzahl: number; beispiele: string[] } | { fehler: string };
    try {
      const b = await (await adapterFor(key)).getBusy(now, max);
      busy = { anzahl: b.length, beispiele: b.slice(0, 15).map((x) => `${fmt(new Date(x.start))} bis ${fmt(new Date(x.end))}`) };
    } catch (e) {
      busy = { fehler: e instanceof Error ? e.message : String(e) };
    }
    kalender.push({ key: key === customerId ? "Agentur" : key, leadZeiten: lt, belegt: busy });
  }
  let vorschlaege: string[] | { fehler: string };
  try {
    vorschlaege = (await suggestSlots(customerId, 30, 24, "lead", 14)).map((s) => fmt(new Date(s.start)));
  } catch (e) {
    vorschlaege = { fehler: e instanceof Error ? e.message : String(e) };
  }
  return {
    verbindung: conn,
    allianz: cal
      ? {
          zustimmung: !!agent?.allianzConsentAt,
          terminArt: cal.templateName,
          dauerMin: cal.durationMin,
          vorlaufMin: cal.leadTimeMin,
          nachlaufMin: cal.followupMin,
          fruehesterBuchungstag: cal.bookingDayEarliest,
          nurPerson: cal.resourceId ? (cal.resources.find((r) => r.id === cal.resourceId)?.name ?? cal.resourceId) : null,
          terminArten: cal.templates.map((t) => `${t.name} (${t.durationMin} Min.)`),
          zuletztOk: agent?.allianzLastOkAt,
          letzterFehler: agent?.allianzLastError,
          freieSlotsAllianz14Tage: allianzFrei,
        }
      : null,
    ics: !!agent?.availabilityIcsUrlEnc,
    buchungsKalender: kalender,
    vorschlaegeBuchungsseite: vorschlaege,
  };
}
