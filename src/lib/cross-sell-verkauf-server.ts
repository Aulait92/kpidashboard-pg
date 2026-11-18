// Laden für „Weiteres Produkt per Klick anbieten“ (Regeln: lib/cross-sell-verkauf.ts).

import { prisma } from "@/lib/prisma";
import { leadScope, type TeamCtx } from "@/lib/team";
import { crossSellOffenWhere } from "@/lib/cross-sell-offen";
import { crossSellVerkaufAn, type CrossSellVerkauf } from "@/lib/cross-sell-verkauf";
import { loadErtragData } from "@/lib/ertrag";
import { contractProvision } from "@/lib/provision";

/** Eigener Schnitt: Provision im ersten Jahr je laufendem Vertrag (null ohne Verträge mit Wert). */
export async function provisionJeVertrag(customerId: string): Promise<number | null> {
  const data = await loadErtragData(customerId).catch(() => null);
  if (!data) return null;
  const werte = data.contracts.filter((c) => c.status !== "storniert").map((c) => contractProvision(c, data.rates).firstYear).filter((v) => v > 0);
  return werte.length ? Math.round(werte.reduce((s, v) => s + v, 0) / werte.length) : null;
}

/**
 * Leiste/Knopf/Blatt für diesen Vermittler, null = nichts zeigen (Modul nicht für alle verfügbar, kein Inhaber, keine
 * Kunden ohne weiteres Produkt). `nurNichtGebucht`: Heute zeigt den Zusatz-Knopf nur, solange das Modul nicht gebucht ist.
 */
export async function ladeCrossSellVerkauf(ctx: TeamCtx, opts: { now?: Date; anzahl?: number; nurNichtGebucht?: boolean } = {}): Promise<CrossSellVerkauf | null> {
  if (!crossSellVerkaufAn(ctx.teamRole)) return null;
  const now = opts.now ?? new Date();
  const [c, anzahl] = await Promise.all([
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { existingCustomersEnabled: true } }),
    opts.anzahl ?? prisma.lead.count({ where: { ...leadScope(ctx), ...crossSellOffenWhere(now) } }),
  ]);
  if (!c || anzahl <= 0) return null;
  const gebucht = c.existingCustomersEnabled;
  if (gebucht && opts.nurNichtGebucht) return null;
  return { gebucht, anzahl, provision: gebucht ? null : await provisionJeVertrag(ctx.customerId) };
}
