// Auswertung der Weiche eigener Funnel gegen Perspective (Ole, 21.11.2026; Admin › Liefern › A/B-Tests, Karte
// „Eigener Funnel gegen Perspective“). Besucher je Seite aus den Zuteilungen der Weiche (FunnelEreignis „weiche“),
// Leads: eigene = FunnelBesuch mit Lead, Perspective = PoolLead via „perspective“, jeweils ab Start der Weiche, ohne
// HvK. Ergebnis beim Abnehmer wie in lib/funnel/auswertung.ts (bewerteLead). Entscheidung nach der A/B-Regel
// (lib/whatsapp/ab-test.ts decideAbWinner: p < 0,01, je Seite mind. 10 Treffer und Nicht-Treffer, Mindestmenge).

import { prisma } from "@/lib/prisma";
import { bewerteLead, ladeLeadFakten } from "@/lib/funnel/server";
import { decideAbWinner, type AbDecision } from "@/lib/whatsapp/ab-test";

/** Start der Weiche auf start.pkv-tarife.com (nach den Testaufrufen). */
export const WEICHE_SEIT = new Date("2026-11-21T19:15:00Z");
/** Testaufrufe (utm_source) zählen nicht. */
export const WEICHE_TEST_QUELLEN = ["test", "deploycheck", "weichecheck"];
/** Mindestbesucher je Seite für eine Entscheidung */
export const WEICHE_MIN_BESUCHER = 300;

export type WeichenSeite = { besucher: number; leads: number; geliefert: number; erreicht: number; termin: number; abschluss: number };
export type WeichenAuswertung = { seit: Date; hvk: number; eigen: WeichenSeite; perspective: WeichenSeite; entscheidung: AbDecision };

const leer = (): WeichenSeite => ({ besucher: 0, leads: 0, geliefert: 0, erreicht: 0, termin: 0, abschluss: 0 });

async function ergebnisse(poolLeadIds: string[], s: WeichenSeite) {
  s.leads = poolLeadIds.length;
  const fakten = await ladeLeadFakten(poolLeadIds);
  for (const id of poolLeadIds) {
    const e = fakten.get(id);
    if (!e) continue;
    const w = bewerteLead(e.fakten);
    if (w.geliefert) s.geliefert++;
    if (w.erreicht) s.erreicht++;
    if (w.termin) s.termin++;
    if (w.abschluss) s.abschluss++;
  }
}

export async function weichenAuswertung(funnel = "pkv-beitrag", seit = WEICHE_SEIT): Promise<WeichenAuswertung> {
  const zuteilung = await prisma.funnelEreignis.groupBy({
    by: ["variante"],
    where: { funnel, schritt: "weiche", art: "zuteilung", createdAt: { gte: seit }, OR: [{ grund: null }, { grund: { notIn: WEICHE_TEST_QUELLEN } }] },
    _count: { _all: true },
  });
  const anzahl = (v: string) => zuteilung.find((z) => z.variante === v)?._count._all ?? 0;
  const eigen = leer();
  const perspective = leer();
  eigen.besucher = anzahl("eigen");
  perspective.besucher = anzahl("perspective");

  const eigeneBesuche = await prisma.funnelBesuch.findMany({ where: { funnel, leadAt: { gte: seit }, poolLeadId: { not: null } }, select: { poolLeadId: true } });
  await ergebnisse(eigeneBesuche.map((b) => b.poolLeadId!), eigen);

  const pers = await prisma.poolLead.findMany({ where: { via: "perspective", createdAt: { gte: seit } }, select: { id: true, adInfo: true } });
  const ohneHvk = pers.filter((p) => !/hvk/i.test(JSON.stringify(p.adInfo ?? {})));
  await ergebnisse(ohneHvk.map((p) => p.id), perspective);

  // a = Perspective (bisher), b = eigener Funnel; Treffer = erreicht je Besucher
  const entscheidung = decideAbWinner(
    { a: { sent: perspective.besucher, replied: perspective.erreicht }, b: { sent: eigen.besucher, replied: eigen.erreicht } },
    { min: WEICHE_MIN_BESUCHER },
  );
  return { seit, hvk: anzahl("hvk"), eigen, perspective, entscheidung };
}
