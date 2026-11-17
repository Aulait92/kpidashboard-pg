// Startdatum je Kunde für die Anzeige-Daten (Ole, 17.11.2026): Rückfüllung der Anzeige am Lead und Meta-Kosten je
// Anzeige nur ab diesem Tag, ältere Leads und Kosten werden nicht angefasst.
//
// Startdatum = frühester gesetzter Startpunkt der Zusammenarbeit (Tagesbeginn Berliner Zeit):
//   - Onboarding.liveAt        Go-live in der App (Einrichtung abgeschlossen)
//   - Onboarding.startDate     im Angebot gewählter Vertragsstart
//   - Customer.retainerStart   Beginn Betreuung/Software (aus Airtable bzw. Abrechnung)
//   - CustomerProduct.startDate Start eines gebuchten Produkts (Lead-Bezug)
// Ohne jeden dieser Werte gibt es kein Startdatum: Der Kunde wird übersprungen (Diagnose zeigt ihn als „ohne Start“).

import { prisma } from "@/lib/prisma";
import { berlinDayStart } from "@/lib/seats";

export type StartQuelle = "live" | "vertragsstart" | "retainer" | "produkt";
export type KundenStart = { start: Date; quelle: StartQuelle };

export type StartEingaben = {
  liveAt?: Date | null;
  onboardingStart?: Date | null;
  retainerStart?: Date | null;
  productStarts?: (Date | null)[];
};

/** Frühester Startpunkt (Tagesbeginn Berlin) und woher er kommt; null = kein Startdatum bekannt. */
export function kundenStart(e: StartEingaben): KundenStart | null {
  const kandidaten: { at: Date; quelle: StartQuelle }[] = [];
  if (e.liveAt) kandidaten.push({ at: e.liveAt, quelle: "live" });
  if (e.onboardingStart) kandidaten.push({ at: e.onboardingStart, quelle: "vertragsstart" });
  if (e.retainerStart) kandidaten.push({ at: e.retainerStart, quelle: "retainer" });
  for (const p of e.productStarts ?? []) if (p) kandidaten.push({ at: p, quelle: "produkt" });
  const valid = kandidaten.filter((k) => Number.isFinite(k.at.getTime()));
  if (!valid.length) return null;
  const first = valid.reduce((a, b) => (b.at.getTime() < a.at.getTime() ? b : a));
  return { start: berlinDayStart(first.at), quelle: first.quelle };
}

export type KundeMitStart = {
  id: string;
  name: string;
  metaAdAccountId: string | null;
  dormant: boolean;
  start: KundenStart | null;
};

/** Alle echten Kunden (ohne Testkunden und interne) mit Startdatum. */
export async function ladeKundenStarts(where: { ids?: string[] } = {}): Promise<KundeMitStart[]> {
  const rows = await prisma.customer.findMany({
    where: { isTest: false, plan: { not: "internal" }, ...(where.ids ? { id: { in: where.ids } } : {}) },
    select: {
      id: true,
      name: true,
      metaAdAccountId: true,
      dormantSince: true,
      retainerStart: true,
      onboarding: { select: { liveAt: true, startDate: true } },
      customerProducts: { select: { startDate: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    metaAdAccountId: c.metaAdAccountId,
    dormant: !!c.dormantSince,
    start: kundenStart({
      liveAt: c.onboarding?.liveAt,
      onboardingStart: c.onboarding?.startDate,
      retainerStart: c.retainerStart,
      productStarts: c.customerProducts.map((p) => p.startDate),
    }),
  }));
}
