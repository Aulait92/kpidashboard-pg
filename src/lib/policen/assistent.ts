// Einhängepunkte für den WhatsApp-Assistenten (lib/whatsapp/bot.ts), bewusst klein gehalten (Ole, 17.11.2026):
//   - einladungJetzt: nach der Vertragsfrage (bestehende Verträge bzw. Komplettcheck „Ja“) einmal einladen, Policen
//     als Foto oder PDF zu schicken.
//   - policenGeschickt: für die Bereitlegen-Liste ohne „bisherige Policen“ (regeln.ts ohneBisherigePolicen).
// Schalter POLICEN_GESUNDHEIT_AN an und der Lead nennt eine Gesundheitssparte (bzw. das Produkt hat Gesundheitsbezug):
// Die Einladung enthält gleich die ausdrückliche Einwilligung mit zwei Knöpfen (docs/recht-gesundheitsunterlagen.md
// Abschnitt b), damit vor der Einwilligung nichts geladen und nichts an die KI gegeben werden muss. Minderjährige laut
// Formular (regeln.ts minderjaehrig, Abschnitt e Punkt 11): wie Schalter aus.

import { prisma } from "@/lib/prisma";
import type { Ansprache } from "@/lib/ansprache";
import {
  EINLADUNG_RE,
  einladungFaellig,
  einladungMitEinwilligung,
  einladungText,
  gesundheitInText,
  gesundheitInVertraegen,
  minderjaehrig,
  policenGesundheitAn,
  type Person,
} from "@/lib/policen/regeln";

export type Einladung = { text: string; buttons: { id: string; title: string }[] | null };

async function einladung(o: { customerId: string; phone: string; an: Ansprache; person: Person; gesundheitAn: boolean; gesundheitGenannt: boolean }): Promise<Einladung> {
  if (o.gesundheitAn && o.gesundheitGenannt) {
    const { aktiveEinwilligung } = await import("@/lib/policen/server");
    if (!(await aktiveEinwilligung(o.customerId, o.phone))) {
      const { verantwortlicherFuer } = await import("@/lib/policen/verantwortlicher");
      return einladungMitEinwilligung(o.an, await verantwortlicherFuer(o.customerId, o.person));
    }
  }
  return { text: einladungText(o.an, o.person, { gesundheitAn: o.gesundheitAn, gesundheitInListe: o.gesundheitGenannt }), buttons: null };
}

/** Einladung, wenn sie jetzt fällig ist, sonst null. */
export async function einladungJetzt(o: { conversationId: string; an: Ansprache; person: Person }): Promise<Einladung | null> {
  const c = await prisma.conversation.findUnique({
    where: { id: o.conversationId },
    select: { customerId: true, contactPhone: true, qualificationData: true, lead: { select: { source: true, erasedAt: true, formData: true } } },
  });
  if (!c?.lead || c.lead.erasedAt) return null;
  // Minderjährige (laut Formular): wie Schalter aus, keine Einwilligungsfrage zu Gesundheitsunterlagen
  const gesundheitAn = policenGesundheitAn() && !minderjaehrig(c.lead.formData);
  // Produkt mit Gesundheitsangaben (z. B. PKV, Zahn, BU) und Schalter aus: nicht um Policen bitten
  if (!gesundheitAn && gesundheitInText(c.lead.source)) return null;
  const outbound = await prisma.message.findMany({ where: { conversationId: o.conversationId, direction: "outbound" }, select: { body: true } });
  if (!einladungFaellig({ qualificationData: c.qualificationData, outbound: outbound.map((m) => m.body) })) return null;
  const gesundheitGenannt = gesundheitInVertraegen(c.qualificationData) || (gesundheitAn && gesundheitInText(c.lead.source));
  return einladung({ customerId: c.customerId, phone: c.contactPhone, an: o.an, person: o.person, gesundheitAn, gesundheitGenannt });
}

/** Hat der Lead schon Policen geschickt (gespeichert)? */
export async function policenGeschickt(leadId: string | null): Promise<boolean> {
  return !!leadId && (await prisma.leadDocument.count({ where: { leadId, status: "gespeichert" } })) > 0;
}

/**
 * Einladung direkt nach der Antwort auf die Vertragsfrage der Termin-Strecke (lib/whatsapp/termin-strecke.ts
 * vertraegeAntwort): einmal je Chat, nur wenn der Lead bestehende Verträge genannt hat. Schalter aus: nur
 * Sachversicherungen (einladungText), bei reinem Gesundheitsprodukt (PKV, Zahn, BU) gar nicht. Schalter an und
 * Gesundheitssparte genannt: mit Einwilligung und Knöpfen.
 */
export async function einladungNachVertraegen(o: { conversationId: string; an: Ansprache; person: Person; vertraegeText: string; anzahl: number }): Promise<Einladung | null> {
  if (o.anzahl <= 0) return null;
  const c = await prisma.conversation.findUnique({
    where: { id: o.conversationId },
    select: { customerId: true, contactPhone: true, lead: { select: { source: true, erasedAt: true, formData: true } } },
  });
  if (!c?.lead || c.lead.erasedAt) return null;
  const gesundheitAn = policenGesundheitAn() && !minderjaehrig(c.lead.formData);
  if (!gesundheitAn && gesundheitInText(c.lead.source)) return null;
  const outbound = await prisma.message.findMany({ where: { conversationId: o.conversationId, direction: "outbound" }, select: { body: true } });
  if (outbound.some((m) => EINLADUNG_RE.test(m.body ?? ""))) return null;
  const gesundheitGenannt = gesundheitInText(o.vertraegeText) || (gesundheitAn && gesundheitInText(c.lead.source));
  return einladung({ customerId: c.customerId, phone: c.contactPhone, an: o.an, person: o.person, gesundheitAn, gesundheitGenannt });
}
