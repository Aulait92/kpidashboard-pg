// Hat ein Kunde Garantien? Nur mit angenommenem Garantie-Angebot (lib/garantien.ts offerHasGuarantee). Seit
// 22.11.2026 verkauft Ole ohne Garantie: Neue Kunden sehen keine Garantie-Hinweise mehr (Budget, Produkte, Pause).
// Bewusst leicht (nur Prisma), damit Budget- und Abwesenheits-Logik nicht die ganze Garantie-Prüfung laden.

import { prisma } from "@/lib/prisma";
import { offerHasGuarantee } from "@/lib/garantien";

export async function kundeHatGarantien(customerId: string): Promise<boolean> {
  const ob = await prisma.onboarding.findFirst({ where: { customerId, offerId: { not: null } }, select: { offerId: true } }).catch(() => null);
  if (!ob?.offerId) return false;
  const offer = await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { status: true, createdAt: true, garantieStichtag: true, products: true } }).catch(() => null);
  return offerHasGuarantee(offer);
}
