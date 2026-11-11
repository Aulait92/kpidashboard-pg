// Kontingent im Bestandskunden-Modul: Das Modul enthält die WhatsApp-Gebühren für
// bis zu PRICE_LIST.bestandIncludedMessages Kampagnen-Nachrichten je
// Kalendermonat (Berliner Zeit). Darüber werden neue Kampagnen vor dem Start
// gesperrt und der Versand laufender Kampagnen wartet bis zum nächsten Monat.
// Der Admin kann das Kontingent je Kunde erhöhen (Customer.bestandMessageQuota).
// Normale Lead-Kommunikation (Erstkontakt, Erinnerungen, Nachfassen) zählt nicht.

import { prisma } from "@/lib/prisma";
import { PRICE_LIST } from "@/lib/offer-pricing";

export const QUOTA_REACHED = "Monatskontingent erreicht – mehr auf Anfrage.";

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

export type BestandQuota = { limit: number; used: number; remaining: number };

export function quotaLimit(custom: number | null | undefined): number {
  return custom != null && custom >= 0 ? custom : PRICE_LIST.bestandIncludedMessages;
}

/** Verbrauch im laufenden Monat: verschickte Kampagnen-Nachrichten. */
export async function bestandQuota(customerId: string, now = new Date()): Promise<BestandQuota> {
  const [c, used] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { bestandMessageQuota: true } }),
    prisma.campaignRecipient.count({ where: { campaign: { customerId }, sentAt: { gte: berlinMonthStart(now) } } }),
  ]);
  const limit = quotaLimit(c?.bestandMessageQuota);
  return { limit, used, remaining: Math.max(0, limit - used) };
}
