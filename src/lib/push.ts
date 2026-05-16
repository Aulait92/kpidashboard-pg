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

// Verschickt eine Benachrichtigung an alle gespeicherten Subscriptions.
// Subscriptions, die das Push-Gateway als 404/410 abweist, werden gelöscht
// (Device deregistriert die PWA oder Subscription abgelaufen).
export async function sendToAll(
  payload: PushPayload,
): Promise<{ sent: number; removed: number; errors: string[] }> {
  if (!configure()) {
    return {
      sent: 0,
      removed: 0,
      errors: ["VAPID-Schlüssel nicht konfiguriert"],
    };
  }

  const subs = await prisma.pushSubscription.findMany();
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
