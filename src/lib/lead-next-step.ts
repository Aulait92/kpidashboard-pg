// Nächster Schritt (Ole, 14.11.2026): „Jeder Lead hat einen nächsten Schritt oder ist Gewonnen bzw. Verloren.“
// Eine Definition für alle Stellen: Kontakte-Liste, Filter, Pipeline, Heute, Kontakt, Zahlen, Erinnerung, Admin.
//
// Ein offener Lead hat einen nächsten Schritt, wenn eines davon zutrifft:
//   - künftiger (oder gerade laufender) Termin
//   - offene Wiedervorlage bzw. Aufgabe mit Datum (auch überfällig: sie steht auf „Heute“)
//   - laufendes Gespräch mit dem WhatsApp-Assistenten (Nachricht in den letzten 24 Stunden)
// Sonst muss er Gewonnen oder Verloren sein. Termin vorbei und kein Ergebnis eingetragen: „Ergebnis fehlt“.
//
// Neue Leads (noch nie bearbeitet) zählen nicht: ihr nächster Schritt ist der erste Anruf (Rückrufliste
// auf „Heute“). Stornierte bzw. reklamierte Leads ebenfalls nicht.
// Rein (auch im Browser nutzbar); die Abfragen dazu stehen in lib/lead-next-step-server.ts.

import type { Prisma } from "@/generated/prisma/client";

/** Status, bei denen ein Lead offen in Bearbeitung ist und einen nächsten Schritt braucht. */
export const OPEN_STEP_STATUSES = [
  "Nicht erreicht",
  "Im Gespräch",
  "In Beratung",
  "Termin vereinbart",
  "Angebot gesendet",
  "Angebot verschickt",
  "Angebot raus",
  "Erreicht",
  "Qualifiziert",
  "Angebot/Beratung läuft",
] as const;
const OPEN = new Set<string>(OPEN_STEP_STATUSES);

/** Ab wann ein Termin als vorbei gilt (wie „Wie lief's?“ auf „Heute“). */
export const APPOINTMENT_RESULT_AFTER_MS = 30 * 60 * 1000;
/** Laufendes Bot-Gespräch: letzte Nachricht höchstens so lange her. */
export const BOT_CHAT_ACTIVE_MS = 24 * 60 * 60 * 1000;
/** Aufgabe, wenn der Dialog „Wie geht es weiter?“ ohne Wahl geschlossen wird. */
export const NEXT_STEP_TASK_NOTE = "Nächsten Schritt festlegen";

/** Ab dieser Quote gilt die Kennzahl im Admin als in Ordnung. */
export const NEXT_STEP_WARN_BELOW = 0.8;

/** Storno beantragt bzw. in Prüfung bzw. genehmigt: kein nächster Schritt nötig. */
export const STORNO_DONE_STATES = ["requested", "review", "approved"] as const;

export type NextStepFacts = {
  status: string | null;
  closedAt?: Date | null;
  erasedAt?: Date | null;
  stornoState?: string | null;
  followUpAt?: Date | string | null;
  /** Gebuchter Termin, der noch nicht vorbei ist (siehe APPOINTMENT_RESULT_AFTER_MS). */
  hasUpcomingAppointment?: boolean;
  /** Gebuchter Termin vorbei, ohne eingetragenes Ergebnis. */
  hasPastAppointmentWithoutResult?: boolean;
  /** WhatsApp-Assistent spricht gerade mit dem Lead (letzte 24 h). */
  hasActiveBotChat?: boolean;
};

/**
 * - "none": braucht keinen Schritt (neu, gewonnen, verloren, storniert, gelöscht)
 * - "ok": hat einen nächsten Schritt
 * - "missing": kein nächster Schritt
 * - "result_missing": Termin vorbei, Ergebnis fehlt (und sonst kein Schritt)
 */
export type NextStepState = "none" | "ok" | "missing" | "result_missing";

export function isOpenForNextStep(l: Pick<NextStepFacts, "status" | "closedAt" | "erasedAt" | "stornoState">): boolean {
  if (l.closedAt || l.erasedAt) return false;
  if (l.stornoState && (STORNO_DONE_STATES as readonly string[]).includes(l.stornoState)) return false;
  return !!l.status && OPEN.has(l.status);
}

export function nextStepState(l: NextStepFacts): NextStepState {
  if (!isOpenForNextStep(l)) return "none";
  if (l.followUpAt || l.hasUpcomingAppointment || l.hasActiveBotChat) return "ok";
  return l.hasPastAppointmentWithoutResult ? "result_missing" : "missing";
}

/** Offener Lead ohne nächsten Schritt (inklusive „Ergebnis fehlt“). */
export function needsNextStep(l: NextStepFacts): boolean {
  const s = nextStepState(l);
  return s === "missing" || s === "result_missing";
}

export const NEXT_STEP_LABEL: Record<"missing" | "result_missing", string> = {
  missing: "Kein nächster Schritt",
  result_missing: "Ergebnis fehlt",
};

/** Prisma-Bedingung: offener Lead, der einen nächsten Schritt braucht (mit oder ohne Schritt). */
export function openForNextStepWhere(): Prisma.LeadWhereInput {
  return {
    status: { in: [...OPEN_STEP_STATUSES] },
    closedAt: null,
    erasedAt: null,
    OR: [{ stornoState: null }, { stornoState: { notIn: [...STORNO_DONE_STATES] } }],
  };
}

/** Prisma-Bedingung: künftiger bzw. laufender Termin. */
export function upcomingAppointmentWhere(now: Date): Prisma.AppointmentWhereInput {
  return { status: "booked", startsAt: { gt: new Date(now.getTime() - APPOINTMENT_RESULT_AFTER_MS) } };
}

/** Prisma-Bedingung: Termin vorbei, Ergebnis nicht eingetragen. */
export function pastOpenAppointmentWhere(now: Date): Prisma.AppointmentWhereInput {
  return { status: "booked", startsAt: { lte: new Date(now.getTime() - APPOINTMENT_RESULT_AFTER_MS) } };
}

/** Prisma-Bedingung: laufendes Gespräch mit dem Assistenten. */
export function activeBotChatWhere(now: Date): Prisma.ConversationWhereInput {
  return { botActive: true, lastMessageAt: { gte: new Date(now.getTime() - BOT_CHAT_ACTIVE_MS) } };
}

/** Prisma-Bedingung: offener Lead OHNE nächsten Schritt (inklusive „Ergebnis fehlt“). Gleiche Regel wie nextStepState. */
export function withoutNextStepWhere(now: Date): Prisma.LeadWhereInput {
  return {
    AND: [
      openForNextStepWhere(),
      { followUpAt: null },
      { appointments: { none: upcomingAppointmentWhere(now) } },
      { conversations: { none: activeBotChatWhere(now) } },
      // Wiedervorlage des Assistenten (schedule_followup) ist ein nächster Schritt
      { sequences: { none: { kind: "recall", stoppedAt: null } } },
    ],
  };
}

/** Prisma-Bedingung: „Ergebnis fehlt“ (ohne nächsten Schritt und mit vorbeigegangenem Termin). */
export function resultMissingWhere(now: Date): Prisma.LeadWhereInput {
  return { AND: [withoutNextStepWhere(now), { appointments: { some: pastOpenAppointmentWhere(now) } }] };
}

/** Quote „Leads mit nächstem Schritt“ (0..1) oder null ohne offene Leads. */
export function nextStepRateOf(open: number, without: number): number | null {
  if (open <= 0) return null;
  return Math.max(0, Math.min(1, (open - without) / open));
}
