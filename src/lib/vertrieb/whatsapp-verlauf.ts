// WhatsApp-Verlauf in der Akte (Ole, 22.11.2026): „im Kontakt sehen, was man mit der Person per WhatsApp geschrieben hat“.
// Quelle sind die Chats der Support-Nummer (lib/whatsapp/support-inbox.ts). Zugeordnet wird wie im Postfach
// (lib/whatsapp/support-contacts.ts): über salesContactId bzw. linkedCustomerId. Dazu Chats mit derselben Nummer, die
// noch niemandem zugeordnet sind (z. B. Kontakt erst nach dem Chat angelegt); von Hand zugeordnete bleiben unberührt.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { phoneDigitsKey } from "@/lib/telefonsuche";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { dateiInfo, type DateiInfo } from "@/lib/chat-dateien";

/** Wie viele Nachrichten die Karte zeigt (der Rest steht im Chat). */
export const WHATSAPP_VERLAUF_ANZAHL = 4;

export type WhatsAppVerlaufNachricht = {
  id: string;
  direction: string;
  kind: string | null;
  body: string | null;
  sentBy: string | null;
  status: string | null;
  createdAt: Date;
  /** Datei der Nachricht (lib/chat-dateien.ts): Name, Art, Größe, Absender; Support-Nummer ohne Support-Zugriff */
  datei?: DateiInfo | null;
};

export type WhatsAppVerlauf = {
  /** Chat mit der jüngsten Nachricht (dorthin führt „Ganzer Chat“) */
  chatId: string;
  /** Alle Nachrichten (ein- und ausgehend) über alle Chats der Person */
  anzahl: number;
  /** Die letzten Nachrichten, älteste zuerst */
  nachrichten: WhatsAppVerlaufNachricht[];
  /** Weitere Chats derselben Person (z. B. zweite Nummer) */
  weitereChats: number;
};

/** Bedingung für die Support-Chats einer Person. null, wenn es nichts zu suchen gibt. */
export function whatsAppChatsWhere(x: { salesContactId?: string | null; customerId?: string | null; phones?: (string | null | undefined)[] }): Prisma.ConversationWhereInput | null {
  const keys = [...new Set((x.phones ?? []).map(phoneDigitsKey).filter((k): k is string => !!k))];
  const oder: Prisma.ConversationWhereInput[] = [
    ...(x.salesContactId ? [{ salesContactId: x.salesContactId }] : []),
    ...(x.customerId ? [{ linkedCustomerId: x.customerId }] : []),
    // Noch nicht zugeordnet, aber gleiche Nummer (die Zuordnung im Postfach läuft nur beim Öffnen bzw. bei neuen Nachrichten)
    ...(keys.length ? [{ phoneDigits: { in: keys }, contactLinkManual: false, salesContactId: null, linkedCustomerId: null }] : []),
  ];
  if (!oder.length) return null;
  return { customerId: SUPPORT_CUSTOMER_ID, OR: oder };
}

const NACHRICHT = { direction: { in: ["inbound", "outbound"] } } satisfies Prisma.MessageWhereInput;

/** WhatsApp-Verlauf einer Person (Vertriebskontakt und/oder Kunde). null ohne Chat bzw. ohne Nachrichten. */
export async function ladeWhatsAppVerlauf(x: { salesContactId?: string | null; customerId?: string | null }): Promise<WhatsAppVerlauf | null> {
  // Kunde ohne angegebenen Kontakt: dessen Vertriebskontakt mit dazu (Nummern, Zuordnung)
  const salesContactId =
    x.salesContactId ?? (x.customerId ? ((await prisma.salesContact.findFirst({ where: { customerId: x.customerId }, select: { id: true } }))?.id ?? null) : null);
  const kontakt = salesContactId
    ? await prisma.salesContact.findUnique({ where: { id: salesContactId }, select: { customerId: true, phone: true, phones: { select: { phone: true } } } })
    : null;
  const where = whatsAppChatsWhere({
    salesContactId,
    customerId: x.customerId ?? kontakt?.customerId ?? null,
    phones: kontakt ? [kontakt.phone, ...kontakt.phones.map((p) => p.phone)] : [],
  });
  if (!where) return null;
  const chats = await prisma.conversation.findMany({
    where,
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 10,
    select: { id: true },
  });
  if (!chats.length) return null;
  const ids = chats.map((c) => c.id);
  const [anzahl, letzte] = await Promise.all([
    prisma.message.count({ where: { conversationId: { in: ids }, ...NACHRICHT } }),
    prisma.message.findMany({
      where: { conversationId: { in: ids }, ...NACHRICHT },
      orderBy: { createdAt: "desc" },
      take: WHATSAPP_VERLAUF_ANZAHL,
      select: {
        id: true,
        conversationId: true,
        direction: true,
        kind: true,
        body: true,
        sentBy: true,
        status: true,
        createdAt: true,
        mediaName: true,
        mediaMime: true,
        mediaSize: true,
        conversation: { select: { contactName: true } },
      },
    }),
  ]);
  if (!letzte.length) return null;
  const datei = (m: (typeof letzte)[number]) => dateiInfo(m, { leadChat: false, supportChat: true, leadName: m.conversation.contactName });
  return {
    chatId: letzte[0].conversationId,
    anzahl,
    nachrichten: letzte
      .reverse()
      .map((m) => ({ id: m.id, direction: m.direction, kind: m.kind, body: m.body, sentBy: m.sentBy, status: m.status, createdAt: m.createdAt, datei: datei(m) })),
    weitereChats: chats.length - 1,
  };
}
