// Erstinformation als PDF per WhatsApp (§ 16 VersVermV, Ole 15.11.2026): Die Mitteilung muss auf Papier oder
// einem anderen dauerhaften Datenträger erfolgen, ein Link auf eine Website reicht allein nicht. Deshalb schickt der
// Assistent das PDF als WhatsApp-Dokument, der Link bleibt zusätzlich im Text.
//
// Entscheidung zum Zeitpunkt: WhatsApp erlaubt Dokumente (wie Freitext) nur im offenen 24-Stunden-Fenster, also
// nachdem der Lead geschrieben hat. Direkt nach der Vorlage des Erstanschreibens ist das Fenster noch zu
// (Meta lehnt freie Nachrichten dann ab). Eine Vorlage mit PDF im Kopf bräuchte eine neue Freigabe durch Meta für
// jeden Kunden. Darum:
//   - Lead schreibt zuerst bzw. antwortet auf das Erstanschreiben → das PDF geht mit der ersten Antwort des
//     Assistenten raus (bot.ts).
//   - Erstanschreiben bei offenem Fenster (Freitext statt Vorlage) → PDF direkt danach (outreach.ts).
//   - Bucht der Lead über die Buchungsseite, hängt das PDF an der Terminbestätigung per E-Mail
//     (calendar/lead-email.ts).
// Das Erstanschreiben (Vorlage) enthält weiter den Link. Nur vollständige Erstinformationen gehen als PDF raus.
//
// Seit v4 (Ole, 15.11.2026) trägt das Erstanschreiben das PDF im Kopf der Vorlage (DOCUMENT-Header, beim Senden mit
// dem PDF-Link des Kunden, siehe templates.ts → TEMPLATE_HEADER). Dann ist das PDF schon beim Lead (gespeichert mit
// der Markierung ERSTINFO_KOPF) und sendErstinfoPdf meldet „already“. Dieser Versand nach der ersten Antwort bleibt
// als Rückfall: für ältere Vorlagen ohne Kopf, wenn 360dialog bzw. Meta den Kopf ablehnt (dann wird ohne Kopf
// eingereicht, template-submit.ts) und wenn die Erstinformation beim Erstanschreiben noch nicht vollständig war.

import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/encryption";
import { sendDocument } from "@/lib/whatsapp/dialog360";
import { erstinfoPdfText, hasErstinfoPdf } from "@/lib/whatsapp/ki-hinweis";
import type { Ansprache } from "@/lib/ansprache";

export type ErstinfoPdfResult = "sent" | "already" | "incomplete" | "window_closed" | "not_possible";

/** PDF der Erstinformation in eine Unterhaltung schicken, falls noch nicht geschehen. Wirft bei Versandfehlern nicht. */
export async function sendErstinfoPdf(opts: { conversationId: string; an: Ansprache; advisorName: string }): Promise<ErstinfoPdfResult> {
  try {
    const conv = await prisma.conversation.findUnique({
      where: { id: opts.conversationId },
      select: { id: true, customerId: true, contactPhone: true, windowExpiresAt: true, optedOutAt: true, messages: { where: { kind: { in: ["document", "template"] } }, select: { direction: true, kind: true, body: true } } },
    });
    if (!conv || conv.optedOutAt) return "not_possible";
    if (hasErstinfoPdf(conv.messages)) return "already";
    if (!conv.windowExpiresAt || conv.windowExpiresAt.getTime() <= Date.now()) return "window_closed";
    const { erstinfoBereit, erstinfoDokument, erstinfoPdfUrlFor, erstinfoUrlFor } = await import("@/lib/erstinformation");
    if (!(await erstinfoBereit(conv.customerId))) return "incomplete";
    const account = await prisma.whatsAppAccount.findUnique({ where: { customerId: conv.customerId }, select: { status: true, apiKeyEnc: true } });
    if (!account || account.status !== "connected" || !account.apiKeyEnc) return "not_possible";
    const [doc, link, page] = await Promise.all([erstinfoDokument({ customerId: conv.customerId }), erstinfoPdfUrlFor(conv.customerId), erstinfoUrlFor(conv.customerId)]);
    if (!doc) return "not_possible";
    const caption = erstinfoPdfText(opts.an, opts.advisorName);
    const res = await sendDocument(decryptSecret(account.apiKeyEnc), conv.contactPhone, { link, filename: doc.fileName, caption });
    await prisma.message.create({
      data: { conversationId: conv.id, direction: "outbound", kind: "document", body: `${caption}\n${page}`, waMessageId: res.messageId, status: "sent", sentBy: "bot" },
    });
    await prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } });
    return "sent";
  } catch (err) {
    console.error("[whatsapp] Erstinformation als PDF", err instanceof Error ? err.message : err);
    return "not_possible";
  }
}
