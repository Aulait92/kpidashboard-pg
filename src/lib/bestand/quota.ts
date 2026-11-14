// Kontingent im Bestandskunden-Modul: Das Modul enthält die WhatsApp-Gebühren für
// bis zu PRICE_LIST.bestandIncludedMessages Kampagnen-Nachrichten je
// Kalendermonat (Berliner Zeit). Dazu kommen Zusatzpakete (lib/bestand/packs.ts,
// Tabelle BestandMessagePack), die 3 Monate gelten. Verbrauch: zuerst das
// Monatskontingent, dann das älteste Paket (CampaignRecipient.packId merkt sich,
// woraus eine Nachricht bezahlt ist). Ist alles aufgebraucht, werden neue Kampagnen
// vor dem Start gesperrt und laufende pausieren mit Hinweis (pausedReason „kontingent“).
// Der Admin kann das Monatskontingent je Kunde erhöhen (Customer.bestandMessageQuota).
// Normale Lead-Kommunikation (Erstkontakt, Erinnerungen, Nachfassen) zählt nicht.

import { prisma } from "@/lib/prisma";
import { PRICE_LIST } from "@/lib/offer-pricing";

export const QUOTA_REACHED = "Kontingent für diesen Monat aufgebraucht. Mit einem Zusatzpaket geht es sofort weiter.";

/** Pausengrund laufender Kampagnen, wenn das Kontingent aufgebraucht ist. */
export const QUOTA_PAUSE = "kontingent";

/** Beginn des Kalendermonats in Berliner Zeit. */
export function berlinMonthStart(now = new Date()): Date {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).formatToParts(now);
  const y = Number(p.find((x) => x.type === "year")!.value);
  const m = Number(p.find((x) => x.type === "month")!.value);
  const utcMidnight = Date.UTC(y, m - 1, 1);
  const berlinHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(new Date(utcMidnight)),
  );
  return new Date(utcMidnight - berlinHour * 3_600_000);
}

export type QuotaPack = {
  id: string;
  messages: number;
  used: number;
  remaining: number;
  amount: number;
  source: string;
  purchasedAt: Date;
  expiresAt: Date;
};

export type BestandQuota = {
  /** Monatskontingent (inklusive) */
  limit: number;
  /** davon verbraucht diesen Monat */
  used: number;
  /** Rest Monatskontingent */
  includedRemaining: number;
  /** gültige Pakete, ältestes zuerst (auch aufgebrauchte, für die Anzeige) */
  packs: QuotaPack[];
  /** Rest aus gültigen Paketen */
  packRemaining: number;
  /** Rest insgesamt (Monat + Pakete) */
  remaining: number;
  /** diesen Monat verschickte Kampagnen-Nachrichten (Monat + Pakete) */
  sentThisMonth: number;
  /** weniger als 10 % des Monatsumfangs übrig (oder aufgebraucht) */
  low: boolean;
};

export function quotaLimit(custom: number | null | undefined): number {
  return custom != null && custom >= 0 ? custom : PRICE_LIST.bestandIncludedMessages;
}

/** Hinweis „Noch X Nachrichten“ ab unter 10 % Rest des Monatsumfangs (Rest + diesen Monat verschickt). */
export function isLow(remaining: number, sentThisMonth: number): boolean {
  if (remaining <= 0) return true;
  return remaining < 0.1 * (remaining + sentThisMonth);
}

/** Verbrauch im laufenden Monat und gültige Pakete. */
export async function bestandQuota(customerId: string, now = new Date()): Promise<BestandQuota> {
  const monthStart = berlinMonthStart(now);
  const [c, used, sentThisMonth, rows] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { bestandMessageQuota: true } }),
    prisma.campaignRecipient.count({ where: { campaign: { customerId }, sentAt: { gte: monthStart }, packId: null } }),
    prisma.campaignRecipient.count({ where: { campaign: { customerId }, sentAt: { gte: monthStart } } }),
    prisma.bestandMessagePack.findMany({
      where: { customerId, purchasedAt: { lte: now }, expiresAt: { gt: now } },
      orderBy: [{ purchasedAt: "asc" }, { id: "asc" }],
      include: { _count: { select: { recipients: { where: { sentAt: { not: null } } } } } },
    }),
  ]);
  const limit = quotaLimit(c?.bestandMessageQuota);
  const packs: QuotaPack[] = rows.map((p) => ({
    id: p.id,
    messages: p.messages,
    used: p._count.recipients,
    remaining: Math.max(0, p.messages - p._count.recipients),
    amount: Number(p.amount),
    source: p.source,
    purchasedAt: p.purchasedAt,
    expiresAt: p.expiresAt,
  }));
  const includedRemaining = Math.max(0, limit - used);
  const packRemaining = packs.reduce((s, p) => s + p.remaining, 0);
  const remaining = includedRemaining + packRemaining;
  return { limit, used, includedRemaining, packs, packRemaining, remaining, sentThisMonth, low: isLow(remaining, sentThisMonth) };
}

/**
 * Woraus wird die nächste Nachricht bezahlt? Erst das Monatskontingent (null), dann das älteste
 * Paket mit Rest (dessen ID). undefined = nichts mehr übrig.
 */
export function nextFunding(q: Pick<BestandQuota, "includedRemaining" | "packs">): string | null | undefined {
  if (q.includedRemaining > 0) return null;
  return q.packs.find((p) => p.remaining > 0)?.id;
}

/** Eine verschickte Nachricht im Zwischenstand verbuchen (für mehrere Nachrichten in einem Lauf). */
export function consume(q: BestandQuota, funding: string | null): void {
  if (funding == null) {
    q.includedRemaining = Math.max(0, q.includedRemaining - 1);
    q.used++;
  } else {
    const p = q.packs.find((x) => x.id === funding);
    if (p) {
      p.remaining = Math.max(0, p.remaining - 1);
      p.used++;
    }
    q.packRemaining = Math.max(0, q.packRemaining - 1);
  }
  q.remaining = Math.max(0, q.remaining - 1);
  q.sentThisMonth++;
  q.low = isLow(q.remaining, q.sentThisMonth);
}
