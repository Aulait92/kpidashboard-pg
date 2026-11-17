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

// Neu (Ole, 16.11.2026, Erstanschreiben v5): Im offenen Fenster geht das PDF als Nachricht 2 direkt nach dem
// Erstanschreiben bzw. der ersten Antwort raus, mit kurzem Begleittext (ERSTINFO_PDF_CAPTION) und dem Dateinamen
// „Erstinformation_<Agentur>.pdf“. Das PDF wird aus den Anbieterangaben erzeugt (gleiche Quelle wie die Seite
// /erstinformation/<token>), nach Hash der Angaben zwischengespeichert und über die öffentliche Adresse mit Token und
// Hash an 360dialog gegeben (Meta lädt die Datei selbst, kein Hochladen nötig). Klappt das nicht, geht als Rückfall
// der Link zur Erstinformation als Text raus (sendErstinfo) und der Fehler wird protokolliert.
//
// Live-Test (Ole, 17.11.2026): Die Erstinformation kommt IMMER mit der ersten Nachricht (PDF-Kopf der Vorlage) bzw. im
// offenen Fenster unmittelbar als Nachricht 2 direkt nach dem Erstanschreiben, nie erst nach einer Antwort des
// Assistenten (bot.ts schickt ein noch fehlendes PDF VOR seiner Antwort). Sind die Angaben unvollständig, geht das PDF
// im aktuellen Stand (erstinfoPdfStand) statt nur des Links; der Link bleibt Rückfall, wenn kein PDF erzeugbar ist.

import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/encryption";
import { sendDocument } from "@/lib/whatsapp/dialog360";
import { ERSTINFO_PDF_CAPTION, erstinfoZeile, hasErstinfoLink, hasErstinfoPdf } from "@/lib/whatsapp/ki-hinweis";
import type { Ansprache } from "@/lib/ansprache";

export type ErstinfoPdfResult = "sent" | "already" | "incomplete" | "window_closed" | "not_possible" | "failed";

/** PDF der Erstinformation in eine Unterhaltung schicken, falls noch nicht geschehen. Wirft bei Versandfehlern nicht. */
export async function sendErstinfoPdf(opts: { conversationId: string; an?: Ansprache; advisorName?: string }): Promise<ErstinfoPdfResult> {
  let step = "laden";
  try {
    const conv = await prisma.conversation.findUnique({
      where: { id: opts.conversationId },
      select: { id: true, customerId: true, contactPhone: true, windowExpiresAt: true, optedOutAt: true, messages: { where: { kind: { in: ["document", "template"] } }, select: { direction: true, kind: true, body: true } } },
    });
    if (!conv || conv.optedOutAt) return "not_possible";
    if (hasErstinfoPdf(conv.messages)) return "already";
    if (!conv.windowExpiresAt || conv.windowExpiresAt.getTime() <= Date.now()) return "window_closed";
    const account = await prisma.whatsAppAccount.findUnique({ where: { customerId: conv.customerId }, select: { status: true, apiKeyEnc: true } });
    if (!account || account.status !== "connected" || !account.apiKeyEnc) return "not_possible";
    const { erstinfoPdfFuerWhatsApp, erstinfoPdfStand, erstinfoUrlFor } = await import("@/lib/erstinformation");
    step = "pdf";
    let pdf: { link: string; filename: string } | null = await erstinfoPdfFuerWhatsApp(conv.customerId);
    if (!pdf) {
      // Angaben unvollständig: PDF im aktuellen Stand (derselbe Inhalt wie die öffentliche Seite) statt nur des Links
      const stand = await erstinfoPdfStand(conv.customerId);
      if (!stand) return "incomplete";
      console.warn(`[whatsapp] Erstinformation unvollständig, PDF im aktuellen Stand customer=${conv.customerId} fehlt=${stand.fehlt.join(",") || "-"}`);
      pdf = stand;
    }
    const page = await erstinfoUrlFor(conv.customerId);
    step = "senden";
    const res = await sendDocument(decryptSecret(account.apiKeyEnc), conv.contactPhone, { link: pdf.link, filename: pdf.filename, caption: ERSTINFO_PDF_CAPTION });
    await prisma.message.create({
      data: { conversationId: conv.id, direction: "outbound", kind: "document", body: `${ERSTINFO_PDF_CAPTION}\n${pdf.filename}\n${page}`, waMessageId: res.messageId, status: "sent", sentBy: "bot" },
    });
    await prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } });
    return "sent";
  } catch (err) {
    console.error(`[whatsapp] Erstinformation als PDF (${step})`, err instanceof Error ? err.message.slice(0, 300) : err);
    return step === "laden" ? "not_possible" : "failed";
  }
}

/**
 * Erstinformation nach der ersten Nachricht: PDF (sendErstinfoPdf); schlägt das fehl bzw. ist das PDF nicht
 * vollständig, als Rückfall der Link als Text (wie bisher), einmal je Unterhaltung, mit Protokollzeile.
 */
export async function sendErstinfo(opts: { conversationId: string; an?: Ansprache; advisorName: string }): Promise<ErstinfoPdfResult | "link"> {
  const r = await sendErstinfoPdf(opts);
  if (r !== "failed" && r !== "incomplete") return r;
  try {
    const conv = await prisma.conversation.findUnique({
      where: { id: opts.conversationId },
      select: { customerId: true, contactPhone: true, messages: { where: { direction: "outbound" }, select: { body: true } } },
    });
    if (!conv || conv.messages.some((m) => hasErstinfoLink(m.body))) return r;
    const { erstinfoUrlFor } = await import("@/lib/erstinformation");
    const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
    await sendWhatsAppMessage({ customerId: conv.customerId, to: conv.contactPhone, body: erstinfoZeile(opts.advisorName, await erstinfoUrlFor(conv.customerId)), sentBy: "bot" });
    console.warn(`[whatsapp] Erstinformation: PDF ${r === "failed" ? "nicht gesendet" : "unvollständig"}, Link als Rückfall`, opts.conversationId);
    return "link";
  } catch (err) {
    console.error("[whatsapp] Erstinformation als Link", err instanceof Error ? err.message.slice(0, 300) : err);
    return r;
  }
}
