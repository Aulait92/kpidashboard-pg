// Lead antwortet nicht (Ole, 17.11.2026, Korrektur A): KEINE eigene Anruf-Logik, es gilt der Anrufplan aus
// lib/call-plan.ts (6 Versuche). Neu ist nur der Auslöser: 30 Minuten nach dem Erstanschreiben ohne Antwort, in den
// Geschäftszeiten des Vermittlers (aus seiner Verfügbarkeit, d. h. den Lead-Zeiten des Kalenders), sonst zu
// Arbeitsbeginn am nächsten Arbeitstag. Dann steht „Anrufversuch 1 von 6“ auf „Heute“ und der Vermittler bekommt den
// Push „Frau Becker hat noch nicht geantwortet. Jetzt anrufen?“ mit Deep-Link auf den Anruf (/buyer?anrufen=<id>).
// Die WhatsApp dazwischen kommt weiter aus den bestehenden Abfolgen („Chat ruht“, nach „nicht erreicht“ die
// Nicht-erreicht-Abfolge), es kommt keine zusätzliche. Antwortet der Lead im Chat, endet der Anrufplan
// (lib/anruf-ausloeser-server.ts anrufplanBeiAntwortStoppen). Rein und testbar; Datenbank: anruf-ausloeser-server.ts.

import { addDaysYmd, berlinYmd, weekdayOfYmd } from "@/lib/absence";
import { berlinAt, normalizeDuration, timesForDay, type LeadTimes } from "@/lib/calendar/lead-times";

/** So lange nach dem Erstanschreiben ohne Antwort startet der Anrufplan. */
export const ANTWORT_WARTEZEIT_MS = 30 * 60 * 1000;

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Geschäftszeit eines Wochentags aus der Verfügbarkeit: erste Startzeit bis Ende des letzten Termins (Minuten). */
export function geschaeftszeitTag(lt: LeadTimes, dow: number): { von: number; bis: number } | null {
  const starts = timesForDay(lt, dow);
  if (!starts.length) return null;
  const von = Math.min(...starts.map(toMin));
  const bis = Math.max(...starts.map(toMin)) + normalizeDuration(lt.durationMin);
  return { von, bis: Math.min(bis, 24 * 60) };
}

/**
 * Wann der Anrufplan startet: `ab` (Erstanschreiben plus 30 Minuten), wenn das in der Geschäftszeit liegt; davor der
 * Beginn der Geschäftszeit desselben Tages; danach Arbeitsbeginn am nächsten Tag mit Verfügbarkeit (höchstens 14 Tage
 * voraus, sonst `ab`).
 */
export function anrufStartZeitpunkt(ab: Date, lt: LeadTimes): Date {
  const tag0 = berlinYmd(ab);
  const jetztMin = (() => {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ab);
    return Number(p.find((x) => x.type === "hour")?.value) * 60 + Number(p.find((x) => x.type === "minute")?.value);
  })();
  for (let d = 0; d < 14; d++) {
    const ymd = addDaysYmd(tag0, d);
    const g = geschaeftszeitTag(lt, weekdayOfYmd(ymd));
    if (!g) continue;
    if (d === 0) {
      if (jetztMin >= g.bis) continue;
      if (jetztMin >= g.von) return ab;
    }
    return berlinAt(ymd, toHhmm(g.von));
  }
  return ab;
}

/** Push an den Vermittler (Sie-Form; Ole: „Frau Becker hat noch nicht geantwortet. Jetzt anrufen?“). */
export function anrufPush(o: { leadId: string; name: string }) {
  return {
    title: `${o.name} hat noch nicht geantwortet. Jetzt anrufen?`,
    body: "Anrufversuch 1 von 6. Tippen Sie, um direkt anzurufen.",
    url: `/buyer?anrufen=${encodeURIComponent(o.leadId)}#anrufen`,
    tag: `anrufplan:${o.leadId}`,
  };
}
