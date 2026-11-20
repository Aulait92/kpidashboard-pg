// Keine WhatsApp an Festnetznummern (Ole, 20.11.2026).
//
// Festnetznummern haben fast nie WhatsApp. Bisher ging das Erstanschreiben trotzdem raus (kostet eine Vorlage), kam mit
// 131026 zurück, und erst dann stand der Lead auf der Anrufliste. Jetzt prüfen die beiden zentralen Versandwege
// (lib/whatsapp/templates.ts sendWhatsAppNotice für Vorlagen, lib/whatsapp/gateway.ts sendWhatsAppMessage für Freitext,
// Knöpfe, Flows) vor dem Versand:
//   - Nur sichere Festnetznummern (libphonenumber FIXED_LINE, lib/telefon-typ.ts). Unbekannte, ungültige und
//     „Festnetz oder Mobil“-Nummern werden nicht blockiert.
//   - Hat der Kontakt selbst per WhatsApp geschrieben (z. B. WhatsApp Business auf einer Festnetznummer), geht alles
//     wie bisher.
//   - Sonst: kein Versuch, kein Retry. WhatsAppFestnetzError (eine Art WhatsAppUnavailableError, damit Abfolgen,
//     Erstanschreiben und Aufrufer es wie „kein WhatsApp“ behandeln). Der Lead wird wie bei „kein WhatsApp“ markiert
//     (lib/whatsapp/kein-whatsapp.ts markLeadNoWhatsApp, Grund „festnetz“): Verlauf „Nicht gesendet: Festnetznummer“,
//     Assistent aus, Abfolgen gestoppt, oben auf Heute/Anrufliste („Keine Handynummer: bitte anrufen“), Hinweis im
//     Kontakt, Mail-Strecke (Auslöser „festnetz“), Push an den Berater.

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { istFestnetz } from "@/lib/telefon-typ";
import { WhatsAppUnavailableError } from "@/lib/whatsapp/stopp";

/** Grund auf Heute/Anrufliste für Leads mit Festnetznummer (statt „Kein WhatsApp: bitte direkt anrufen“). */
export const FESTNETZ_REASON = "Keine Handynummer: bitte anrufen";

/** Verlaufseintrag am Lead, wenn eine WhatsApp wegen der Festnetznummer nicht gesendet wurde. */
export const FESTNETZ_VERLAUF = "Nicht gesendet: Festnetznummer. Per WhatsApp ist der Lead nicht erreichbar, der Assistent schreibt nicht. Bitte anrufen.";

export class WhatsAppFestnetzError extends WhatsAppUnavailableError {
  constructor() {
    super();
    this.message = "Festnetznummer: keine WhatsApp möglich. Bitte anrufen oder per E-Mail melden.";
    this.name = "WhatsAppFestnetzError";
  }
}

/** Rein: Festnetz sperrt nur, solange der Kontakt nie selbst per WhatsApp geschrieben hat. */
export function festnetzSperrt(o: { festnetz: boolean; eingehend: number }): boolean {
  return o.festnetz && o.eingehend === 0;
}

/**
 * Vor jedem Versand an einen Kontakt: Festnetznummer ohne eigene Nachricht des Kontakts → nicht senden
 * (WhatsAppFestnetzError) und den Lead für den Anrufweg markieren. Sonst passiert nichts.
 */
export async function pruefeFestnetz(o: { customerId: string; to: string; leadId?: string | null; conversationId?: string | null; now?: Date }): Promise<void> {
  if (!(await istFestnetz(o.to))) return;
  const conv =
    o.conversationId != null
      ? { id: o.conversationId, leadId: null as string | null }
      : await prisma.conversation.findUnique({ where: { customerId_contactPhone: { customerId: o.customerId, contactPhone: o.to } }, select: { id: true, leadId: true } });
  const eingehend = conv ? await prisma.message.count({ where: { conversationId: conv.id, direction: "inbound" } }) : 0;
  if (!festnetzSperrt({ festnetz: true, eingehend })) return;

  const leadId =
    o.leadId ??
    conv?.leadId ??
    (await prisma.lead.findFirst({ where: { customerId: o.customerId, phone: o.to, erasedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true } }))?.id ??
    null;
  console.log(`[whatsapp] nicht gesendet: Festnetznummer customer=${o.customerId}${leadId ? ` lead=${leadId}` : ""}`);
  if (leadId) {
    const { markLeadNoWhatsApp } = await import("@/lib/whatsapp/kein-whatsapp");
    await markLeadNoWhatsApp(leadId, { now: o.now, grund: "festnetz" }).catch((err) => reportError(err, "festnetz-markieren", { lead: leadId }));
  }
  throw new WhatsAppFestnetzError();
}
