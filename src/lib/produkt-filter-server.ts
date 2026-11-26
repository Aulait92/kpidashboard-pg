import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { gewaehlteGruppe, produktGruppen, type ProduktGruppe } from "@/lib/produkt-filter";

/**
 * Produktfilter der Kontakte (lib/produkt-filter.ts): Gruppen aus allen sichtbaren Leads (scope = leadScope, Berater nur
 * ihre eigenen), unabhängig vom Zeitraum. Unter zwei Gruppen gibt es keinen Filter (optionen leer, aktiv null).
 */
export async function ladeProduktFilter(
  scope: Prisma.LeadWhereInput,
  wunsch: string | null | undefined,
): Promise<{ optionen: ProduktGruppe[]; aktiv: ProduktGruppe | null }> {
  const quellen = await prisma.lead.groupBy({ by: ["source"], where: { AND: [scope, { source: { not: null } }] }, _count: { _all: true } });
  const gruppen = produktGruppen(quellen.map((q) => ({ source: q.source, anzahl: q._count._all })));
  if (gruppen.length < 2) return { optionen: [], aktiv: null };
  return { optionen: gruppen, aktiv: gewaehlteGruppe(gruppen, wunsch) };
}
