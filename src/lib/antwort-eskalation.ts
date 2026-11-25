// Eskalation offene Lead-Antwort (Ole, 25.11.2026, Auswertung Kunde Lohmann: Menschen im Team reagieren im Mittel erst
// nach 12 Stunden, wenn ein Lead zurückschreibt). Schreibt ein Lead im WhatsApp-Chat und wartet auf einen Menschen
// (Conversation.needsAttention: Assistent pausiert bzw. übernommener Chat, Frage an den Berater, Assistent stumm), geht
// nach 30 Minuten ohne menschliche Antwort EIN Push an den Inhaber: „Anna wartet seit 30 Minuten auf Antwort“, Link
// direkt in den Chat. Der zuständige Berater bekam schon beim Eingang den Push „… braucht dich“ (lib/whatsapp/attention.ts).
// Ist der Inhaber selbst zuständig (bzw. gibt es keinen Zuständigen), ist dieser Push seine einmalige Erinnerung.
//   - Höchstens einmal je Wartephase: Phase beginnt mit attentionSince (gesetzt, wenn needsAttention neu gesetzt wird),
//     erledigt, sobald attentionEscalatedAt >= attentionSince.
//   - Nur werktags und samstags 8 bis 20 Uhr (Berlin, ohne bundesweite Feiertage); außerhalb ab 8 Uhr nachgeholt.
//   - Nur, wenn der Lead selbst zuletzt geschrieben hat (keine menschliche Antwort danach) und die Wartephase höchstens
//     4 Tage alt ist (kein Schwall alter Chats).
//   - Nicht an reine Pay-per-Lead-Kunden (ohne Software), nicht an ruhende bzw. archivierte Kunden, nur Lead-Chats.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { NUR_PPL_WHERE } from "@/lib/customer-package";
import { kontaktFromLead } from "@/lib/lead-anrede";
import { kontaktParts } from "@/lib/ansprache";
import { leadLabel } from "@/lib/showup";
import { isWorkdayKey } from "@/lib/vertrieb/spaeter";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";

const TZ = "Europe/Berlin";
/** Wartezeit bis zum Push an den Inhaber. */
export const ESKALATION_NACH_MS = 30 * 60_000;
/** Ältere Wartephasen nicht mehr anstoßen. */
const RUECKBLICK_MS = 4 * 86_400_000;
/** Nachricht des Leads zählt zur Phase, wenn sie höchstens so lange vor deren Beginn kam (Übergabe des Assistenten). */
const VORLAUF_MS = 10 * 60_000;
/** Menschliche Antworten (App bzw. WhatsApp-Business-App), nicht Assistent oder System. */
const MENSCH = ["agent", "app"];

const berlinTag = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const berlinStunde = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(d));

/** Jetzt Zeit für den Push? Montag bis Samstag (ohne bundesweite Feiertage unter der Woche), 8 bis 20 Uhr Berlin. Rein. */
export function eskalationsZeit(now: Date): boolean {
  const h = berlinStunde(now);
  if (h < 8 || h >= 20) return false;
  const tag = berlinTag(now);
  const wd = new Date(`${tag}T12:00:00Z`).getUTCDay();
  if (wd === 0) return false;
  return wd === 6 || isWorkdayKey(tag);
}

/** „30 Minuten“, „2 Stunden“, „1 Stunde“ (rein): Wartezeit für den Titel, nachgeholte Pushs nennen die echte Dauer. */
export function wartezeitText(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 60) return "30 Minuten";
  const std = Math.floor(min / 60);
  if (std < 48) return std === 1 ? "1 Stunde" : `${std} Stunden`;
  return `${Math.floor(std / 24)} Tagen`;
}

/** Text des Pushs (Vermittler-Oberfläche, Sie-Form, ohne Gedankenstriche). Rein. */
export function eskalationsText(o: { conversationId: string; vorname: string | null; label: string; wartetMs: number }) {
  const wer = o.vorname?.trim() || o.label;
  return {
    title: `${wer} wartet seit ${wartezeitText(o.wartetMs)} auf Antwort`,
    body: "Im Chat hat noch niemand geantwortet. Jetzt antworten?",
    url: `/buyer/chats?c=${o.conversationId}`,
    tag: `antwort-eskalation:${o.conversationId}`,
  };
}

type PushPayload = { title: string; body: string; url: string; tag: string };
/** Push an einzelne Logins; Rückgabe: an so viele Geräte zugestellt. */
export type EskalationsPushFn = (userIds: string[], p: PushPayload) => Promise<number>;

const standardPush: EskalationsPushFn = async (userIds, p) => {
  const { sendToUser } = await import("@/lib/push");
  let sent = 0;
  for (const id of userIds) sent += (await sendToUser(id, p)).sent;
  return sent;
};

export type EskalationsErgebnis = { due: boolean; chats: number; pushes: number };

/** Cron (alle 5 Minuten): wartende Lead-Chats ohne menschliche Antwort seit 30 Minuten, je Wartephase ein Push. */
export async function runAntwortEskalation(now = new Date(), deps: { push?: EskalationsPushFn } = {}): Promise<EskalationsErgebnis> {
  if (!eskalationsZeit(now)) return { due: false, chats: 0, pushes: 0 };
  const push = deps.push ?? standardPush;
  const grenze = new Date(now.getTime() - ESKALATION_NACH_MS);
  const ab = new Date(now.getTime() - RUECKBLICK_MS);
  // Beginn der Wartephase: attentionSince, bei Altfällen (vor dieser Spalte gesetzt) attentionAt
  const where: Prisma.ConversationWhereInput = {
    needsAttention: true,
    status: "open",
    optedOutAt: null,
    leadId: { not: null },
    customerId: { not: SUPPORT_CUSTOMER_ID },
    OR: [
      { attentionSince: { lte: grenze, gte: ab } },
      { attentionSince: null, attentionAt: { lte: grenze, gte: ab } },
    ],
    customer: { archived: false, dormantSince: null, dataDeletedAt: null, NOT: NUR_PPL_WHERE },
    lead: { is: { erasedAt: null } },
  };
  const chats = await prisma.conversation.findMany({
    where,
    select: {
      id: true,
      customerId: true,
      attentionSince: true,
      attentionAt: true,
      attentionEscalatedAt: true,
      lead: { select: { name: true, formData: true, contactOverrides: true } },
    },
    orderBy: { attentionAt: "asc" },
    take: 200,
  });
  const res: EskalationsErgebnis = { due: true, chats: 0, pushes: 0 };
  const inhaberJeKunde = new Map<string, string[]>();
  for (const c of chats) {
    const seit = c.attentionSince ?? c.attentionAt;
    if (!seit) continue;
    if (c.attentionEscalatedAt && c.attentionEscalatedAt.getTime() >= seit.getTime()) continue;
    // Der Lead hat selbst geschrieben, und seitdem hat kein Mensch geantwortet
    const [letzteVomLead, letzteMensch] = await Promise.all([
      prisma.message.findFirst({ where: { conversationId: c.id, direction: "inbound" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      prisma.message.findFirst({ where: { conversationId: c.id, direction: "outbound", sentBy: { in: MENSCH } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);
    if (!letzteVomLead || letzteVomLead.createdAt.getTime() < seit.getTime() - VORLAUF_MS) continue;
    if (letzteMensch && letzteMensch.createdAt.getTime() >= letzteVomLead.createdAt.getTime()) continue;
    // Beanspruchen: nie zweimal je Phase, auch bei parallelen Läufen
    const claimed = await prisma.conversation.updateMany({
      where: { id: c.id, needsAttention: true, OR: [{ attentionEscalatedAt: null }, { attentionEscalatedAt: { lt: seit } }] },
      data: { attentionEscalatedAt: now },
    });
    if (!claimed.count) continue;
    res.chats++;
    let an = inhaberJeKunde.get(c.customerId);
    if (!an) {
      an = (await prisma.user.findMany({ where: { customerId: c.customerId, role: "BUYER", teamRole: { not: "advisor" } }, select: { id: true } })).map((u) => u.id);
      inhaberJeKunde.set(c.customerId, an);
    }
    if (!an.length) continue;
    const kontakt = kontaktFromLead(c.lead);
    const p = eskalationsText({ conversationId: c.id, vorname: kontaktParts(kontakt).first || null, label: leadLabel(kontakt, c.lead?.name), wartetMs: now.getTime() - seit.getTime() });
    await push(an, p).catch((e) => {
      console.error("[antwort-eskalation push]", e instanceof Error ? e.message : e);
      return 0;
    });
    res.pushes++;
  }
  return res;
}
