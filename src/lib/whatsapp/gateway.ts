// WhatsApp-Gateway: persistiert eingehende Nachrichten/Status (vom Webhook)
// und sendet ausgehende Nachrichten über 360dialog. Multi-Tenant: das Routing
// läuft über die phone_number_id → WhatsAppAccount → Kunde. Strikt pro Kunde
// isoliert; nichts verlässt den Kunden-Scope.

import { decryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { sendText, type SendResult } from "@/lib/whatsapp/dialog360";
import { linkLeadToConversation } from "@/lib/whatsapp/lead-link";

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24-Stunden-Service-Fenster

// Lockere Typen für das Meta-/360dialog-Webhook-Format (nur was wir lesen).
type InboundMessage = {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  // Antwort per Schnellantwort-Knopf einer Vorlage (z. B. „Keine Nachrichten mehr“)
  button?: { text?: string; payload?: string };
  // Antwort auf interaktive Knöpfe/Listen (freie Nachrichten im 24-h-Fenster)
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
};

/** Lesbarer Text einer eingehenden Nachricht (Knopf-Antworten als Knopftext). */
export function inboundBody(m: InboundMessage): string | null {
  const type = m.type ?? "text";
  if (type === "text") return m.text?.body ?? null;
  if (type === "button") return m.button?.text ?? m.button?.payload ?? "[button]";
  if (type === "interactive") return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "[interactive]";
  return `[${type}]`;
}
type StatusUpdate = {
  id?: string;
  status?: string;
  // Meta-Preisangabe (Abrechnung je Nachricht)
  pricing?: { billable?: boolean; category?: string; pricing_model?: string };
};
// Coexistence: Nachrichten, die der Kunde selbst in seiner WhatsApp-Business-
// App (Handy) an einen Kontakt schickt, kommen als „Echo" (Webhook-Feld
// smb_message_echoes) — from = Geschäftsnummer, to = Kontakt.
type MessageEcho = {
  from?: string;
  to?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
};
type ChangeValue = {
  metadata?: { phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string } }>;
  messages?: InboundMessage[];
  statuses?: StatusUpdate[];
  message_echoes?: MessageEcho[];
};
type WebhookPayload = {
  entry?: Array<{ changes?: Array<{ value?: ChangeValue }> }>;
};

export type InboundResult = { processed: number; errors: string[] };

/** Verarbeitet einen kompletten Webhook-Payload (Nachrichten + Status). */
export async function handleInboundPayload(
  payload: unknown,
  opts: { accountId?: string | null } = {},
): Promise<InboundResult> {
  const errors: string[] = [];
  let processed = 0;

  const entries = (payload as WebhookPayload)?.entry;
  if (!Array.isArray(entries)) return { processed, errors };

  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id;
      let account = phoneNumberId
        ? await prisma.whatsAppAccount.findFirst({ where: { phoneNumberId } })
        : null;
      if (!account && opts.accountId) {
        // Webhook-URL trägt die Konto-ID (beim Verbinden gesetzt). Beim ersten
        // Event wird die phone_number_id gelernt; danach ist sie maßgeblich.
        const hinted = await prisma.whatsAppAccount.findUnique({
          where: { id: opts.accountId },
        });
        if (hinted && (!hinted.phoneNumberId || hinted.phoneNumberId === phoneNumberId)) {
          account = hinted;
          if (phoneNumberId && !hinted.phoneNumberId) {
            await prisma.whatsAppAccount.update({
              where: { id: hinted.id },
              data: { phoneNumberId },
            });
          }
        }
      }
      if (!account) {
        // Sandbox-/Single-Tenant-Komfort: Gibt es genau EIN Konto, wird es
        // genutzt (und die phone_number_id nachgetragen). In Produktion mit
        // mehreren Konten greift das nicht — dort ist die phone_number_id
        // maßgeblich.
        const accounts = await prisma.whatsAppAccount.findMany({ take: 2 });
        if (accounts.length === 1) {
          account = accounts[0];
          if (phoneNumberId && !account.phoneNumberId) {
            await prisma.whatsAppAccount.update({
              where: { id: account.id },
              data: { phoneNumberId },
            });
          }
        }
      }

      // Eingehende Nachrichten
      const contactName = value.contacts?.[0]?.profile?.name ?? null;
      for (const m of value.messages ?? []) {
        try {
          if (!account) {
            errors.push(
              `Kein WhatsAppAccount für phone_number_id ${phoneNumberId ?? "?"}`,
            );
            continue;
          }
          await persistInbound(account.customerId, account.id, m, contactName);
          processed++;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }

      // Coexistence-Echos: vom Kunden selbst in der Business-App gesendet.
      for (const echo of value.message_echoes ?? []) {
        try {
          if (!account) continue;
          await persistEcho(account.customerId, account.id, echo);
          processed++;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }

      // Zustellstatus zu ausgehenden Nachrichten
      for (const s of value.statuses ?? []) {
        try {
          await applyStatus(s);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
    }
  }

  return { processed, errors };
}

async function persistInbound(
  customerId: string,
  whatsAppAccountId: string,
  m: InboundMessage,
  contactName: string | null,
): Promise<void> {
  const from = m.from;
  if (!from) return;

  // Idempotenz: Webhooks werden bei Timeout erneut zugestellt.
  if (m.id) {
    const existing = await prisma.message.findUnique({
      where: { waMessageId: m.id },
      select: { id: true },
    });
    if (existing) return;
  }

  const now = new Date();
  const windowExpiresAt = new Date(now.getTime() + WINDOW_MS);

  const conversation = await prisma.conversation.upsert({
    where: { customerId_contactPhone: { customerId, contactPhone: from } },
    create: {
      customerId,
      whatsAppAccountId,
      contactPhone: from,
      contactName,
      botActive: true,
      status: "open",
      lastMessageAt: now,
      windowExpiresAt,
    },
    update: {
      status: "open",
      lastMessageAt: now,
      windowExpiresAt,
      ...(contactName ? { contactName } : {}),
    },
  });

  // Mit dem Lead aus Airtable verknüpfen (Formularangaben für den Bot).
  if (!conversation.leadId) {
    await linkLeadToConversation(conversation.id).catch((e) =>
      console.error("[whatsapp lead-link]", e),
    );
  }

  const type = m.type ?? "text";
  const body = inboundBody(m);

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "inbound",
      kind: type,
      body,
      waMessageId: m.id ?? null,
    },
  });

  // Empfehlungen: Anfrage über den WhatsApp-Knopf der Empfehlungsseite (Code im Text) → Lead „Empfehlung“
  if (!conversation.leadId && body && body.includes("(Ref ")) {
    try {
      const { handleReferralInbound } = await import("@/lib/empfehlung/requests");
      await handleReferralInbound(conversation.id, from, body, contactName);
    } catch (e) {
      console.error("[whatsapp referral-inbound]", e);
    }
  }

  // Empfehlungen & Bewertungen: Antwort auf die Nachfrage nach dem Abschluss → KI wertet aus
  // (Kritik → Aufgabe „Kunde unzufrieden“), Assistent antwortet dann nicht.
  try {
    const { handleReviewReply } = await import("@/lib/empfehlung/requests");
    if ((await handleReviewReply(conversation.id, from, body)).handled) return;
  } catch (e) {
    console.error("[whatsapp review-reply]", e);
  }

  // Bestandskunden-Kampagne: Antwort → Lead in der Pipeline; „Stopp“ → Sperre, Assistent schweigt.
  let campaignStop = false;
  try {
    const { handleCampaignReply } = await import("@/lib/bestand/campaigns");
    campaignStop = (await handleCampaignReply(conversation.id, from, body)).stop;
  } catch (e) {
    console.error("[whatsapp campaign-reply]", e);
  }
  if (campaignStop) return;

  // CRM: Lead hat geantwortet ⇒ „Im Gespräch" (nur aus Neu/Nicht erreicht).
  const linkedLead = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    select: { leadId: true },
  });
  if (linkedLead?.leadId) {
    const { recordLeadProgress } = await import("@/lib/lead-progress");
    await recordLeadProgress(linkedLead.leadId, "replied");
  }

  // Übernommener Chat (Assistent pausiert): Berater muss antworten.
  if (!conversation.botActive) {
    const { flagAttention } = await import("@/lib/whatsapp/attention");
    await flagAttention(conversation.id, body ? `Neue Nachricht: „${body.slice(0, 100)}"` : "Neue Nachricht");
  }

  // KI-Bot anstoßen, wenn aktiv. Dynamischer Import bricht den Zyklus
  // gateway <-> bot; Fehler dürfen die Ingestion nicht scheitern lassen.
  if (conversation.botActive) {
    try {
      const { runBotTurn } = await import("@/lib/whatsapp/bot");
      await runBotTurn(conversation.id);
    } catch (e) {
      console.error("[whatsapp bot]", e);
    }
  }
}

/**
 * Echo einer Nachricht, die der Kunde selbst in seiner WhatsApp-Business-App
 * geschrieben hat: als ausgehende Nachricht („Du (App)") speichern und den
 * Assistenten für diesen Chat pausieren — der Mensch hat übernommen.
 */
async function persistEcho(
  customerId: string,
  whatsAppAccountId: string,
  e: MessageEcho,
): Promise<void> {
  const to = e.to;
  if (!to) return;
  // Idempotenz — und von uns per API gesendete Nachrichten (schon mit
  // waMessageId gespeichert) nicht doppelt anlegen/als Übernahme werten.
  if (e.id) {
    const existing = await prisma.message.findUnique({
      where: { waMessageId: e.id },
      select: { id: true },
    });
    if (existing) return;
  }
  const now = new Date();
  const conversation = await prisma.conversation.upsert({
    where: { customerId_contactPhone: { customerId, contactPhone: to } },
    create: {
      customerId,
      whatsAppAccountId,
      contactPhone: to,
      botActive: false,
      status: "open",
      lastMessageAt: now,
    },
    update: { botActive: false, lastMessageAt: now },
  });
  const type = e.type ?? "text";
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "outbound",
      kind: type,
      body: type === "text" ? (e.text?.body ?? null) : `[${type}]`,
      waMessageId: e.id ?? null,
      status: "sent",
      sentBy: "app",
    },
  });
  if (!conversation.leadId) {
    await linkLeadToConversation(conversation.id).catch(() => {});
  }
}

async function applyStatus(s: StatusUpdate): Promise<void> {
  if (!s.id || !s.status) return;
  const pricing =
    s.pricing && typeof s.pricing.billable === "boolean"
      ? { billable: s.pricing.billable, pricingCategory: s.pricing.category?.toLowerCase() ?? null }
      : {};
  await prisma.message.updateMany({
    where: { waMessageId: s.id },
    data: { status: s.status, ...pricing },
  });
}

/**
 * Ausgehende Nachricht senden (vom Bot oder einem Agenten) und persistieren.
 * Lädt das verbundene WhatsApp-Konto des Kunden, entschlüsselt den API-Key und
 * ruft 360dialog auf. (Freitext — nur innerhalb des 24h-Fensters erlaubt.)
 */
export async function sendWhatsAppMessage(opts: {
  customerId: string;
  to: string;
  body: string;
  sentBy?: "bot" | "agent" | "system";
  sentByUserId?: string | null;
}): Promise<SendResult> {
  const account = await prisma.whatsAppAccount.findUnique({
    where: { customerId: opts.customerId },
  });
  if (!account || account.status !== "connected" || !account.apiKeyEnc) {
    throw new Error("Kein verbundenes WhatsApp-Konto für diesen Kunden.");
  }

  const apiKey = decryptSecret(account.apiKeyEnc);
  const result = await sendText(apiKey, opts.to, opts.body);

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
      status: "open",
      lastMessageAt: now,
    },
    update: { lastMessageAt: now },
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "outbound",
      kind: "text",
      body: opts.body,
      waMessageId: result.messageId,
      status: "sent",
      sentBy: opts.sentBy ?? "system",
      sentByUserId: opts.sentByUserId ?? null,
    },
  });

  return result;
}
