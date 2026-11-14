// Kosten & Ertrag aus Kundensicht (Ole, 14.11.2026), eine Rechnung für alle Stellen: /buyer/zahlen,
// Hochrechnung, Team-Ansicht, Monatsbericht, Empfehlungs-Modul und Admin-Kundenerfolg.
//
// Gewinn = Abschlussprovision (Makler: Courtage 1. Jahr) − Lead-Kosten − Agenturkosten im Zeitraum,
// ehrlich ohne künftige Bestandsprovision. Provision je Vertrag mit der Rate seiner Sparte
// (lib/provision.contractProvision), Verträge aus lib/vertraege, Herkunft aus lib/lead-herkunft.
// summarizeErtrag ist rein (getestet), computeErtrag lädt die Daten.

import { prisma } from "@/lib/prisma";
import { agencyCostsForRange, loadAgencyCostConfig, type AgencyCostConfig, type AgencyCosts } from "@/lib/agenturkosten";
import { computeCustomerSpend, loadRetainerConfig } from "@/lib/customer-spend";
import { LEAD_ORIGINS, type LeadOrigin } from "@/lib/lead-herkunft";
import {
  bestandGrowth,
  bestandInYears,
  contractProvision,
  STORNO_PRO_JAHR,
  type ProvisionOverrides,
  type VermittlerTyp,
} from "@/lib/provision";
import { loadCustomerProvision } from "@/lib/provision-server";
import { loadCustomerContracts, type CustomerContract } from "@/lib/vertraege";

export type Range = { from: Date; to: Date };

export type OriginSum = { amount: number; contracts: number; leads: number };

export type ProvisionSummary = {
  /** Basis für Gewinn: Abschluss + (Makler) Bestand 1. Jahr. */
  firstYear: number;
  /** Nur einmalige Abschlussprovision. */
  abschluss: number;
  contracts: number;
  /** Leads mit Abschluss, deren Verträge im Zeitraum zählen. */
  leads: number;
  byOrigin: Record<LeadOrigin, OriginSum>;
  /** Weitere Verträge (nicht der erste Abschluss eines Leads). */
  crossSell: { contracts: number; amount: number };
  /** Bestandsprovision pro Jahr aus Verträgen dieses Zeitraums. */
  trailPerYear: number;
};

export type BestandSummary = {
  /** Laufend pro Jahr aus allen bisherigen Verträgen. */
  perYear: number;
  contracts: number;
  /** Vertreter: ab dem 2. Jahr; Makler: ab sofort. */
  fromYear2: boolean;
  /** Summe der nächsten 5 Jahre mit Storno. */
  inYears: number;
  storno: number;
  /** „So wächst dein Bestand“: je Jahr bei gleichem Tempo. */
  growth: { year: number; existing: number; added: number; total: number }[];
  /** Verträge pro Monat (Tempo der letzten 3 Monate). */
  perMonth: number;
};

export type ErtragPeriod = {
  provision: ProvisionSummary;
  leadCosts: number;
  leadCostHint: string | null;
  agency: AgencyCosts;
  /** Lead-Kosten + Agenturkosten. */
  costs: number;
  gewinn: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const inRange = (d: Date, r: Range) => d >= r.from && d <= r.to;

/** Provision der Verträge im Zeitraum (rein). */
export function summarizeProvision(contracts: CustomerContract[], rates: ProvisionOverrides | undefined, range: Range): ProvisionSummary {
  const byOrigin = Object.fromEntries(LEAD_ORIGINS.map((o) => [o.key, { amount: 0, contracts: 0, leads: 0 }])) as Record<LeadOrigin, OriginSum>;
  const leadsOf = new Map<LeadOrigin, Set<string>>();
  const leads = new Set<string>();
  let firstYear = 0;
  let abschluss = 0;
  let trail = 0;
  let n = 0;
  const cross = { contracts: 0, amount: 0 };
  for (const c of contracts) {
    if (!inRange(c.periodAt, range)) continue;
    const p = contractProvision(c, rates);
    firstYear += p.firstYear;
    abschluss += p.abschluss;
    trail += p.trailPerYear;
    n++;
    leads.add(c.leadId);
    const o = byOrigin[c.origin];
    o.amount += p.firstYear;
    o.contracts++;
    const set = leadsOf.get(c.origin) ?? new Set<string>();
    set.add(c.leadId);
    leadsOf.set(c.origin, set);
    if (!c.primary) {
      cross.contracts++;
      cross.amount += p.firstYear;
    }
  }
  for (const [k, set] of leadsOf) byOrigin[k].leads = set.size;
  for (const k of Object.keys(byOrigin) as LeadOrigin[]) byOrigin[k].amount = r2(byOrigin[k].amount);
  return { firstYear: r2(firstYear), abschluss: r2(abschluss), contracts: n, leads: leads.size, byOrigin, crossSell: { contracts: cross.contracts, amount: r2(cross.amount) }, trailPerYear: r2(trail) };
}

/** Bestandsprovision aus allen bisherigen Verträgen und Wachstum bei gleichem Tempo (rein). */
export function summarizeBestand(contracts: CustomerContract[], rates: ProvisionOverrides | undefined, typ: VermittlerTyp, now: Date): BestandSummary {
  const trailContracts = contracts
    .filter((c) => c.signedAt <= now)
    .map((c) => {
      const p = contractProvision(c, rates);
      return { trailPerYear: p.trailPerYear, trailFromYear2: p.trailFromYear2, signedAt: c.signedAt };
    });
  const withTrail = trailContracts.filter((c) => c.trailPerYear > 0);
  const perYear = r2(withTrail.reduce((s, c) => s + c.trailPerYear, 0));
  // Tempo: Verträge der letzten 3 Monate, Bestand je Vertrag aus diesen (sonst aus allen)
  const since = new Date(now.getTime() - 91 * 86_400_000);
  const recent = trailContracts.filter((c) => c.signedAt >= since);
  const perMonth = recent.length / 3;
  const sample = recent.length ? recent : trailContracts;
  const avgTrail = sample.length ? sample.reduce((s, c) => s + c.trailPerYear, 0) / sample.length : 0;
  const fromYear2 = typ === "vertreter";
  return {
    perYear,
    contracts: withTrail.length,
    fromYear2,
    inYears: Math.round(bestandInYears(withTrail, now)),
    storno: STORNO_PRO_JAHR,
    growth: bestandGrowth({ existing: withTrail, newPerMonth: perMonth, avgTrail, fromYear2, now }),
    perMonth: Math.round(perMonth * 10) / 10,
  };
}

/** Gewinn eines Zeitraums aus den Teilen (rein). */
export function gewinnOf(provisionFirstYear: number, leadCosts: number, agencyTotal: number): number {
  return r2(provisionFirstYear - leadCosts - agencyTotal);
}

export type ErtragData = {
  typ: VermittlerTyp;
  rates: ProvisionOverrides;
  contracts: CustomerContract[];
  agencyCfg: AgencyCostConfig | null;
};

/** Daten einmal laden, dann für mehrere Zeiträume rechnen. */
export async function loadErtragData(customerId: string, opts: { leadWhere?: Record<string, unknown> } = {}): Promise<ErtragData> {
  const [prov, contracts, agencyCfg] = await Promise.all([
    loadCustomerProvision(customerId),
    loadCustomerContracts(customerId, opts).catch(() => [] as CustomerContract[]),
    loadAgencyCostConfig(customerId).catch(() => null),
  ]);
  return { typ: prov.typ, rates: prov.rates, contracts, agencyCfg };
}

const NO_AGENCY: AgencyCosts = { betreuung: 0, logins: 0, module: 0, whatsapp: 0, setup: 0, gutschrift: 0, total: 0, baseInLeadCosts: false };

/** Lead-Kosten aus Kundensicht: Pro-Lead = Lead-Preis (Revenue), Retainer = Werbebudget + Retainer. */
export async function customerLeadCosts(customerId: string, range: Range): Promise<{ total: number; hint: string | null; adSpend: number | null; retainer: number | null }> {
  const cfg = await loadRetainerConfig(customerId).catch(() => null);
  if (cfg) {
    const s = await computeCustomerSpend(customerId, range, cfg);
    return { total: s?.total ?? 0, hint: null, adSpend: s?.adSpend ?? 0, retainer: s?.retainer ?? 0 };
  }
  const agg = await prisma.revenue.aggregate({ _sum: { amount: true }, where: { customerId, cancelled: false, occurredAt: { gte: range.from, lte: range.to } } });
  return { total: Number(agg._sum.amount ?? 0), hint: null, adSpend: null, retainer: null };
}

/** Kosten & Ertrag eines Zeitraums (mit vorgeladenen Daten). leadCosts optional vorgegeben. */
export async function ertragForRange(customerId: string, data: ErtragData, range: Range, now = new Date(), leadCosts?: number): Promise<ErtragPeriod> {
  const provision = summarizeProvision(data.contracts, data.rates, range);
  const lc = leadCosts ?? (await customerLeadCosts(customerId, range)).total;
  const agency = data.agencyCfg ? agencyCostsForRange(data.agencyCfg, range, now) : NO_AGENCY;
  return { provision, leadCosts: r2(lc), leadCostHint: null, agency, costs: r2(lc + agency.total), gewinn: gewinnOf(provision.firstYear, lc, agency.total) };
}

/** Summe der Provision (Basis Gewinn) mehrerer Kunden im Zeitraum, z. B. Admin-Kundenerfolg. */
export async function provisionForCustomers(customerIds: string[], range: Range): Promise<number> {
  let sum = 0;
  for (const id of customerIds) {
    const d = await loadErtragData(id);
    sum += summarizeProvision(d.contracts, d.rates, range).firstYear;
  }
  return r2(sum);
}

/** Verträge pro Kunde (aktive Verträge / Leads mit Abschluss, seit Start); null ohne Abschluss. */
export function contractsPerCustomer(contracts: CustomerContract[]): number | null {
  const leads = new Set(contracts.map((c) => c.leadId));
  return leads.size ? Math.round((contracts.length / leads.size) * 10) / 10 : null;
}
