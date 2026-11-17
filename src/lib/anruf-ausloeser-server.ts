// Auslöser des Anrufplans nach dem Erstanschreiben ohne Antwort (Ole, 17.11.2026; Regeln in lib/anruf-ausloeser.ts).
// Lead.autoCallAt: Auslöser erledigt (Anrufplan gestartet bzw. bewusst nicht, weil eine eigene Wiedervorlage besteht).

import { prisma } from "@/lib/prisma";
import { callPlanNote, isCallPlanNote, isReplaceableCallTask } from "@/lib/call-plan";
import { kontaktFromLead } from "@/lib/lead-anrede";
import { logLeadHistory } from "@/lib/lead-history";
import { leadLabel } from "@/lib/showup";
import { ANTWORT_WARTEZEIT_MS, anrufPush, anrufStartZeitpunkt } from "@/lib/anruf-ausloeser";
import type { LeadTimes } from "@/lib/calendar/lead-times";
import { standardPush, type PushFn } from "@/lib/showup-server";

const DAY = 24 * 60 * 60 * 1000;

/** Verfügbarkeit des Vermittlers für diesen Lead (Kalender des Zuständigen bzw. der Agentur). */
async function verfuegbarkeit(customerId: string, leadId: string): Promise<LeadTimes> {
  const { bookingKeys } = await import("@/lib/calendar");
  const { loadLeadTimes, DEFAULT_LEAD_TIMES } = await import("@/lib/calendar/lead-times");
  const keys = await bookingKeys(customerId, leadId).catch(() => [customerId]);
  return loadLeadTimes(keys[0] ?? customerId).catch(() => DEFAULT_LEAD_TIMES);
}

/**
 * Cron: Leads, die 30 Minuten nach dem Erstanschreiben nicht geantwortet haben, bekommen „Anrufversuch 1 von 6“ auf
 * „Heute“ und der Vermittler einen Push mit Anruf-Deep-Link. Nur in seinen Geschäftszeiten, sonst zu Arbeitsbeginn.
 */
export async function runAntwortAusloeser(now = new Date(), deps: { push?: PushFn } = {}): Promise<{ geprueft: number; gestartet: number }> {
  const push = deps.push ?? standardPush;
  const leads = await prisma.lead.findMany({
    where: {
      outreachStatus: "sent",
      outreachAt: { lte: new Date(now.getTime() - ANTWORT_WARTEZEIT_MS), gt: new Date(now.getTime() - 4 * DAY) },
      autoCallAt: null,
      erasedAt: null,
      stornoState: null,
      callAttempts: 0,
      phone: { not: null },
      OR: [{ status: null }, { status: "" }, { status: "Neuer Lead" }],
      appointments: { none: { status: "booked" } },
      // Lead hat nie geantwortet
      conversations: { none: { messages: { some: { direction: "inbound" } } } },
      customer: { dormantSince: null },
    },
    select: { id: true, customerId: true, name: true, formData: true, contactOverrides: true, assignedUserId: true, outreachAt: true, followUpAt: true, followUpNote: true },
    orderBy: { outreachAt: "asc" },
    take: 100,
  });
  let gestartet = 0;
  for (const l of leads) {
    const lt = await verfuegbarkeit(l.customerId, l.id);
    const faellig = anrufStartZeitpunkt(new Date(l.outreachAt!.getTime() + ANTWORT_WARTEZEIT_MS), lt);
    if (faellig.getTime() > now.getTime()) continue;
    // Eigene, spätere Wiedervorlage des Vermittlers bleibt; dann kein Anrufplan von selbst
    const eigene = !!l.followUpAt && l.followUpAt.getTime() > now.getTime() && !isReplaceableCallTask(l.followUpNote);
    const claimed = await prisma.lead.updateMany({
      where: { id: l.id, autoCallAt: null, callAttempts: 0 },
      data: eigene ? { autoCallAt: now } : { autoCallAt: now, followUpAt: now, followUpNote: callPlanNote(1), callbackSnoozedUntil: null },
    });
    if (!claimed.count || eigene) continue;
    const name = leadLabel(kontaktFromLead(l));
    await push(l.assignedUserId, l.customerId, anrufPush({ leadId: l.id, name })).catch((e) => console.error("[anrufplan push]", e));
    await logLeadHistory(l.id, "wiedervorlage", "Keine Antwort auf das Erstanschreiben: Anrufplan gestartet (Anrufversuch 1 von 6)", { customerId: l.customerId, userId: null });
    gestartet++;
  }
  return { geprueft: leads.length, gestartet };
}

/** Lead hat im Chat geantwortet: der Anrufplan endet (die Aufgabe „Anrufversuch X von 6“ fällt weg). */
export async function anrufplanBeiAntwortStoppen(leadId: string): Promise<boolean> {
  const l = await prisma.lead.findUnique({ where: { id: leadId }, select: { customerId: true, followUpNote: true } });
  if (!l || !isCallPlanNote(l.followUpNote)) return false;
  const r = await prisma.lead.updateMany({ where: { id: leadId, followUpNote: l.followUpNote }, data: { followUpAt: null, followUpNote: null, callbackSnoozedUntil: null } });
  if (!r.count) return false;
  await logLeadHistory(leadId, "wiedervorlage", "Hat im Chat geantwortet: Anrufplan beendet", { customerId: l.customerId, userId: null });
  return true;
}
