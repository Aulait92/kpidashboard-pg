// Gemeinsame Konstanten und reine Regeln für warme Kontakte aus dem Bestand (auch im Browser nutzbar).
// Laden: lib/bestand/warm.ts.

export const WARM_MAX = 10;
/** Antwort ohne Termin: ab so vielen Tagen in „Heute“ */
export const WARM_AFTER_DAYS = 2;
/** Danach nicht mehr (zu alt für „warm“) */
export const WARM_MAX_DAYS = 30;
/** Beschriftung der Karte und Aufgabe */
export const WARM_TITLE = "Nachfassen per Nachricht";
/** Grund „von Hand erledigt“ am Empfänger (Aktion „Erledigt“ in Heute) */
export const WARM_DONE_REASON = "nachgefasst";

const DAY = 86_400_000;
const LOST = ["Abschluss", "Kein Interesse", "Disqualifiziert"];

export type InboxBestandWarm = {
  recipientId: string;
  leadId: string;
  name: string;
  /** Kampagne, auf die geantwortet wurde (z. B. „Kfz-Kunden ohne Hausrat“) */
  kampagne: string;
  repliedAt: string;
  /** WhatsApp-Gespräch für „Nachricht“; ohne: Kontakt öffnen */
  conversationId: string | null;
};

/** Ist dieser Empfänger ein warmer Kontakt? Rein (Tests). */
export function istWarm(
  r: { status: string; reason: string | null; repliedAt: Date | null; leadId: string | null; optOut: boolean; leadStatus: string | null; hasAppointment: boolean },
  now: Date,
): boolean {
  if (r.status !== "replied" || !r.leadId || !r.repliedAt) return false;
  // „Stopp“, „Kein Bedarf“, „Abmeldung“, „kein Interesse“ oder schon erledigt: kein Nachfassen
  if (r.reason) return false;
  if (r.optOut || r.hasAppointment) return false;
  if (r.leadStatus && LOST.includes(r.leadStatus)) return false;
  const age = now.getTime() - r.repliedAt.getTime();
  return age >= WARM_AFTER_DAYS * DAY && age <= WARM_MAX_DAYS * DAY;
}
