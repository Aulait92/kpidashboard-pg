import webpush from "web-push";
import { prisma } from "@/lib/prisma";

let configured = false;
function configure() {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

type SendOutcome = { sent: number; removed: number; errors: string[] };

// Niedrig-Level: schickt Payload an exakt diese Subscriptions.
// Beendete Endpunkte (404/410) werden direkt aufgeräumt.
async function sendToSubscriptions(
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload,
): Promise<SendOutcome> {
  const errors: string[] = [];
  let sent = 0;
  let removed = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
      );
      sent += 1;
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { lastUsedAt: new Date() },
      });
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
        removed += 1;
      } else {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }
  return { sent, removed, errors };
}

// An alle Admin-User. Legacy-Subscriptions mit userId=NULL werden hier
// mitbehandelt (vor der Auth-Einführung gab's nur den Admin).
export async function sendToAdmins(
  payload: PushPayload,
): Promise<SendOutcome> {
  if (!configure()) {
    return { sent: 0, removed: 0, errors: ["VAPID nicht konfiguriert."] };
  }
  const adminIds = (
    await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    })
  ).map((u) => u.id);

  const subs = await prisma.pushSubscription.findMany({
    where: {
      OR: [{ userId: { in: adminIds } }, { userId: null }],
    },
  });
  return sendToSubscriptions(subs, payload);
}

// An alle Buyer-User eines bestimmten Kunden.
export async function sendToBuyersOfCustomer(
  customerId: string,
  payload: PushPayload,
): Promise<SendOutcome> {
  if (!configure()) {
    return { sent: 0, removed: 0, errors: ["VAPID nicht konfiguriert."] };
  }
  const buyerIds = (
    await prisma.user.findMany({
      where: { role: "BUYER", customerId },
      select: { id: true },
    })
  ).map((u) => u.id);
  if (buyerIds.length === 0) return { sent: 0, removed: 0, errors: [] };

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: buyerIds } },
  });
  return sendToSubscriptions(subs, payload);
}

// Test-Endpoint: an Subscriptions des aktuell eingeloggten Users.
export async function sendToUser(
  userId: string,
  payload: PushPayload,
): Promise<SendOutcome> {
  if (!configure()) {
    return { sent: 0, removed: 0, errors: ["VAPID nicht konfiguriert."] };
  }
  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
  });
  return sendToSubscriptions(subs, payload);
}
