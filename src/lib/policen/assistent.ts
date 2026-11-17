// Einhängepunkte für den WhatsApp-Assistenten (lib/whatsapp/bot.ts), bewusst klein gehalten (Ole, 17.11.2026):
//   - einladungJetzt: nach der Vertragsfrage (bestehende Verträge bzw. Komplettcheck „Ja“) einmal einladen, Policen
//     als Foto oder PDF zu schicken.
//   - policenGeschickt: für die Bereitlegen-Liste ohne „bisherige Policen“ (regeln.ts ohneBisherigePolicen).

import { prisma } from "@/lib/prisma";
import type { Ansprache } from "@/lib/ansprache";
import { einladungFaellig, einladungText, gesundheitInText, gesundheitInVertraegen, policenGesundheitAn, type Person } from "@/lib/policen/regeln";

/** Text der Einladung, wenn sie jetzt fällig ist, sonst null. */
export async function einladungJetzt(o: { conversationId: string; an: Ansprache; person: Person }): Promise<string | null> {
  const c = await prisma.conversation.findUnique({
    where: { id: o.conversationId },
    select: { qualificationData: true, lead: { select: { source: true, erasedAt: true } } },
  });
  if (!c?.lead || c.lead.erasedAt) return null;
  const gesundheitAn = policenGesundheitAn();
  // Produkt mit Gesundheitsangaben (z. B. PKV, Zahn, BU) und Schalter aus: nicht um Policen bitten
  if (!gesundheitAn && gesundheitInText(c.lead.source)) return null;
  const outbound = await prisma.message.findMany({ where: { conversationId: o.conversationId, direction: "outbound" }, select: { body: true } });
  if (!einladungFaellig({ qualificationData: c.qualificationData, outbound: outbound.map((m) => m.body) })) return null;
  return einladungText(o.an, o.person, { gesundheitAn, gesundheitInListe: gesundheitInVertraegen(c.qualificationData) });
}

/** Hat der Lead schon Policen geschickt (gespeichert)? */
export async function policenGeschickt(leadId: string | null): Promise<boolean> {
  return !!leadId && (await prisma.leadDocument.count({ where: { leadId, status: "gespeichert" } })) > 0;
}
