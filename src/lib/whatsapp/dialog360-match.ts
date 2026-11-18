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

// ─── Verbindung reparieren (Admin v2 A5, Ole 18.11.2026) ─────────────────────────────────────

export type RepairSchritt = { ok: boolean; text: string };
export type RepairResult = { ok: boolean; schritte: RepairSchritt[] };

type RepairDeps = {
  check: typeof checkConnection;
  webhook: (accountId: string) => Promise<boolean>;
  neuerKey: (customerId: string, channelId: string, clientId: string | null) => Promise<SelfConnectResult>;
  vorlagen: (customerId: string) => Promise<{ ok: boolean; submitted: string[]; rejected: string[]; error?: string }>;
  partner: () => boolean;
};

/** Ein Satz zum Ergebnis von „Nummer suchen und verbinden“ (checkConnection). */
export function checkText(r: CheckResult): RepairSchritt {
  if (r.status === "connected") return { ok: true, text: `Nummer verbunden${r.phone ? `: +${r.phone.replace(/^\+/, "")}` : ""}.` };
  if (r.status === "pending")
    return { ok: true, text: r.activation ? "Nummer gefunden, sie wartet auf Freischaltung bei 360dialog. Der Cron holt den Key danach." : "Nummer gefunden und zugeordnet, sie wird noch eingerichtet. Der Cron holt den Key." };
  if (r.status === "not_found") return { ok: false, text: "Keine passende Nummer bei 360dialog gefunden (Kunden-ID bzw. Login-E-Mail). Unten von Hand zuordnen." };
  if (r.status === "ambiguous") return { ok: false, text: `${r.count} passende Nummern gefunden. Bitte unten von Hand zuordnen.` };
  return { ok: false, text: `Prüfen fehlgeschlagen: ${r.reason}` };
}

/**
 * „Verbindung reparieren“ (Admin v2 A5): ein Knopf in der Kundenakte › WhatsApp, der der Reihe nach alles neu prüft und,
 * wo möglich, selbst behebt, über dieselben Wege wie das Verbinden:
 *   1. Ohne gespeicherten Key: Nummer über die Partner-API suchen und verbinden (wie bisher „Verbindung prüfen“).
 *   2. Mit Key: Webhook neu setzen (kommen keine Nachrichten an, liegt es meist daran). Klappt das nicht und die Nummer ist
 *      bekannt, einen neuen Key über die Partner-API holen und damit verbinden.
 *   3. Verbunden: Vorlagen abgleichen, fehlende neu einreichen.
 * Jeder Schritt ist abgesichert, das Ergebnis nennt je Schritt einen Satz. Protokoll: whatsapp.repair.
 */
export async function repairConnection(customerId: string, actor: { id?: string; role: string }, deps: Partial<RepairDeps> = {}): Promise<RepairResult> {
  const d: RepairDeps = {
    check: deps.check ?? checkConnection,
    webhook: deps.webhook ?? (async (id) => (await import("@/lib/whatsapp/connect")).retryAccountWebhook(id)),
    neuerKey: deps.neuerKey ?? finishChannel,
    vorlagen: deps.vorlagen ?? (async (id) => (await import("@/lib/whatsapp/template-submit")).submitTemplatesForCustomer(id)),
    partner: deps.partner ?? (() => partnerConfig() !== null),
  };
  const schritte: RepairSchritt[] = [];
  const fehler = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 160);
  const konto = () =>
    prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { id: true, status: true, apiKeyEnc: true, dialog360ChannelId: true, dialog360ClientId: true } });
  let acc = await konto();

  if (!acc?.apiKeyEnc) {
    if (!d.partner()) schritte.push({ ok: false, text: "Keine Nummer verbunden und kein 360dialog-Partner-Zugang eingerichtet. Key von Hand eintragen." });
    else {
      try {
        schritte.push(checkText(await d.check(customerId, actor)));
      } catch (e) {
        schritte.push({ ok: false, text: `Prüfen fehlgeschlagen: ${fehler(e)}` });
      }
    }
  } else {
    let webhookOk = false;
    try {
      webhookOk = await d.webhook(acc.id);
    } catch (e) {
      schritte.push({ ok: false, text: `Webhook: ${fehler(e)}` });
    }
    if (webhookOk) schritte.push({ ok: true, text: "Webhook neu gesetzt: Eingehende Nachrichten kommen wieder an." });
    else if (acc.dialog360ChannelId && d.partner()) {
      try {
        const r = await d.neuerKey(customerId, acc.dialog360ChannelId, acc.dialog360ClientId);
        schritte.push(
          r.status === "connected"
            ? { ok: true, text: "Webhook ging nicht, darum neuen Key bei 360dialog geholt und verbunden." }
            : r.status === "pending"
              ? { ok: false, text: "Die Nummer wird bei Meta noch freigeschaltet. Der Cron versucht es weiter." }
              : { ok: false, text: `Neuer Key fehlgeschlagen: ${r.reason ?? "unbekannter Fehler"}` },
        );
      } catch (e) {
        schritte.push({ ok: false, text: `Neuer Key fehlgeschlagen: ${fehler(e)}` });
      }
    } else schritte.push({ ok: false, text: "Webhook ließ sich nicht setzen. Key prüfen und von Hand neu eintragen." });
  }
  acc = await konto();

  const verbunden = acc?.status === "connected" && !!acc.apiKeyEnc;
  if (verbunden) {
    try {
      const v = await d.vorlagen(customerId);
      if (!v.ok) schritte.push({ ok: false, text: `Vorlagen: ${v.error ?? "Abgleich fehlgeschlagen"}` });
      else if (v.submitted.length) schritte.push({ ok: true, text: `Vorlagen abgeglichen: ${v.submitted.length} neu eingereicht.` });
      else schritte.push({ ok: true, text: `Vorlagen abgeglichen: Es fehlt keine${v.rejected.length ? `, ${v.rejected.length} abgelehnt (unten ansehen)` : ""}.` });
    } catch (e) {
      schritte.push({ ok: false, text: `Vorlagen: ${fehler(e)}` });
    }
  }
  const ok = verbunden && schritte.every((s) => s.ok);
  await audit("whatsapp.repair", { entity: "Customer", entityId: customerId, customerId, details: { ok, verbunden, schritte: schritte.map((s) => `${s.ok ? "ok" : "fehler"}: ${s.text}`.slice(0, 200)) }, actor }).catch(() => {});
  return { ok, schritte };
}
