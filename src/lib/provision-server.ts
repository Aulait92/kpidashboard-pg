// Serverseitig: wirksame Provisionssätze eines Kunden laden und speichern
// (Vermittlertyp + eigene Sätze aus „Meine Provisionen“). Ohne Kunde: Vertreter-Standard.
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  asVermittlerTyp,
  effectiveRates,
  parseCustomRates,
  productKeyFor,
  type ProductKey,
  type ProvisionOverrides,
  type VermittlerTyp,
} from "@/lib/provision";

export type CustomerProvision = {
  typ: VermittlerTyp;
  rates: ProvisionOverrides;
  custom: ProvisionOverrides;
  hasCustom: boolean;
  /** Einrichtungsschritt erledigt: eigene Sätze oder Standard bestätigt. */
  confirmed: boolean;
};

export async function loadCustomerProvision(customerId: string | null | undefined): Promise<CustomerProvision> {
  const c = customerId
    ? await prisma.customer.findUnique({ where: { id: customerId }, select: { vermittlerTyp: true, provisionRates: true, provisionCheckedAt: true } }).catch(() => null)
    : null;
  const typ = asVermittlerTyp(c?.vermittlerTyp);
  const custom = parseCustomRates(c?.provisionRates).rates;
  const hasCustom = Object.keys(custom).length > 0;
  return { typ, rates: effectiveRates(typ, custom), custom, hasCustom, confirmed: hasCustom || !!c?.provisionCheckedAt };
}

/**
 * Produkte, die der Kunde bei uns gewählt hat: gebuchte Produkte (CustomerProduct),
 * Pay-per-Lead-Bezüge und die Produkte aus seinem angenommenen Angebot. Nur wenn
 * davon nichts bekannt ist, zählen die Quellen seiner Leads. Leer = noch nichts gewählt.
 */
export async function customerProductKeys(customerId: string): Promise<ProductKey[]> {
  const [booked, subs, onboarding] = await Promise.all([
    prisma.customerProduct.findMany({ where: { customerId }, select: { product: { select: { name: true, displayName: true } } } }),
    prisma.leadSubscription.findMany({ where: { customerId }, select: { productKey: true } }),
    prisma.onboarding.findUnique({ where: { customerId }, select: { offerId: true } }),
  ]);
  const offer = onboarding?.offerId
    ? await prisma.offer.findUnique({ where: { id: onboarding.offerId }, select: { products: true } })
    : null;
  const offerNames = Array.isArray(offer?.products)
    ? (offer.products as unknown[]).map((p) => (p && typeof p === "object" && "name" in p ? String((p as { name: unknown }).name) : "")).filter(Boolean)
    : [];
  const chosen = [
    ...booked.flatMap((b) => [b.product.name, b.product.displayName ?? ""]),
    ...subs.map((x) => x.productKey),
    ...offerNames,
  ];
  const keys = new Set<ProductKey>();
  for (const s of chosen) {
    const k = productKeyFor(s);
    if (k) keys.add(k);
  }
  if (keys.size === 0) {
    const sources = await prisma.lead.findMany({ where: { customerId }, distinct: ["source"], select: { source: true }, take: 50 });
    for (const x of sources) {
      const k = productKeyFor(x.source);
      if (k) keys.add(k);
    }
  }
  return [...keys];
}

/** Darf dieser Zugang die Provisionssätze ändern? (nur Inhaber, nicht in der Vorschau) */
export function canEditProvision(ctx: { preview: boolean; teamRole: "owner" | "advisor" } | null): boolean {
  return !!ctx && !ctx.preview && ctx.teamRole === "owner";
}

/**
 * Vermittlertyp und eigene Sätze speichern. `rates` enthält nur Produkte mit
 * eigenem Wert (Prozente als Anteil, 0,55 = 55 %); leer = Standard.
 */
export async function saveCustomerProvision(
  customerId: string,
  input: { typ: unknown; rates: unknown },
): Promise<{ ok: true; changed: string[] } | { ok: false; error: string }> {
  if (input.typ !== "vertreter" && input.typ !== "makler") return { ok: false, error: "Bitte Vertreter oder Makler wählen." };
  const { rates, errors } = parseCustomRates(input.rates);
  if (errors.length) return { ok: false, error: errors.join(" · ") };
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      vermittlerTyp: input.typ,
      provisionRates: Object.keys(rates).length ? (rates as Prisma.InputJsonValue) : Prisma.DbNull,
      provisionCheckedAt: new Date(),
    },
  });
  return { ok: true, changed: Object.keys(rates) };
}
