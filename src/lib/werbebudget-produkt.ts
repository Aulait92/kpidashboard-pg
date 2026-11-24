// Werbebudget je Produkt (Ole, 24.11.2026: „das werbebudget kannst du aus den jeweiligen kampagnen auslesen. die sind
// immer korrekt benannt“). Produktfilter auf „Wachstum“: Die Ausgaben stammen aus den Kampagnen des Produkts
// (AdSpendDaily, Kosten je Anzeige und Tag mit Kampagnenname), nicht mehr anteilig nach Leads.
// Zuordnung je Kampagne: zuerst über die Leads, die sie gebracht hat (Lead.adCampaignName → häufigstes Lead.source),
// sonst über den Namen (dieselbe Produkterkennung wie bei den Leads: Kfz, Privatschutz, Tier, Zahn, PKV, oder der
// Produktname steht im Kampagnennamen). Der Katalog-Matcher taugt dafür nicht („Kfz Wechsel“ → PKV „Wechsel“). Kampagnen ohne
// Zuordnung werden anteilig nach Leads verteilt. Ergebnis ist der Anteil am Werbebudget, angewendet auf die
// Kontosumme (CustomerAdSpend), damit sich die Produkte zur Gesamtsumme addieren.

import { prisma } from "@/lib/prisma";
import { outreachProdukt } from "@/lib/whatsapp/erstanschreiben";
import { istKfzProdukt } from "@/lib/whatsapp/produkt-fragen";

const norm = (t: string) => t.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "");
/** Produktfamilie eines Kampagnen- oder Produktnamens (wie die Erkennung der Leads), sonst null. */
function familie(t: string): string | null {
  if (istKfzProdukt(t)) return "kfz";
  return outreachProdukt(t)?.purpose ?? null;
}

/**
 * Produkt (aus produkte) zu einem Kampagnennamen oder null. Eindeutige Familie bzw. der Produktname steht im
 * Kampagnennamen; passen mehrere Produkte, gewinnt das, dessen Name im Kampagnennamen steht. Rein, testbar.
 */
export function produktAusKampagne(name: string, produkte: readonly string[]): string | null {
  const n = norm(name);
  const f = familie(name);
  const passend = produkte.filter((p) => (f !== null && familie(p) === f) || (norm(p).length >= 3 && n.includes(norm(p))));
  if (passend.length === 1) return passend[0];
  const genau = passend.filter((p) => n.includes(norm(p)));
  return genau.length === 1 ? genau[0] : null;
}

export type KampagnenAusgabe = { name: string; spend: number };

/**
 * Anteil des Produkts am Werbebudget (0 bis 1) oder null, wenn es keine Kampagnenkosten gibt (dann bleibt es beim
 * Anteil nach Leads). Rein, testbar.
 *   produktVon: Produkt (Lead.source) einer Kampagne oder null (nicht zuzuordnen)
 *   leadAnteil: Anteil des Produkts an den bezahlten Leads (für nicht zugeordnete Kampagnen)
 */
export function werbeAnteil(kampagnen: KampagnenAusgabe[], produktVon: (name: string) => string | null, produkt: string, leadAnteil: number): number | null {
  const gesamt = kampagnen.reduce((s, k) => s + k.spend, 0);
  if (gesamt <= 0) return null;
  let eigen = 0;
  let offen = 0;
  for (const k of kampagnen) {
    const p = produktVon(k.name);
    if (p === null) offen += k.spend;
    else if (p === produkt) eigen += k.spend;
  }
  return (eigen + offen * leadAnteil) / gesamt;
}

/** Kampagnenkosten des Kunden im Zeitraum und die Zuordnung Kampagne → Produkt (Lead.source). */
export async function ladeWerbeAnteil(customerId: string, range: { from: Date; to: Date }, produkt: string, leadAnteil: number): Promise<number | null> {
  const zeilen = await prisma.adSpendDaily.groupBy({
    by: ["campaignName"],
    where: { customerId, date: { gte: range.from, lte: range.to } },
    _sum: { spend: true },
  });
  const kampagnen = zeilen.map((z) => ({ name: z.campaignName ?? "", spend: Number(z._sum.spend ?? 0) }));
  if (!kampagnen.some((k) => k.spend > 0)) return null;
  const namen = kampagnen.map((k) => k.name).filter(Boolean);
  const [leads, quellen] = await Promise.all([
    namen.length
      ? prisma.lead.groupBy({ by: ["adCampaignName", "source"], where: { customerId, adCampaignName: { in: namen }, source: { not: null } }, _count: { _all: true } })
      : Promise.resolve([] as { adCampaignName: string | null; source: string | null; _count: { _all: number } }[]),
    prisma.lead.groupBy({ by: ["source"], where: { customerId, isTest: false, source: { not: null } } }),
  ]);
  const ausLeads = new Map<string, { source: string; n: number }>();
  for (const l of leads) {
    if (!l.adCampaignName || !l.source) continue;
    const bisher = ausLeads.get(l.adCampaignName);
    if (!bisher || l._count._all > bisher.n) ausLeads.set(l.adCampaignName, { source: l.source, n: l._count._all });
  }
  const produkte = quellen.map((q) => q.source).filter((x): x is string => !!x);
  const produktVon = (name: string): string | null => ausLeads.get(name)?.source ?? (name ? produktAusKampagne(name, produkte) : null);
  return werbeAnteil(kampagnen, produktVon, produkt, leadAnteil);
}
