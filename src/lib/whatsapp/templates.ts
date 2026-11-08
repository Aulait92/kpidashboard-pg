// System-Nachrichten (Erstanschreiben, Buchungsbestätigung, Erinnerung).
// WhatsApp erlaubt Freitext nur im 24h-Service-Fenster (nach der letzten
// Nachricht des Kontakts). Außerhalb muss eine von Meta freigegebene Vorlage
// verwendet werden. sendWhatsAppNotice wählt automatisch:
//   Fenster offen → Freitext (identischer Inhalt, keine Vorlagenkosten)
//   Fenster zu    → freigegebene Vorlage des Kunden für diesen Zweck
//
// Parameter-Reihenfolge je Zweck ({{1}}, {{2}} … im Vorlagentext):
//   outreach:             {{1}} Vorname
//   booking_confirmation: {{1}} Vorname, {{2}} Datum/Uhrzeit, {{3}} Art, {{4}} Link/Hinweis
//   reminder:             {{1}} Vorname, {{2}} Datum/Uhrzeit, {{3}} Art, {{4}} Link/Hinweis

import { decryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { sendTemplate, sendText } from "@/lib/whatsapp/dialog360";

export type NoticePurpose =
  | "outreach"
  | "booking_confirmation"
  | "reminder"
  | "followup"
  | "followup_offer"
  | "followup_noshow";

export const PURPOSE_LABELS: Record<NoticePurpose, string> = {
  outreach: "Erstanschreiben",
  booking_confirmation: "Buchungsbestätigung",
  reminder: "Termin-Erinnerung",
  followup: "Nachfassen allgemein (Chat > 24 h still)",
  followup_offer: "Nachfassen nach Angebot",
  followup_noshow: "Nachfassen nach verpasstem Termin",
};

export const PURPOSE_PARAMS: Record<NoticePurpose, string[]> = {
  outreach: ["Vorname"],
  booking_confirmation: ["Vorname", "Datum/Uhrzeit", "Art", "Link/Hinweis"],
  reminder: ["Vorname", "Datum/Uhrzeit", "Art", "Link/Hinweis"],
  followup: ["Vorname"],
  followup_offer: ["Vorname", "Thema (z. B. Hausrat, Haftpflicht)"],
  followup_noshow: ["Vorname"],
};

/** Vorschläge für die bei Meta einzureichenden Texte ([Berater] = Name). */
export const SUGGESTED_TEMPLATE_TEXT: Record<NoticePurpose, string> = {
  outreach:
    "Hallo {{1}}, danke für deine Anfrage! Hier ist der digitale Assistent von [Berater]. Hast du kurz Zeit für zwei Fragen, damit wir dir ein passendes Angebot machen können?",
  booking_confirmation: "Hallo {{1}}, dein Termin ist bestätigt: {{2}} ({{3}}). {{4}} Bis dann!",
  reminder: "Hallo {{1}}, kurze Erinnerung an deinen Termin: {{2}} ({{3}}). {{4}} Bis dann!",
  followup:
    "Hallo {{1}}, hier ist nochmal der digitale Assistent von [Berater]. Passt es dir diese Woche noch für ein kurzes Gespräch? Antworte einfach hier, dann schlage ich dir Zeiten vor.",
  followup_offer:
    "Hallo {{1}}, hier ist der digitale Assistent von [Berater]. Konntest du dir das Angebot zu {{2}} schon anschauen? Wenn du Fragen hast oder etwas anpassen möchtest, antworte einfach hier.",
  followup_noshow:
    "Hallo {{1}}, schade, dass es mit unserem Termin nicht geklappt hat. Hier ist der digitale Assistent von [Berater] – sollen wir einen neuen Termin finden? Antworte einfach hier.",
};

export class NoTemplateError extends Error {
  constructor(purpose: string) {
    super(`Keine freigegebene WhatsApp-Vorlage für „${purpose}".`);
  }
}

/** {{1}}, {{2}} … durch Parameter ersetzen. */
export function renderTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? "");
}

/** Vorname aus „Vorname Nachname" (Fallback neutral). */
export function firstNameOf(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "du";
}

/**
 * System-Nachricht senden und als Outbound-Message persistieren (damit Inbox
 * und Bot-Verlauf sie sehen). Verknüpft die Konversation optional mit dem Lead.
 */
export async function sendWhatsAppNotice(opts: {
  customerId: string;
  to: string;
  purpose: NoticePurpose;
  params: string[];
  /** Freitext für das offene 24h-Fenster (und Fallback-Inhalt der Inbox). */
  text: string;
  leadId?: string | null;
  contactName?: string | null;
}): Promise<{ mode: "text" | "template"; conversationId: string }> {
  const account = await prisma.whatsAppAccount.findUnique({
    where: { customerId: opts.customerId },
  });
  if (!account || account.status !== "connected" || !account.apiKeyEnc) {
    throw new Error("Kein verbundenes WhatsApp-Konto für diesen Kunden.");
  }

  const existing = await prisma.conversation.findUnique({
    where: {
      customerId_contactPhone: {
        customerId: opts.customerId,
        contactPhone: opts.to,
      },
    },
    select: { windowExpiresAt: true },
  });
  const windowOpen =
    !!existing?.windowExpiresAt && existing.windowExpiresAt.getTime() > Date.now();

  const apiKey = decryptSecret(account.apiKeyEnc);
  let mode: "text" | "template";
  let body: string;
  let messageId: string | null;

  if (windowOpen) {
    mode = "text";
    body = opts.text;
    messageId = (await sendText(apiKey, opts.to, opts.text)).messageId;
  } else {
    const tpl = await prisma.messageTemplate.findFirst({
      where: {
        customerId: opts.customerId,
        purpose: opts.purpose,
        status: "approved",
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!tpl) throw new NoTemplateError(opts.purpose);
    mode = "template";
    body = renderTemplate(tpl.body, opts.params);
    const components = opts.params.length
      ? [
          {
            type: "body",
            parameters: opts.params.map((p) => ({ type: "text", text: p || "-" })),
          },
        ]
      : undefined;
    messageId = (await sendTemplate(apiKey, opts.to, tpl.name, tpl.language, components))
      .messageId;
  }

  const now = new Date();
  const conversation = await prisma.conversation.upsert({
    where: {
      customerId_contactPhone: {
        customerId: opts.customerId,
        contactPhone: opts.to,
      },
    },
    create: {
      customerId: opts.customerId,
      whatsAppAccountId: account.id,
      contactPhone: opts.to,
      contactName: opts.contactName ?? null,
      leadId: opts.leadId ?? null,
      status: "open",
      lastMessageAt: now,
    },
    update: {
      lastMessageAt: now,
      ...(opts.leadId ? { leadId: opts.leadId } : {}),
    },
    select: { id: true },
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "outbound",
      kind: mode === "template" ? "template" : "text",
      body,
      waMessageId: messageId,
      status: "sent",
      sentBy: "system",
    },
  });

  return { mode, conversationId: conversation.id };
}
