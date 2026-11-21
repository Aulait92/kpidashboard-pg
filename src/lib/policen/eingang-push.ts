// „Unterlagen sind da“ (Persona-Test 20.11.2026): Push an den Vermittler, sobald ein Lead Policen geschickt hat und
// das Auslesen durch ist. Nur Name und Anzahl, nie Vertragsinhalte, Sparten oder Dateinamen (Rechtsprüfung A7).
// Je Lead höchstens ein Push in 10 Minuten (mehrere Fotos hintereinander); gleicher tag ersetzt die alte Meldung.

import { prisma } from "@/lib/prisma";
import { kontaktFromLead } from "@/lib/lead-anrede";
import { leadLabel } from "@/lib/showup";
import { standardPush, zustaendig, type PushFn } from "@/lib/showup-server";

export const EINGANG_PUSH_PAUSE_MS = 10 * 60 * 1000;
const zuletzt = new Map<string, number>();

/** Nur für Tests: Sperre je Lead zurücksetzen. */
export const eingangPushZuruecksetzen = () => zuletzt.clear();

/** Text der Meldung (Sie-Form an den Vermittler, ohne Gedankenstriche). */
export function eingangPushText(o: { name: string; anzahl: number; ausgelesen: number; termin: boolean }) {
  const was = o.anzahl === 1 ? "eine Unterlage" : `${o.anzahl} Unterlagen`;
  const body = o.ausgelesen > 0 ? "Der Vergleich ist fertig. Bitte vor dem Termin mit dem Original prüfen." : o.termin ? "Sie liegen in der Terminvorbereitung." : "Sie liegen beim Kontakt.";
  return { title: `${o.name} hat ${was} geschickt`, body };
}

/**
 * Nach Eingang und Auslesen (WhatsApp-Gateway): Push an den zuständigen Berater, sonst an alle Logins des Kunden.
 * Ziel: Vertragsseite des nächsten Termins, sonst die Terminvorbereitung bzw. der Kontakt. false = nichts geschickt.
 */
export async function meldeUnterlagen(leadId: string, now = new Date(), deps: { push?: PushFn } = {}): Promise<boolean> {
  const vorher = zuletzt.get(leadId);
  if (vorher != null && now.getTime() - vorher < EINGANG_PUSH_PAUSE_MS) return false;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { customerId: true, erasedAt: true, name: true, formData: true, contactOverrides: true, assignedUserId: true },
  });
  if (!lead || lead.erasedAt) return false;
  // Nur bei frischem Eingang (gespeichert bzw. Einwilligung nachgereicht in den letzten 15 Minuten), nicht bei jeder Antwort
  const frisch = new Date(now.getTime() - 15 * 60 * 1000);
  const [anzahl, neu, ausgelesen, termin] = await Promise.all([
    prisma.leadDocument.count({ where: { leadId, status: "gespeichert" } }),
    prisma.leadDocument.count({ where: { leadId, status: "gespeichert", OR: [{ createdAt: { gte: frisch } }, { consentAt: { gte: frisch } }] } }),
    prisma.policenAuszug.count({ where: { document: { leadId, status: "gespeichert" }, status: "ausgelesen" } }),
    prisma.appointment.findFirst({
      where: { leadId, status: "booked", startsAt: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) } },
      orderBy: { startsAt: "asc" },
      select: { id: true, calendarKey: true },
    }),
  ]);
  if (!anzahl || !neu) return false;
  zuletzt.set(leadId, now.getTime());
  const name = leadLabel(kontaktFromLead(lead, lead.name));
  const url = termin ? `/buyer/termine/${termin.id}/vorbereitung${ausgelesen ? "/vertraege" : ""}` : `/buyer/leads/${leadId}`;
  const userId = zustaendig({ calendarKey: termin?.calendarKey ?? null, lead: { assignedUserId: lead.assignedUserId } });
  await (deps.push ?? standardPush)(userId, lead.customerId, { ...eingangPushText({ name, anzahl, ausgelesen, termin: !!termin }), url, tag: `policen-eingang:${leadId}` });
  return true;
}
