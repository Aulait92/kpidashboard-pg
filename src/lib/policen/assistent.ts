// Einhängepunkte für den WhatsApp-Assistenten (lib/whatsapp/bot.ts, termin-strecke.ts), bewusst klein gehalten.
// Seit 18.11.2026 (Ole, Rechtsprüfung A1): zwei Nachrichten, erst die Bitte um Policen (reiner Text), dann die
// Einwilligung als eigene interaktive Nachricht mit „Einverstanden“ / „Lieber nicht“ (lib/policen/bitte.ts). Einmal je Chat.
//   - einladungJetzt: nach der Vertragsfrage (bestehende Verträge bzw. Komplettcheck „Ja“).
//   - einladungNachVertraegen: direkt nach der Antwort auf die Vertragsfrage der Termin-Strecke.
//   - policenGeschickt: für die Bereitlegen-Liste ohne „bisherige Policen“ (regeln.ts ohneBisherigePolicen).
// Keine Bitte: Funktion aus (Ablage nicht eingerichtet bzw. Notschalter), Minderjährige laut Formular, und bei einem
// reinen Gesundheitsprodukt (PKV, Zahn, BU), solange Kranken/BU/Leben für den Vermittler nicht freigegeben ist.

import { prisma } from "@/lib/prisma";
import type { Ansprache, Salutation } from "@/lib/ansprache";
import { EINLADUNG_RE, einladungFaellig, gesundheitInText, type Person } from "@/lib/policen/regeln";
import type { Knopf } from "@/lib/policen/bitte";

/** Erste Nachricht (Bitte, text ohne Knöpfe) und folge (Einwilligung, interaktiv mit Fußzeile). */
export type Einladung = { text: string; buttons: Knopf[] | null; folge: { text: string; buttons: Knopf[]; footer: string | null } };

async function einladung(conversationId: string, source: string | null | undefined): Promise<Einladung | null> {
  const { policenBitteFuerChat } = await import("@/lib/policen/server");
  const b = await policenBitteFuerChat(conversationId);
  if (!b) return null;
  // Reines Gesundheitsprodukt und Kranken/BU/Leben nicht freigegeben: Bitte nennt nur Sach, also nicht bitten
  if (!/Gesundheitsangaben enthalten/.test(b.einwilligung.text) && gesundheitInText(source)) return null;
  return { text: b.text, buttons: null, folge: { text: b.einwilligung.text, buttons: b.einwilligung.knoepfe, footer: b.einwilligung.fusszeile } };
}

/** Einladung, wenn sie jetzt fällig ist, sonst null. */
export async function einladungJetzt(o: { conversationId: string; an: Ansprache; person: Person & { anrede?: Salutation | null } }): Promise<Einladung | null> {
  const [c, outbound] = await Promise.all([
    prisma.conversation.findUnique({ where: { id: o.conversationId }, select: { qualificationData: true, lead: { select: { source: true, erasedAt: true } } } }),
    prisma.message.findMany({ where: { conversationId: o.conversationId, direction: "outbound" }, select: { body: true } }),
  ]);
  if (!c?.lead || c.lead.erasedAt) return null;
  if (!einladungFaellig({ qualificationData: c.qualificationData, outbound: outbound.map((m) => m.body) })) return null;
  return einladung(o.conversationId, c.lead.source);
}

/** Hat der Lead schon Policen geschickt (gespeichert)? */
export async function policenGeschickt(leadId: string | null): Promise<boolean> {
  const { hatPolicenDokumente } = await import("@/lib/policen/server");
  return hatPolicenDokumente(leadId);
}

/** Einladung direkt nach der Antwort auf die Vertragsfrage (termin-strecke.ts): nur bei bestehenden Verträgen, einmal je Chat. */
export async function einladungNachVertraegen(o: {
  conversationId: string;
  an: Ansprache;
  person: Person & { anrede?: Salutation | null };
  vertraegeText: string;
  anzahl: number;
}): Promise<Einladung | null> {
  if (o.anzahl <= 0) return null;
  const [c, outbound] = await Promise.all([
    prisma.conversation.findUnique({ where: { id: o.conversationId }, select: { lead: { select: { source: true, erasedAt: true } } } }),
    prisma.message.findMany({ where: { conversationId: o.conversationId, direction: "outbound" }, select: { body: true } }),
  ]);
  if (!c?.lead || c.lead.erasedAt) return null;
  if (outbound.some((m) => EINLADUNG_RE.test(m.body ?? ""))) return null;
  return einladung(o.conversationId, c.lead.source);
}
