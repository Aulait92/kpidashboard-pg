import { prisma } from "@/lib/prisma";

/**
 * Produkt im Pay-per-Lead-Eingang per Name oder Slug (z. B. „pkv-tarifoptimierung“ wie im bisherigen Funnel).
 * productKey = Produktname (wie LeadSubscription.productKey), slug für die Feld-Übersetzung (lib/ppl/perspective.ts).
 * Unbekannt: beides wie übergeben. Genutzt von /api/leads/pool und den eigenen Funnels (lib/funnel).
 */
export async function resolvePplProduct(raw: string): Promise<{ productKey: string; slug: string }> {
  const known = await prisma.product.findFirst({
    where: { OR: [{ name: { equals: raw, mode: "insensitive" } }, { slug: { equals: raw, mode: "insensitive" } }] },
    select: { name: true, slug: true },
  });
  return { productKey: known?.name ?? raw, slug: known?.slug ?? raw };
}
