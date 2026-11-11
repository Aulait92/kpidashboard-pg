// Kunde verbindet seine WhatsApp-Nummer selbst (360dialog Integrated Onboarding):
// Redirect auswerten, API-Key per Partner-API erzeugen, speichern, Webhook setzen.
// Ist der Channel noch in Einrichtung (409), holt der WhatsApp-Cron den Key nach.
// Bei Fehlern: Admin-Aufgabe + Push, der Kunde sieht „Wir melden uns“.

import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { sendToAdmins } from "@/lib/push";
import { saveWhatsAppKey } from "@/lib/whatsapp/connect";
import { channelInfo, createChannelApiKey, partnerConfig } from "@/lib/whatsapp/dialog360-partner";
import { submitTemplatesForCustomer } from "@/lib/whatsapp/template-submit";

export type SelfConnectStatus = "connected" | "pending" | "error";
export type SelfConnectResult = { status: SelfConnectStatus; phone?: string | null; reason?: string };

/** Wie lange der Cron den Key für einen Channel nachzuholen versucht. */
const RETRY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

async function customerName(customerId: string): Promise<string> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } });
  return c?.name ?? "Kunde";
}

/** Aufgabe für uns (am verknüpften Vertriebskontakt, sonst ohne Kontakt) + Push. */
async function adminFollowUp(customerId: string, problem: string): Promise<void> {
  const name = await customerName(customerId);
  const contact = await prisma.salesContact.findFirst({ where: { customerId }, select: { id: true } }).catch(() => null);
  await prisma.salesTask
    .create({
      data: {
        title: `WhatsApp-Verbindung prüfen: ${name}`,
        note: `Selbst verbinden über 360dialog hat nicht geklappt: ${problem}. Im 360dialog Partner Hub den Channel prüfen und den API-Key notfalls in der Kundenakte → WhatsApp-Assistent von Hand eintragen.`,
        contactId: contact?.id ?? null,
        type: "SONSTIGES",
        dueAt: new Date(),
      },
    })
    .catch((err) => reportError(err, "d360-admin-task"));
  await sendToAdmins({ title: `WhatsApp-Verbindung prüfen: ${name}`, body: problem.slice(0, 120), url: "/admin/whatsapp/settings", tag: `d360:${customerId}` }).catch(() => {});
}

/** Key für den Channel holen und speichern. Gemeinsam für Redirect und Cron. */
async function finishChannel(customerId: string, channelId: string, clientId: string | null): Promise<SelfConnectResult> {
  const cfg = partnerConfig();
  if (!cfg) return { status: "error", reason: "Partner-Zugang nicht eingerichtet" };
  const key = await createChannelApiKey(cfg, channelId);
  if (key.kind === "retry") return { status: "pending" };
  if (key.kind === "error") return { status: "error", reason: `360dialog ${key.status || ""} ${key.message}`.trim() };
  const info = await channelInfo(cfg, channelId);
  const saved = await saveWhatsAppKey(customerId, key.apiKey, { phone: info.phone, dialog360ChannelId: channelId, dialog360ClientId: clientId });
  if (!saved.ok) return { status: "error", reason: saved.reason === "noconfig" ? "APP_URL/WHATSAPP_WEBHOOK_SECRET fehlt" : "Webhook ließ sich nicht setzen" };
  if (info.name) await prisma.whatsAppAccount.update({ where: { customerId }, data: { displayName: info.name } }).catch(() => {});
  return { status: "connected", phone: info.phone };
}

async function onConnected(customerId: string, phone: string | null | undefined): Promise<void> {
  const name = await customerName(customerId);
  // Vorlagen sofort bei Meta einreichen (Freigabe dauert Minuten bis Stunden).
  await submitTemplatesForCustomer(customerId).catch((err) => reportError(err, "templates-after-connect"));
  await sendToAdmins({
    title: `WhatsApp verbunden: ${name}`,
    body: phone
      ? `Nummer +${phone.replace(/^\+/, "")} – Vorlagen sind eingereicht, danach Assistent einschalten.`
      : "Vorlagen sind eingereicht, danach Assistent einschalten.",
    url: "/admin/whatsapp/settings",
    tag: `d360:${customerId}`,
  }).catch(() => {});
}

/** Redirect von 360dialog verarbeiten (state ist schon geprüft). */
export async function completeSelfConnect(input: { customerId: string; userId: string | null; clientId: string | null; channels: string[] }): Promise<SelfConnectResult> {
  const { customerId, clientId } = input;
  const channelId = input.channels[0];
  const actor = { id: input.userId ?? undefined, role: "kunde" as const };
  if (!channelId) {
    await audit("whatsapp.self_connect", { entity: "Customer", entityId: customerId, customerId, details: { result: "no_channel", clientId }, actor });
    await adminFollowUp(customerId, "360dialog hat keine Nummer zurückgemeldet (Freigabe nicht erteilt oder abgebrochen)");
    return { status: "error", reason: "no_channel" };
  }
  // Channel merken (ohne Key) – so kann der Cron später nachholen.
  await prisma.whatsAppAccount.upsert({
    where: { customerId },
    create: { customerId, provider: "360dialog", status: "pending", dialog360ChannelId: channelId, dialog360ClientId: clientId },
    update: { dialog360ChannelId: channelId, ...(clientId ? { dialog360ClientId: clientId } : {}) },
  });
  const res = await finishChannel(customerId, channelId, clientId);
  await audit("whatsapp.self_connect", {
    entity: "Customer",
    entityId: customerId,
    customerId,
    details: { result: res.status, channelId, clientId, ...(res.reason ? { reason: res.reason } : {}) },
    actor,
  });
  if (res.status === "connected") await onConnected(customerId, res.phone);
  if (res.status === "error") {
    await prisma.whatsAppAccount.update({ where: { customerId }, data: { status: "error" } }).catch(() => {});
    await adminFollowUp(customerId, res.reason ?? "unbekannter Fehler");
  }
  return res;
}

/** Im WhatsApp-Cron: Keys für Channels nachholen, die beim Redirect noch eingerichtet wurden. */
export async function retryPendingSelfConnect(now = new Date(), limit = 10): Promise<{ tried: number; connected: number; failed: number }> {
  if (!partnerConfig()) return { tried: 0, connected: 0, failed: 0 };
  const pending = await prisma.whatsAppAccount.findMany({
    where: {
      dialog360ChannelId: { not: null },
      apiKeyEnc: null,
      status: "pending",
      // 360dialog erlaubt höchstens 1 Anfrage je 30 s und Channel.
      updatedAt: { lt: new Date(now.getTime() - 30_000), gt: new Date(now.getTime() - RETRY_WINDOW_MS) },
    },
    select: { id: true, customerId: true, dialog360ChannelId: true, dialog360ClientId: true },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  let connected = 0;
  let failed = 0;
  for (const acc of pending) {
    const res = await finishChannel(acc.customerId, acc.dialog360ChannelId!, acc.dialog360ClientId);
    if (res.status === "connected") {
      connected++;
      await audit("whatsapp.self_connect", { entity: "Customer", entityId: acc.customerId, customerId: acc.customerId, details: { result: "connected", channelId: acc.dialog360ChannelId, via: "cron" }, actor: { role: "system" } });
      await onConnected(acc.customerId, res.phone);
    } else if (res.status === "error") {
      failed++;
      await prisma.whatsAppAccount.update({ where: { id: acc.id }, data: { status: "error" } });
      await adminFollowUp(acc.customerId, res.reason ?? "unbekannter Fehler");
    } else {
      // Noch in Einrichtung: Zeitstempel auffrischen, damit die 30-s-Grenze greift.
      await prisma.whatsAppAccount.update({ where: { id: acc.id }, data: { status: "pending" } });
    }
  }
  return { tried: pending.length, connected, failed };
}
