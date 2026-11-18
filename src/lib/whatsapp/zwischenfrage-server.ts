// Zwischenfrage vor dem Terminvorschlag (Ole, 17.11.2026, lib/whatsapp/zwischenfrage.ts): Verlauf laden, Antworten
// festhalten. Der Versand und der Terminvorschlag laufen in bot.ts (runBotTurn).

import { prisma } from "@/lib/prisma";
import { angabenOhneGesundheit } from "@/lib/gesundheitsdaten";
import { mergeQualificationData, type QualificationKey } from "@/lib/whatsapp/qualification";
import { zwischenSchritt, type ZwischenSchritt } from "@/lib/whatsapp/zwischenfrage";
import type { FormAntwort } from "@/lib/whatsapp/erstanschreiben";

/** Stand der Zwischenfrage für die neue Nachricht des Leads (null = der Assistent macht wie bisher weiter). */
export async function zwischenStand(o: { conversationId: string; source: string | null; formular: FormAntwort[]; angaben: unknown }): Promise<ZwischenSchritt | null> {
  const verlauf = (
    await prisma.message.findMany({
      where: { conversationId: o.conversationId, direction: { in: ["inbound", "outbound"] } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { direction: true, body: true, kind: true, purpose: true, sentBy: true },
    })
  ).reverse();
  return zwischenSchritt({ source: o.source, verlauf, formular: o.formular, angaben: o.angaben });
}

/** Angaben am Chat festhalten (wie record_qualification, ohne Gesundheitsangaben); qualifiziert optional setzen. */
export async function zwischenAngabeSpeichern(conversationId: string, angaben: Partial<Record<QualificationKey, string>>, opts: { qualifiziert?: boolean; tier?: boolean } = {}): Promise<void> {
  const prev = (await prisma.conversation.findUnique({ where: { id: conversationId }, select: { qualificationData: true } }))?.qualificationData;
  const sauber = angabenOhneGesundheit(angaben, { tier: opts.tier });
  const data = mergeQualificationData(prev, sauber);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { ...(data ? { qualificationData: data } : {}), ...(opts.qualifiziert ? { qualified: true } : {}) },
  });
  await prisma.message.create({ data: { conversationId, direction: "internal", kind: "qualification", body: JSON.stringify({ angaben: sauber, via: "zwischenfrage" }), sentBy: "system" } });
}
