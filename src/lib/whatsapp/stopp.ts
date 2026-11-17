// „STOPP“ per WhatsApp beendet alle Nachrichten an diese Nummer (Ole, 15.11.2026; Widerruf laut Einwilligung
// im Leadformular): Assistent, Erstanschreiben, Nachfassen (auch Abfolgen), Termin-Nachrichten, Kampagnen und
// Empfehlungs-Anfragen. Umgesetzt an zwei Stellen:
//   1. Eingang (gateway.ts): Stopp-Wort → Conversation.optedOutAt, Assistent aus, Abfolgen gestoppt, eine Bestätigung.
//   2. Versand (sendWhatsAppMessage / sendWhatsAppNotice): Chats mit optedOutAt bekommen nichts mehr
//      (WhatsAppOptOutError). Schreibt der Kontakt später selbst wieder, wird die Sperre aufgehoben; der Assistent
//      bleibt dann aus und der Vermittler antwortet selbst.

import { prisma } from "@/lib/prisma";

/** Wie bei den Bestandskampagnen (lib/bestand/campaigns.ts) plus Knopf „Keine Nachrichten mehr“. */
export const STOP_RE = /^\s*(stopp?|stop|abmelden|abbestellen|keine (weiteren )?nachrichten( mehr)?|nicht mehr (schreiben|kontaktieren)|bitte nicht mehr (schreiben|kontaktieren))\b/i;

export function isStopMessage(body: string | null | undefined): boolean {
  return !!body && STOP_RE.test(body);
}

export const STOP_CONFIRMATION = "Alles klar, wir schreiben Ihnen hier keine weiteren Nachrichten.";
export const STOP_CONFIRMATION_DU = "Alles klar, wir schreiben dir hier keine weiteren Nachrichten.";
/** Bestätigung auf der Support-Nummer von performancegrowth (Vertriebstermine, Zahlungserinnerung). */
export const SUPPORT_STOP_CONFIRMATION = "Alles klar, Sie bekommen von uns keine Nachrichten mehr.";

export class WhatsAppOptOutError extends Error {
  constructor() {
    super("Der Kontakt hat „STOPP“ geschrieben und bekommt keine WhatsApp-Nachrichten mehr.");
    this.name = "WhatsAppOptOutError";
  }
}

/** Lead hat im Formular nicht in WhatsApp eingewilligt (Lead.waConsent = "nein") und selbst nicht geschrieben. */
export class WhatsAppNoConsentError extends Error {
  constructor() {
    super("Der Lead hat im Leadformular nicht in WhatsApp eingewilligt. Bitte per E-Mail oder Telefon melden.");
    this.name = "WhatsAppNoConsentError";
  }
}

/** Nummer ist nicht per WhatsApp erreichbar (Lead.waUnavailableAt, lib/whatsapp/kein-whatsapp.ts), Lead hat nie geschrieben. */
export class WhatsAppUnavailableError extends Error {
  constructor() {
    super("Diese Nummer ist nicht per WhatsApp erreichbar. Bitte anrufen oder per E-Mail melden.");
    this.name = "WhatsAppUnavailableError";
  }
}

/** Ist diese Nummer bei diesem Kunden gesperrt? */
export async function isOptedOut(customerId: string, phone: string): Promise<boolean> {
  const c = await prisma.conversation.findUnique({
    where: { customerId_contactPhone: { customerId, contactPhone: phone } },
    select: { optedOutAt: true },
  });
  return !!c?.optedOutAt;
}

/**
 * Stopp anwenden: Chat sperren, Assistent aus, laufende Nachfass-Abfolgen des Leads stoppen, Hinweis im Chat.
 * confirm = Bestätigung senden (nicht, wenn eine Kampagne oder Empfehlung sie schon geschickt hat).
 */
export async function applyOptOut(conversationId: string, opts: { confirm: boolean; now?: Date; text?: string }): Promise<void> {
  const now = opts.now ?? new Date();
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, customerId: true, contactPhone: true, leadId: true, optedOutAt: true },
  });
  if (!conv) return;
  if (opts.confirm && !conv.optedOutAt) {
    const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
    const c = await prisma.customer.findUnique({ where: { id: conv.customerId }, select: { leadAddress: true } });
    const body = opts.text ?? (c?.leadAddress === "du" ? STOP_CONFIRMATION_DU : STOP_CONFIRMATION);
    await sendWhatsAppMessage({ customerId: conv.customerId, to: conv.contactPhone, body, sentBy: "system" }).catch((e) =>
      console.error("[whatsapp stopp] Bestätigung", e instanceof Error ? e.message : e),
    );
  }
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { optedOutAt: conv.optedOutAt ?? now, botActive: false, needsAttention: false, attentionReason: null, attentionAt: null },
  });
  await prisma.message.create({
    data: { conversationId: conv.id, direction: "internal", kind: "opt_out", body: JSON.stringify({ at: now.toISOString() }), sentBy: "system" },
  });
  if (conv.leadId) {
    const { stopSequences } = await import("@/lib/lead-sequences");
    await stopSequences(conv.leadId, "Abgemeldet („Stopp“)", { now }).catch(() => null);
  }
}

/** Kontakt schreibt nach dem Stopp selbst wieder: Sperre aufheben (Assistent bleibt aus, der Vermittler antwortet). */
export async function liftOptOut(conversationId: string): Promise<void> {
  await prisma.conversation.updateMany({ where: { id: conversationId, optedOutAt: { not: null } }, data: { optedOutAt: null, botActive: false } });
}
