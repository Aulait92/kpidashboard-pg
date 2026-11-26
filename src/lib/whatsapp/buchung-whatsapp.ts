// „Weiter auf WhatsApp“ auf der Erfolgsansicht der Buchungsseite (Ole, 26.11.2026): Der Lead schreibt mit einem Klick an
// die WhatsApp-Business-Nummer des Vermittlers (WhatsAppAccount.phoneNumber, verbunden über 360dialog), der Text ist
// vorbefüllt (lib/whatsapp/vorab.ts). Die Nachricht startet die Vorbereitung (termin-strecke.ts
// vorbereitungUeberBuchungsseite). Der Klick läuft über /book/manage/<token>/whatsapp und wird als Merker im Chat
// gezählt (Diagnose journey).

import { prisma } from "@/lib/prisma";
import { ohneAutoNachrichten } from "@/lib/lead-kontakt-sperre";
import { waNummer, waVorabLink } from "@/lib/whatsapp/vorab";
import { STRECKE, vorbereitungStand } from "@/lib/whatsapp/termin-strecke";

/** WhatsApp-Nummer des Vermittlers für wa.me (nur verbundenes Konto), sonst null. */
export async function vermittlerWaNummer(customerId: string): Promise<string | null> {
  const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true, phoneNumber: true } });
  return acc?.status === "connected" ? waNummer(acc.phoneNumber) : null;
}

/**
 * Block „Weiter auf WhatsApp“ zeigen? Nummer vorhanden, Chat zum Termin mit aktivem Assistenten und ohne Abmeldung,
 * Produkt mit automatischen Nachrichten, Vorbereitung noch nicht beantwortet.
 */
export async function waWeiterMoeglich(t: { id: string; customerId: string; conversationId: string | null; leadId: string | null }): Promise<boolean> {
  if (!(await vermittlerWaNummer(t.customerId))) return false;
  // Noch kein Chat (Ole, 26.11.2026: Lead bucht auf der Dankeseite schneller, als das Erstanschreiben rausgeht, bzw. die
  // Vorlagen sind noch nicht freigegeben): Block trotzdem zeigen, wenn der Assistent beim Kunden an ist und das Produkt
  // automatische Nachrichten erlaubt. Die Nachricht des Leads legt den Chat an, die Vorbereitung findet den Termin über
  // den Lead (termin-strecke.ts terminZurZeit).
  if (!t.conversationId) {
    const [agent, lead] = await Promise.all([
      prisma.agentConfig.findUnique({ where: { customerId: t.customerId }, select: { active: true } }),
      t.leadId ? prisma.lead.findUnique({ where: { id: t.leadId }, select: { source: true } }) : null,
    ]);
    return !!agent?.active && !!t.leadId && !ohneAutoNachrichten(lead?.source);
  }
  const conv = await prisma.conversation.findUnique({ where: { id: t.conversationId }, select: { botActive: true, optedOutAt: true, lead: { select: { source: true } } } });
  if (!conv?.botActive || conv.optedOutAt || ohneAutoNachrichten(conv.lead?.source)) return false;
  return !(await vorbereitungStand(t.conversationId, t.id)).antwort;
}

/** Klick auf „Weiter auf WhatsApp“: einmal je Termin merken (Messung) und den wa.me-Link liefern; null = nicht möglich. */
export async function waWeiterKlick(token: string, now = new Date()): Promise<string | null> {
  if (!token) return null;
  const t = await prisma.appointment.findFirst({
    where: { manageToken: token, status: "booked", startsAt: { gt: now } },
    select: { id: true, customerId: true, conversationId: true, leadId: true },
  });
  if (!t) return null;
  const link = waVorabLink(await vermittlerWaNummer(t.customerId));
  if (!link) return null;
  if (t.conversationId) {
    const schon = await prisma.message.count({ where: { conversationId: t.conversationId, direction: "internal", kind: STRECKE.waWeiterKlick, body: { contains: t.id } } });
    if (!schon) {
      await prisma.message.create({ data: { conversationId: t.conversationId, direction: "internal", kind: STRECKE.waWeiterKlick, body: JSON.stringify({ appointmentId: t.id }), sentBy: "system" } });
      await import("@/lib/experimente").then((m) => m.zielErreicht([t.leadId, t.conversationId, t.id], "wa_weiter_klick")).catch(() => null);
    }
  }
  return link;
}
