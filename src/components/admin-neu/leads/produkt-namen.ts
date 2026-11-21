import { prisma } from "@/lib/prisma";
import { displayProduct } from "@/lib/products";

// Liefern: Produktname statt Schlüssel (UX-Umbau 20.11.2026, „Berufsunfähigkeit“ statt „bu“). Bezüge, Pool-Leads und
// Zuordnungen speichern den Schlüssel (productKey = Product.name, teils Kurzform); angezeigt wird Product.displayName,
// sonst der Name. Kurzformen ohne Produkt-Eintrag über eine kleine Liste, sonst der Schlüssel selbst.

const KURZ: Record<string, string> = {
  bu: "Berufsunfähigkeit",
  haftpflicht: "Privathaftpflicht",
  phv: "Privathaftpflicht",
  pkv: "Private Krankenversicherung",
  kiwu: "Kinderwunsch",
  pflege: "Pflege",
};

export type ProduktName = (key: string | null | undefined) => string;

/** Lädt die Anzeigenamen für die übergebenen Schlüssel und gibt eine Nachschlage-Funktion zurück. */
export async function ladeProduktNamen(keys: (string | null | undefined)[]): Promise<ProduktName> {
  const liste = [...new Set(keys.filter((k): k is string => !!k))];
  const rows = liste.length
    ? await prisma.product.findMany({ where: { OR: [{ name: { in: liste } }, { slug: { in: liste } }] }, select: { name: true, slug: true, displayName: true } })
    : [];
  const map = new Map<string, string>();
  for (const r of rows) {
    const anzeige = r.displayName?.trim() || r.name;
    map.set(r.name, anzeige);
    if (r.slug) map.set(r.slug, anzeige);
  }
  return (key) => {
    if (!key) return displayProduct(key);
    return map.get(key) ?? KURZ[key.trim().toLowerCase()] ?? displayProduct(key);
  };
}
