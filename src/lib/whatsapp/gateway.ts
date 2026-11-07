// WhatsApp-Gateway: persistiert eingehende Nachrichten/Status (vom Webhook)
// und sendet ausgehende Nachrichten über 360dialog. Multi-Tenant: das Routing
// läuft über die phone_number_id → WhatsAppAccount → Kunde. Strikt pro Kunde
// isoliert; nichts verlässt den Kunden-Scope.

import { decryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { sendText, type SendResult } from "@/lib/whatsapp/dialog360";

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24-Stunden-Service-Fenster

// Lockere Typen für das Meta-/360dialog-Webhook-Format (nur was wir lesen).
type InboundMessage = {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
};
type StatusUpdate = { id?: string; status?: string };
type ChangeValue = {
  metadata?: { phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string } }>;
  messages?: InboundMessage[];
  statuses?: StatusUpdate[];
};
type WebhookPayload = {
  entry?: Array<{ changes?: Array<{ value?: ChangeValue }> }>;
};

export type InboundResult = { processed: number; errors: string[] };

/** Verarbeitet einen kompletten Webhook-Payload (Nachrichten + Status). */
export async function handleInboundPayload(
  payload: unknown,
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
      const account = phoneNumberId
        ? await prisma.whatsAppAccount.findFirst({ where: { phoneNumberId } })
        : null;

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

  const type = m.type ?? "text";
  const body = type === "text" ? (m.text?.body ?? null) : `[${type}]`;

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "inbound",
      kind: type,
      body,
      waMessageId: m.id ?? null,
    },
  });

  // TODO (Phase 0): Wenn conversation.botActive, hier die KI-Bot-Verarbeitung
  // anstoßen (Qualifizierung → Lead-Felder → Terminvorschlag).
}

async function applyStatus(s: StatusUpdate): Promise<void> {
  if (!s.id || !s.status) return;
  await prisma.message.updateMany({
    where: { waMessageId: s.id },
    data: { status: s.status },
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
