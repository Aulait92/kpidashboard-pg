// Bedenkzeit im Chat (Paket P5, Ole 17.11.2026). Regeln und Texte: lib/bedenkzeit.ts; Abfolge: lib/lead-sequences.ts.
//
//   bedenkzeitImChat   Textnachricht des Leads im Angebotsstand: „ich überlege noch“ → Frage nach dem Datum mit den
//                      Knöpfen 1 Woche, 2 Wochen, Ende des Monats; nennt er eine dieser Zeiten, gleich eintragen und
//                      bestätigen; eine andere Zeitangabe legt der Assistent mit schedule_followup an (Hinweis)
//   bedenkzeitKnopf    Knopf bedenkzeit:<wahl> → eintragen und bestätigen
// Der Assistent antwortet in beiden Fällen nicht zusätzlich (handled).

import { prisma } from "@/lib/prisma";
import { asAnsprache } from "@/lib/ansprache";
import { BEDENKZEIT_KNOEPFE, bedenkzeitBestaetigung, bedenkzeitDatum, bedenkzeitFrage, erkenneBedenkzeit, type BedenkzeitWahl } from "@/lib/bedenkzeit";
import { imAngebotsstand, startBedenkzeit } from "@/lib/lead-sequences";

/** Merker im Chat (interne Nachricht): Frage nach der Bedenkzeit gestellt. */
export const BEDENKZEIT_FRAGE_MERKER = "bedenkzeit_frage";

async function chat(conversationId: string) {
  const c = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { id: true, customerId: true, contactPhone: true, leadId: true, customer: { select: { leadAddress: true } } } });
  return c?.leadId ? { ...c, leadId: c.leadId, an: asAnsprache(c.customer.leadAddress) } : null;
}

async function sende(c: { customerId: string; contactPhone: string }, body: string, buttons?: { id: string; title: string }[]) {
  const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
  await sendWhatsAppMessage({ customerId: c.customerId, to: c.contactPhone, body, sentBy: "bot", buttons: buttons ?? null });
}

async function eintragen(c: NonNullable<Awaited<ReturnType<typeof chat>>>, bis: Date, notiz: string | null, now: Date): Promise<boolean> {
  const seq = await startBedenkzeit(c.leadId, bis, { quelle: "lead", notiz, now });
  if (!seq) return false;
  await prisma.message.create({ data: { conversationId: c.id, direction: "internal", kind: "followup_scheduled", body: JSON.stringify({ at: bis.toISOString(), anlass: "Bedenkzeit zum Angebot" }), sentBy: "system" } });
  await sende(c, bedenkzeitBestaetigung(c.an, bis));
  return true;
}

/**
 * Textnachricht des Leads prüfen. handled: Die App hat geantwortet (Frage mit Knöpfen bzw. Bestätigung). hint: Hinweis
 * für den Assistenten (eigene Zeitangabe des Leads).
 */
export async function bedenkzeitImChat(conversationId: string, text: string | null | undefined, now = new Date()): Promise<{ handled: boolean; hint?: string | null }> {
  const e = erkenneBedenkzeit(text);
  if (!e.bedenkzeit) return { handled: false };
  const c = await chat(conversationId);
  if (!c || !(await imAngebotsstand(c.leadId, now))) return { handled: false };
  if (e.wahl) return { handled: await eintragen(c, bedenkzeitDatum(e.wahl, now), (text ?? "").trim(), now) };
  if (e.andereZeit) {
    return {
      handled: false,
      hint: "Der Lead möchte sich das Angebot noch überlegen und nennt selbst einen Zeitpunkt. Lege genau diesen Tag mit schedule_followup an (10 Uhr, wenn er keine Uhrzeit nennt) und bestätige kurz. Stell keine weiteren Fragen zum Angebot und schlage keine Termine vor.",
    };
  }
  await sende(c, bedenkzeitFrage(c.an), BEDENKZEIT_KNOEPFE);
  await prisma.message.create({ data: { conversationId: c.id, direction: "internal", kind: BEDENKZEIT_FRAGE_MERKER, body: JSON.stringify({ text: (text ?? "").slice(0, 200) }), sentBy: "system" } });
  return { handled: true };
}

/** Knopf „1 Woche“, „2 Wochen“, „Ende des Monats“ (Payload bedenkzeit:<wahl>). */
export async function bedenkzeitKnopf(conversationId: string, wahl: BedenkzeitWahl, now = new Date()): Promise<boolean> {
  const c = await chat(conversationId);
  if (!c) return false;
  return eintragen(c, bedenkzeitDatum(wahl, now), null, now);
}
