// Server-seitiger Produkt-Katalog. Liest die Product-Stammtabelle (gespiegelt
// aus Airtable) und stellt daraus zwei Dinge bereit:
//
//   1. loadProductMatcher() — klassifiziert einen Kampagnen-Namen auf einen
//      Produkt-Key. Erst die drei Legacy-Sparten über die reine Keyword-Logik
//      (classifyCampaignProduct), dann generisch über Produktname/Slug aus der
//      DB. So bekommt JEDES neue Produkt (Sterbegeld, Kindersparpläne, …) seine
//      Cost-Attribution, ohne dass der Channel-Sync angefasst werden muss.
//
//   2. listActiveProducts() — die aktiven Produkte als {key,label}-Liste für
//      die UI (Produkt-Filter-Dropdowns). Fällt auf die drei Legacy-Produkte
//      zurück, wenn die Tabelle leer/nicht lesbar ist.
//
// Bewusst getrennt von products.ts, weil dort KEIN Prisma-Import stehen darf
// (products.ts wird auch in Client-Komponenten gebündelt).

import { prisma } from "@/lib/prisma";
import {
  canonicalProductKey,
  classifyCampaignProduct,
  displayProduct,
  isLegacyProduct,
  PRODUCTS,
} from "@/lib/products";

export type ProductMatcher = (campaignName: string) => string | null;

// Mindestlänge eines Needles, damit ein Produktname/Slug nicht versehentlich
// als Substring in fast jedem Kampagnen-Namen matcht (z. B. zu kurze Slugs).
const MIN_NEEDLE_LEN = 3;

export async function loadProductMatcher(): Promise<ProductMatcher> {
  let extra: { key: string; needles: string[] }[] = [];
  try {
    const products = await prisma.product.findMany({
      where: { active: true },
      select: { name: true, slug: true, keywords: true },
    });
    extra = products
      .map((p) => {
        const key = canonicalProductKey(p.name);
        // Needles = Name + Slug + kommagetrennte Keyword-Aliase.
        const aliasList = (p.keywords ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        const needles = [p.name, p.slug, ...aliasList]
          .filter(
            (s): s is string => !!s && s.trim().length >= MIN_NEEDLE_LEN,
          )
          .map((s) => s.toLowerCase());
        return { key, needles };
      })
      // Legacy-Sparten laufen über die Keyword-Logik (oben), nicht über den
      // generischen Name-Match — sonst doppelte / widersprüchliche Treffer.
      .filter((p) => !isLegacyProduct(p.key) && p.needles.length > 0);
  } catch {
    // Produkte-Tabelle (noch) nicht da → nur Legacy-Matching.
    extra = [];
  }

  return (campaignName: string): string | null => {
    const legacy = classifyCampaignProduct(campaignName);
    if (legacy) return legacy;
    const n = campaignName.toLowerCase();
    for (const p of extra) {
      if (p.needles.some((needle) => n.includes(needle))) return p.key;
    }
    return null;
  };
}

export type ProductOption = { key: string; label: string };

// Aktive Produkte für UI-Filter. Reihenfolge: sortOrder asc (null ans Ende),
// dann Name. Kollabiert mehrere Airtable-Produkte mit gleichem kanonischem
// Key (z. B. "PKV-Wechsel" + "PKV-Tarifoptimierung" → "Wechsel") auf einen
// Eintrag. Fällt auf die drei Legacy-Produkte zurück, wenn nichts da ist.
export async function listActiveProducts(): Promise<ProductOption[]> {
  try {
    const products = await prisma.product.findMany({
      where: { active: true },
      select: { name: true, displayName: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const seen = new Set<string>();
    const options: ProductOption[] = [];
    for (const p of products) {
      const key = canonicalProductKey(p.name);
      if (seen.has(key)) continue;
      seen.add(key);
      // Legacy-Keys über displayProduct() (z. B. "Wechsel" → "Tarifoptimierung"),
      // neue Produkte über ihren displayName/Namen.
      const label = isLegacyProduct(key)
        ? displayProduct(key)
        : p.displayName ?? p.name;
      options.push({ key, label });
    }
    if (options.length > 0) return options;
  } catch {
    // Fällt unten auf Legacy zurück.
  }
  return PRODUCTS.map((p) => ({ key: p, label: displayProduct(p) }));
}
