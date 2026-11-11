// WhatsApp-Nummer eines Kunden verbinden: 360dialog-API-Key verschlüsselt
// speichern und die Webhook-URL bei 360dialog setzen. Gemeinsam genutzt vom
// Admin-Weg (Key von Hand eintragen) und vom Selbst-Verbinden des Kunden
// (Integrated Onboarding, Key per Partner-API erzeugt).

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { setWebhook } from "@/lib/whatsapp/dialog360";
import { appUrl } from "@/lib/whatsapp/event-text";

export type SaveKeyResult = { ok: true; accountId: string } | { ok: false; accountId: string | null; reason: "noconfig" | "webhook" };

/**
 * Key speichern (neuer Key = evtl. neue Nummer → phone_number_id neu lernen)
 * und Webhook setzen. Die Webhook-URL trägt die Konto-ID, damit eingehende
 * Nachrichten bei mehreren Kunden sicher dem richtigen Kunden zugeordnet werden.
 */
export async function saveWhatsAppKey(
  customerId: string,
  apiKey: string,
  opts: { phone?: string | null; dialog360ClientId?: string | null; dialog360ChannelId?: string | null } = {},
): Promise<SaveKeyResult> {
  const base = appUrl();
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!base || !secret) return { ok: false, accountId: null, reason: "noconfig" };
  const phone = opts.phone ? opts.phone.replace(/\D/g, "").replace(/^00/, "") : "";
  const extra = {
    ...(opts.dialog360ClientId ? { dialog360ClientId: opts.dialog360ClientId } : {}),
    ...(opts.dialog360ChannelId ? { dialog360ChannelId: opts.dialog360ChannelId } : {}),
  };
  const account = await prisma.whatsAppAccount.upsert({
    where: { customerId },
    create: { customerId, provider: "360dialog", apiKeyEnc: encryptSecret(apiKey), phoneNumber: phone || null, status: "pending", ...extra },
    update: { apiKeyEnc: encryptSecret(apiKey), phoneNumberId: null, ...(phone ? { phoneNumber: phone } : {}), ...extra },
    select: { id: true },
  });
  const url = `${base}/api/whatsapp/webhook?token=${encodeURIComponent(secret)}&acc=${account.id}`;
  let ok = true;
  try {
    await setWebhook(apiKey, url);
  } catch (err) {
    ok = false;
    // Nur die Fehlermeldung von 360dialog, nie Key oder URL (enthält das Token).
    console.error("[whatsapp connect]", err instanceof Error ? err.message.slice(0, 200) : "Fehler");
  }
  await prisma.whatsAppAccount.update({ where: { id: account.id }, data: { status: ok ? "connected" : "pending" } });
  return ok ? { ok: true, accountId: account.id } : { ok: false, accountId: account.id, reason: "webhook" };
}
