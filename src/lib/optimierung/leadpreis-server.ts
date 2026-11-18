// Leadpreis 7 Tage je Werbekonto laden (Admin v2, Paket A6): AdSpendDaily der letzten 7 Tage, Ziel wie im
// Optimierungslauf (zielLeadpreis). Je Anfrage einmal (React cache): Werbekonten-Seite und Mein-Tag-Punkte teilen sich das.

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { HeuteItem } from "@/lib/admin-heute";
import { zielLeadpreis } from "./server";
import { LEADPREIS_TAGE, UEBER_ZIEL_EUR, leadpreis, teuersteZuerst, zeilenFuerKonto, type Leadpreis } from "./leadpreis";

export type KontoLeadpreis = { id: string; label: string; kind: "kunde" | "pool"; active: boolean; leadpreis: Leadpreis; zielLabel: string };

const DAY = 86_400_000;
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

/** Alle Werbekonten mit Leadpreis 7 Tage, teuerste zuerst. `datenDa` = AdSpendDaily hat überhaupt Zeilen im Zeitraum. */
export const ladeLeadpreise = cache(async (): Promise<{ konten: KontoLeadpreis[]; datenDa: boolean }> => {
  const now = new Date();
  const [konten, zeilen, produktVon] = await Promise.all([
    prisma.optimizationAccount.findMany({ orderBy: [{ active: "desc" }, { label: "asc" }] }),
    prisma.adSpendDaily.findMany({
      where: { date: { gte: new Date(now.getTime() - LEADPREIS_TAGE * DAY) } },
      select: { customerId: true, adAccountId: true, campaignName: true, spend: true, metaLeads: true },
    }),
    import("@/lib/product-catalog").then((m) => m.loadProductMatcher()).catch(() => () => null),
  ]);
  const kosten = zeilen.map((z) => ({ ...z, spend: Number(z.spend) }));
  const rows = await Promise.all(
    konten.map(async (k) => {
      const kind = k.kind === "pool" ? ("pool" as const) : ("kunde" as const);
      const ziel = await zielLeadpreis(k.id, now).catch(() => ({ cpl: null, label: "Schnitt des Kontos" }));
      const eigene = zeilenFuerKonto({ kind, customerId: k.customerId, adAccountId: k.adAccountId, stichwort: k.campaignKeyword, produkt: k.poolProduct }, kosten, produktVon);
      return { id: k.id, label: k.label, kind, active: k.active, leadpreis: leadpreis(eigene, ziel.cpl), zielLabel: ziel.label };
    }),
  );
  return { konten: teuersteZuerst(rows), datenDa: kosten.length > 0 };
});

/** Punkte für Mein Tag / Liefern: aktive Konten mehr als 5 € über Ziel. */
export async function leadpreisPunkte(): Promise<HeuteItem[]> {
  const { konten } = await ladeLeadpreise();
  return konten
    .filter((k) => k.active && k.leadpreis.zuTeuer)
    .map((k) => ({
      key: `leadpreis:${k.id}`,
      area: "Leads" as const,
      tone: "warn" as const,
      icon: "alert" as const,
      title: `${k.label}: Leadpreis ${eur(k.leadpreis.cpl!)}`,
      detail: `${LEADPREIS_TAGE} Tage, ${eur(k.leadpreis.ueberZiel!)} über Ziel (${eur(k.leadpreis.ziel!)}) · ${k.leadpreis.leads} Leads`,
      action: { label: "Ansehen", href: `/admin/neu/leads/werbekonten/${k.id}` },
      later: { label: "Morgen", days: 1 },
    }));
}

export { UEBER_ZIEL_EUR };
