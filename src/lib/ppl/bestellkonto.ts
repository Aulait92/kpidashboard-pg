// Bestellkonto (Ole, 22.11.2026): Ein Hauptkunde (z. B. Nico Yagci) bestellt und bezahlt die Wochenbestellungen für
// seine Vertriebspartner (z. B. Dennis Müller). Der Partner bekommt die Leads in seinem eigenen Konto, bestellt aber
// nicht selbst. Zahlungsart, Rechnung und Registerprüfung (Umsatzsteuer) hängen am Hauptkunden (Customer.bestelltUeberId).

import { prisma } from "@/lib/prisma";

export const BESTELLKONTO_PFAD = "/bestellung";

/** Felder, die für Abbuchung und Umsatzsteuer am Zahler gebraucht werden. */
export const ZAHLER_SELECT = {
  id: true,
  name: true,
  stripeCustomerId: true,
  vermittlerRegisterNr: true,
  vermittlerRegisterStatus: true,
  vermittlerGeprueftAt: true,
} as const;

type MitZahler<T> = T & { bestelltUeber?: T | null };

/** Wer zahlt die Bestellungen dieses Kontos? Der Hauptkunde, sonst das Konto selbst. */
export function zahlerVon<T>(kunde: MitZahler<T>): T {
  return kunde.bestelltUeber ?? kunde;
}

/**
 * Darf das angemeldete Konto für diesen Bezug bestellen? Ja für den Hauptkunden des Partners und für das Konto
 * selbst, solange es nicht über einen Hauptkunden bestellt.
 */
export function darfBestellen(kontoId: string, bezug: { customerId: string; customer: { bestelltUeberId: string | null } }): boolean {
  if (bezug.customer.bestelltUeberId) return bezug.customer.bestelltUeberId === kontoId;
  return bezug.customerId === kontoId;
}

/**
 * Reines Bestellkonto: hat Vertriebspartner, aber keinen eigenen aktiven Bezug. Solche Logins landen auf /bestellung
 * statt im Vermittlerbereich (der für sie leer wäre).
 */
export async function istReinesBestellkonto(customerId: string): Promise<boolean> {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { _count: { select: { bestellPartner: true, leadSubscriptions: { where: { active: true } } } } },
  });
  return !!c && c._count.bestellPartner > 0 && c._count.leadSubscriptions === 0;
}

/** Aktive App-Bezüge der Vertriebspartner eines Hauptkunden, nach Partnername. */
export async function partnerBezuege(hauptkundeId: string) {
  return prisma.leadSubscription.findMany({
    where: { active: true, delivery: { in: ["app", "app_pdf"] }, customer: { bestelltUeberId: hauptkundeId, dormantSince: null } },
    include: { customer: { select: { id: true, name: true } } },
    orderBy: [{ customer: { name: "asc" } }, { createdAt: "asc" }],
  });
}
