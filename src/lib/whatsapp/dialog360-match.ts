// „Verbindung prüfen“ (Ole, 15.11.2026): Kommt der Rücksprung von 360dialog nicht an (Fenster geschlossen,
// Tarifwahl, Partnerwechsel), findet die App die Nummer des Kunden über die Partner-API und verbindet sie
// nachträglich: zuerst über partner_payload (= unsere Kunden-ID, seit 15.11. im Verbinden-Link), sonst über
// die Kontakt-E-Mail des 360dialog-Kunden (= Login-E-Mail des Inhabers). Im Admin lassen sich freie Nummern
// außerdem von Hand zuordnen. Der Partner-Webhook ruft autoMatchChannels() bei Kanal-Ereignissen auf.

import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { listPartnerChannels, partnerConfig, type PartnerChannel } from "@/lib/whatsapp/dialog360-partner";
import { finishChannel, onConnected, type SelfConnectResult } from "@/lib/whatsapp/self-connect";

export type CheckResult =
  | { status: "connected"; phone: string | null }
  | { status: "pending"; phone: string | null; activation: boolean }
  | { status: "not_found" }
  | { status: "ambiguous"; count: number }
  | { status: "error"; reason: string };

/** Nummern, die schon einem anderen Kunden gehören, fallen weg. */
async function assignedChannelIds(exceptCustomerId?: string): Promise<Set<string>> {
  const rows = await prisma.whatsAppAccount.findMany({
    where: { dialog360ChannelId: { not: null }, ...(exceptCustomerId ? { customerId: { not: exceptCustomerId } } : {}) },
    select: { dialog360ChannelId: true },
  });
  return new Set(rows.map((r) => r.dialog360ChannelId!));
}

/** Passende Nummern für einen Kunden (reine Funktion, für Tests). */
export function matchChannelsForCustomer(channels: PartnerChannel[], customer: { id: string; emails: string[] }, taken: Set<string>): PartnerChannel[] {
  const free = channels.filter((c) => !taken.has(c.id) && c.availability !== "cancelled" && c.availability !== "inactive");
  const byPayload = free.filter((c) => c.partnerPayload === customer.id);
  if (byPayload.length) return byPayload;
  const emails = new Set(customer.emails.map((e) => e.toLowerCase()));
  return free.filter((c) => !c.partnerPayload && c.contactEmail && emails.has(c.contactEmail));
}

async function connect(customerId: string, ch: PartnerChannel, via: string, actor: { id?: string; role: string }): Promise<CheckResult> {
  await prisma.whatsAppAccount.upsert({
    where: { customerId },
    create: { customerId, provider: "360dialog", status: "pending", dialog360ChannelId: ch.id, dialog360ClientId: ch.clientId },
    update: { dialog360ChannelId: ch.id, ...(ch.clientId ? { dialog360ClientId: ch.clientId } : {}), status: "pending" },
  });
  const res: SelfConnectResult = await finishChannel(customerId, ch.id, ch.clientId);
  await audit("whatsapp.self_connect", { entity: "Customer", entityId: customerId, customerId, details: { result: res.status, channelId: ch.id, clientId: ch.clientId, via, ...(res.reason ? { reason: res.reason } : {}) }, actor });
  if (res.status === "connected") {
    await onConnected(customerId, res.phone ?? ch.phone);
    return { status: "connected", phone: res.phone ?? ch.phone };
  }
  // Noch in Einrichtung bzw. Freischaltung: der WhatsApp-Cron holt den Key nach (bis 3 Tage)
  if (res.status === "pending") return { status: "pending", phone: ch.phone, activation: ch.availability === "pending_activation" };
  // Fehler beim Key: offen lassen und später erneut versuchen (z. B. vor der Freischaltung)
  await prisma.whatsAppAccount.update({ where: { customerId }, data: { status: "pending" } }).catch(() => {});
  return ch.availability === "pending_activation" ? { status: "pending", phone: ch.phone, activation: true } : { status: "error", reason: res.reason ?? "unbekannter Fehler" };
}

/** Kunde (oder Admin) klickt „Verbindung prüfen“. */
export async function checkConnection(customerId: string, actor: { id?: string; role: string } = { role: "kunde" }): Promise<CheckResult> {
  const cfg = partnerConfig();
  if (!cfg) return { status: "error", reason: "Partner-Zugang nicht eingerichtet" };
  const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true, apiKeyEnc: true, phoneNumber: true } });
  if (acc?.status === "connected" && acc.apiKeyEnc) return { status: "connected", phone: acc.phoneNumber };
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, users: { where: { role: "BUYER" }, select: { email: true } } } });
  if (!customer) return { status: "error", reason: "Konto nicht gefunden" };
  let channels: PartnerChannel[];
  try {
    channels = await listPartnerChannels(cfg);
  } catch (err) {
    return { status: "error", reason: err instanceof Error ? err.message : String(err) };
  }
  const matches = matchChannelsForCustomer(channels, { id: customer.id, emails: customer.users.map((u) => u.email).filter(Boolean) as string[] }, await assignedChannelIds(customerId));
  if (!matches.length) return { status: "not_found" };
  if (matches.length > 1) return { status: "ambiguous", count: matches.length };
  return connect(customerId, matches[0], "check", actor);
}

/** Admin: Nummer von Hand einem Kunden zuordnen (aus der Liste freier Nummern). */
export async function assignChannel(customerId: string, channelId: string, adminId: string | null): Promise<CheckResult> {
  const cfg = partnerConfig();
  if (!cfg) return { status: "error", reason: "Partner-Zugang nicht eingerichtet" };
  const taken = await assignedChannelIds(customerId);
  if (taken.has(channelId)) return { status: "error", reason: "Diese Nummer ist schon einem anderen Kunden zugeordnet." };
  const ch = (await listPartnerChannels(cfg)).find((c) => c.id === channelId);
  if (!ch) return { status: "error", reason: "Nummer bei 360dialog nicht gefunden." };
  return connect(customerId, ch, "admin", { id: adminId ?? undefined, role: "ADMIN" });
}

/** Admin: freie Nummern (keinem Kunden zugeordnet), neueste zuerst. */
export async function freePartnerChannels(): Promise<PartnerChannel[]> {
  const cfg = partnerConfig();
  if (!cfg) return [];
  const [channels, taken] = await Promise.all([listPartnerChannels(cfg), assignedChannelIds()]);
  return channels.filter((c) => !taken.has(c.id));
}

/** Partner-Webhook: neue Nummern mit unserer Kunden-ID (partner_payload) automatisch zuordnen. */
export async function autoMatchChannels(): Promise<{ connected: number }> {
  const cfg = partnerConfig();
  if (!cfg) return { connected: 0 };
  const [channels, taken] = await Promise.all([listPartnerChannels(cfg, 50), assignedChannelIds()]);
  let connected = 0;
  for (const ch of channels) {
    if (!ch.partnerPayload || taken.has(ch.id)) continue;
    const c = await prisma.customer.findUnique({ where: { id: ch.partnerPayload }, select: { id: true, whatsAppAccount: { select: { status: true, apiKeyEnc: true } } } });
    if (!c || (c.whatsAppAccount?.status === "connected" && c.whatsAppAccount.apiKeyEnc)) continue;
    const r = await connect(c.id, ch, "webhook", { role: "system" });
    if (r.status === "connected") connected++;
  }
  return { connected };
}

export type ResetResult = { status: "reset" | "none" | "connected" };

/**
 * Halb fertige Verbindung zurücksetzen (Einladung bzw. Nummer in Einrichtung), Ole 15.11.2026.
 * Für Admin und Inhaber. Verbundene Konten bleiben unberührt. Das 360dialog-Konto selbst bleibt bestehen,
 * „WhatsApp verbinden“ führt danach zur Anmeldung bei 360dialog.
 */
export async function resetUnfinishedConnection(customerId: string, actor: { id?: string; role: string }): Promise<ResetResult> {
  const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { id: true, status: true, apiKeyEnc: true, dialog360ClientId: true, dialog360ChannelId: true } });
  if (!acc) return { status: "none" };
  if (acc.status === "connected" || acc.apiKeyEnc) return { status: "connected" };
  await prisma.whatsAppAccount.delete({ where: { id: acc.id } });
  await audit("whatsapp.reset", { entity: "Customer", entityId: customerId, customerId, details: { status: acc.status, clientId: acc.dialog360ClientId, channelId: acc.dialog360ChannelId }, actor });
  return { status: "reset" };
}
