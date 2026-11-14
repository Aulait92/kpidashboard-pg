// Nachfass-Aufgabe nach einer E-Mail mit Terminlink (Ole, 14.11.2026): „Kein Termin gebucht: nachfassen“.
// Bucht der Lead vorher, verschwindet die Aufgabe wieder. Keine Doppelung mit einer schon gesetzten
// Wiedervorlage oder einer laufenden Nachfass-Abfolge.

import { prisma } from "@/lib/prisma";
import { addWorkdays } from "@/lib/vertrieb/dates";
import { logLeadHistory } from "@/lib/lead-history";

export const TERMIN_ERINNERUNG_NOTE = "Kein Termin gebucht: nachfassen";

/** Werktage → Fälligkeit um 9 Uhr Berliner Zeit (8 Uhr UTC reicht für die „Heute“-Liste). */
function dueAt(now: Date, workdays: number): Date {
  const d = addWorkdays(now, Math.max(1, Math.min(10, Math.round(workdays))));
  d.setUTCHours(8, 0, 0, 0);
  return d;
}

/** Legt die Aufgabe an, wenn nichts anderes ansteht. Rückgabe: Text für die Rückmeldung oder null. */
export async function planTerminErinnerung(leadId: string, workdays: number, opts: { customerId: string; userId?: string | null; now?: Date }): Promise<string | null> {
  const now = opts.now ?? new Date();
  const [lead, running, appt] = await Promise.all([
    prisma.lead.findUnique({ where: { id: leadId }, select: { followUpAt: true } }),
    prisma.leadSequence.count({ where: { leadId, stoppedAt: null } }),
    prisma.appointment.count({ where: { leadId, status: "booked", startsAt: { gt: now } } }),
  ]);
  if (!lead || appt > 0) return null;
  if (lead.followUpAt) return "Die bestehende Wiedervorlage bleibt.";
  if (running > 0) return "Die laufende Nachfass-Abfolge erinnert Sie.";
  const at = dueAt(now, workdays);
  await prisma.lead.update({ where: { id: leadId }, data: { followUpAt: at, followUpNote: TERMIN_ERINNERUNG_NOTE } });
  const when = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "numeric" }).format(at);
  await logLeadHistory(leadId, "wiedervorlage", `Wiedervorlage ${when}: ${TERMIN_ERINNERUNG_NOTE}`, { customerId: opts.customerId, userId: opts.userId ?? null }).catch(() => {});
  return `Erinnerung am ${when}, falls kein Termin gebucht wird.`;
}

/** Termin gebucht: unsere Erinnerung wieder entfernen (andere Wiedervorlagen bleiben). */
export async function clearTerminErinnerung(leadId: string): Promise<void> {
  await prisma.lead.updateMany({ where: { id: leadId, followUpNote: TERMIN_ERINNERUNG_NOTE }, data: { followUpAt: null, followUpNote: null } });
}
