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

export type CustomerProvision = { typ: VermittlerTyp; rates: ProvisionOverrides; custom: ProvisionOverrides; hasCustom: boolean };

export async function loadCustomerProvision(customerId: string | null | undefined): Promise<CustomerProvision> {
  const c = customerId
    ? await prisma.customer.findUnique({ where: { id: customerId }, select: { vermittlerTyp: true, provisionRates: true } }).catch(() => null)
    : null;
  const typ = asVermittlerTyp(c?.vermittlerTyp);
  const custom = parseCustomRates(c?.provisionRates).rates;
  return { typ, rates: effectiveRates(typ, custom), custom, hasCustom: Object.keys(custom).length > 0 };
}

/** Produkte, die der Kunde von uns bekommt (aus Lead-Quellen und Bezügen); leer = unbekannt. */
export async function customerProductKeys(customerId: string): Promise<ProductKey[]> {
  const [sources, subs] = await Promise.all([
    prisma.lead.findMany({ where: { customerId }, distinct: ["source"], select: { source: true }, take: 50 }),
    prisma.leadSubscription.findMany({ where: { customerId }, select: { productKey: true } }),
  ]);
  const keys = new Set<ProductKey>();
  for (const s of [...sources.map((x) => x.source), ...subs.map((x) => x.productKey)]) {
    const k = productKeyFor(s);
    if (k) keys.add(k);
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
    data: { vermittlerTyp: input.typ, provisionRates: Object.keys(rates).length ? (rates as Prisma.InputJsonValue) : Prisma.DbNull },
  });
  return { ok: true, changed: Object.keys(rates) };
}
