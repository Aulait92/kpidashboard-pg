// Nachfass-Aufgaben nach einer E-Mail (Ole, 14.11.2026):
// - mit Terminlink: „Kein Termin gebucht: nachfassen“ (bucht der Lead vorher, verschwindet die Aufgabe)
// - „Nicht erschienen“: „Nicht erschienen: nachfassen“ (verschwindet ebenfalls bei einer Buchung)
// - „Unterlagen fehlen noch“: „Unterlagen nachfassen“ nach 3 Werktagen
// - „Wie besprochen: später melden“: Wiedervorlage zum gewählten Tag
// Keine Doppelung mit einer schon gesetzten Wiedervorlage oder einer laufenden Nachfass-Abfolge
// (Ausnahme: der ausdrücklich vereinbarte Tag bei „Wie besprochen“ ersetzt die bisherige Wiedervorlage).

import { prisma } from "@/lib/prisma";
import { addWorkdays, fromDayKey } from "@/lib/vertrieb/dates";
import { logLeadHistory } from "@/lib/lead-history";
import { stopSequences } from "@/lib/lead-sequences";
import type { Nachfassen } from "@/lib/mail/phasen";

export const TERMIN_ERINNERUNG_NOTE = "Kein Termin gebucht: nachfassen";
export const NICHT_ERSCHIENEN_NOTE = "Nicht erschienen: nachfassen";
export const UNTERLAGEN_NOTE = "Unterlagen nachfassen";
export const WIE_BESPROCHEN_NOTE = "Wie besprochen melden";

/** Notizen, die eine Buchung erledigt. */
const ERLEDIGT_BEI_BUCHUNG = [TERMIN_ERINNERUNG_NOTE, NICHT_ERSCHIENEN_NOTE];

/** Wiedervorlagen, die die App selbst anlegt (zählen nicht als „Später“). */
const AUTOMATISCH = new Set([TERMIN_ERINNERUNG_NOTE, NICHT_ERSCHIENEN_NOTE, UNTERLAGEN_NOTE, "Police fertig machen", "Angebot nachfassen"]);

/** „Später“: eine selbst gesetzte (oder vereinbarte) Wiedervorlage liegt in der Zukunft. */
export function istSpaeter(followUpAt: Date | null | undefined, note: string | null | undefined, now = new Date()): boolean {
  if (!followUpAt || followUpAt.getTime() <= now.getTime()) return false;
  return !AUTOMATISCH.has((note ?? "").trim());
}

const fmtTag = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "numeric" }).format(d);

/** Werktage → Fälligkeit um 9 Uhr Berliner Zeit (8 Uhr UTC reicht für die „Heute“-Liste). */
function dueAt(now: Date, workdays: number): Date {
  const d = addWorkdays(now, Math.max(1, Math.min(10, Math.round(workdays))));
  d.setUTCHours(8, 0, 0, 0);
  return d;
}

type Opts = { customerId: string; userId?: string | null; now?: Date };

/**
 * Nachfass-Aufgabe in N Werktagen, wenn nichts anderes ansteht. Rückgabe: Text für die Rückmeldung oder null.
 * skipIfBooked: bei einem gebuchten Termin entfällt sie (Terminlink, Nicht erschienen).
 */
export async function planNachfassAufgabe(
  leadId: string,
  input: { workdays: number; note: string; skipIfBooked: boolean; hinweis: string },
  opts: Opts,
): Promise<string | null> {
  const now = opts.now ?? new Date();
  const [lead, running, appt] = await Promise.all([
    prisma.lead.findUnique({ where: { id: leadId }, select: { followUpAt: true } }),
    prisma.leadSequence.count({ where: { leadId, stoppedAt: null } }),
    input.skipIfBooked ? prisma.appointment.count({ where: { leadId, status: "booked", startsAt: { gt: now } } }) : Promise.resolve(0),
  ]);
  if (!lead || appt > 0) return null;
  if (lead.followUpAt) return "Die bestehende Wiedervorlage bleibt.";
  if (running > 0) return "Die laufende Nachfass-Abfolge erinnert Sie.";
  const at = dueAt(now, input.workdays);
  // Nur setzen, wenn in der Zwischenzeit keine andere Wiedervorlage dazukam
  const r = await prisma.lead.updateMany({ where: { id: leadId, followUpAt: null }, data: { followUpAt: at, followUpNote: input.note } });
  if (!r.count) return "Die bestehende Wiedervorlage bleibt.";
  const when = fmtTag(at);
  await logLeadHistory(leadId, "wiedervorlage", `Wiedervorlage ${when}: ${input.note}`, { customerId: opts.customerId, userId: opts.userId ?? null }).catch(() => {});
  return `Erinnerung am ${when}, ${input.hinweis}.`;
}

/** Legt die Aufgabe „Kein Termin gebucht“ an, wenn nichts anderes ansteht. */
export async function planTerminErinnerung(leadId: string, workdays: number, opts: Opts): Promise<string | null> {
  return planNachfassAufgabe(leadId, { workdays, note: TERMIN_ERINNERUNG_NOTE, skipIfBooked: true, hinweis: "falls kein Termin gebucht wird" }, opts);
}

/**
 * „Wie besprochen“: Wiedervorlage zum vereinbarten Tag (9 Uhr). Ist sie schon genau so gesetzt, passiert nichts.
 * Eine andere Wiedervorlage wird ersetzt (der Kontakt hat den Tag ausdrücklich mit Ihnen vereinbart).
 */
export async function planWiedervorlageAm(leadId: string, dayKey: string, opts: Opts): Promise<string | null> {
  const now = opts.now ?? new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null;
  const at = fromDayKey(dayKey, "09:00");
  if (Number.isNaN(at.getTime()) || at.getTime() < now.getTime() - 86_400_000 || at.getTime() > now.getTime() + 2 * 365 * 86_400_000) return null;
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { followUpAt: true, followUpNote: true } });
  if (!lead) return null;
  const when = fmtTag(at);
  if (lead.followUpAt?.getTime() === at.getTime() && lead.followUpNote === WIE_BESPROCHEN_NOTE) return `Wiedervorlage am ${when} steht schon.`;
  await prisma.lead.update({ where: { id: leadId }, data: { followUpAt: at, followUpNote: WIE_BESPROCHEN_NOTE } });
  await logLeadHistory(leadId, "wiedervorlage", `Wiedervorlage ${when}: ${WIE_BESPROCHEN_NOTE}`, { customerId: opts.customerId, userId: opts.userId ?? null }).catch(() => {});
  return lead.followUpAt ? `Wiedervorlage auf ${when} gelegt.` : `Wiedervorlage am ${when} angelegt.`;
}

/** „Kein Interesse: Tür offen“: keine weiteren Nachrichten, also Nachfass-Abfolgen stoppen und Wiedervorlage entfernen. */
export async function nachfassenBeenden(leadId: string, opts: { now?: Date } = {}): Promise<string> {
  const stopped = await stopSequences(leadId, "Kein Interesse (E-Mail)", { now: opts.now });
  const r = await prisma.lead.updateMany({ where: { id: leadId, followUpAt: { not: null } }, data: { followUpAt: null, followUpNote: null } });
  return stopped || r.count ? "Nachfassen für diesen Kontakt beendet." : "";
}

/** Termin gebucht: unsere Erinnerungen wieder entfernen (andere Wiedervorlagen bleiben). */
export async function clearTerminErinnerung(leadId: string): Promise<void> {
  await prisma.lead.updateMany({ where: { id: leadId, followUpNote: { in: ERLEDIGT_BEI_BUCHUNG } }, data: { followUpAt: null, followUpNote: null } });
}

/** Nachfassen nach dem Senden ausführen. */
export async function fuehreNachfassenAus(leadId: string, n: Nachfassen | null, opts: Opts): Promise<string | null> {
  if (!n) return null;
  switch (n.art) {
    case "terminlink":
      return planTerminErinnerung(leadId, n.tage, opts);
    case "nicht_erschienen":
      return planNachfassAufgabe(leadId, { workdays: n.tage, note: NICHT_ERSCHIENEN_NOTE, skipIfBooked: true, hinweis: "falls kein neuer Termin gebucht wird" }, opts);
    case "unterlagen": {
      // Paket M6: automatische Erinnerung per E-Mail nach 3 Tagen ohne Antwort oder Upload (lib/mail/abfolgen-mail.ts);
      // geht sie nicht automatisch (Stufe aus, E-Mail-Funktionen aus, keine Adresse), wie bisher eine Aufgabe
      if (n.fehlende) {
        const { starteUnterlagenErinnerung } = await import("@/lib/mail/abfolgen-mail");
        const at = await starteUnterlagenErinnerung(leadId, n.fehlende, { userId: opts.userId, now: opts.now }).catch(() => null);
        if (at) return `Erinnerung per E-Mail am ${fmtTag(at)}, falls nichts kommt.`;
      }
      return planNachfassAufgabe(leadId, { workdays: n.tage, note: UNTERLAGEN_NOTE, skipIfBooked: false, hinweis: "falls die Unterlagen fehlen" }, opts);
    }
    case "melden":
      return planWiedervorlageAm(leadId, n.tag, opts);
    case "beenden":
      return (await nachfassenBeenden(leadId, opts)) || null;
  }
}
