// Kosten & Ertrag aus Kundensicht (Ole, 14.11.2026), eine Rechnung für alle Stellen: /buyer/zahlen,
// Hochrechnung, Team-Ansicht, Monatsbericht, Empfehlungs-Modul und Admin-Kundenerfolg.
//
// Gewinn = Abschlussprovision (Makler: Courtage 1. Jahr) − Rückbelastungen − Lead-Kosten − Agenturkosten im
// Zeitraum, ehrlich ohne künftige Bestandsprovision („Nur jetzt“). „Inkl. Bestand“ (gewinnMitBestand) legt
// die künftige Bestandsprovision der Verträge dieses Zeitraums (Kohorte) über 5 Jahre dazu, mit der
// Stornoquote des Kunden, ohne Abzinsung (Prognose). Provision je Vertrag mit der Rate seiner Sparte
// (lib/provision.contractProvision), Verträge aus lib/vertraege, Herkunft aus lib/lead-herkunft.
// summarizeProvision/summarizeBestand sind rein (getestet), loadErtragData lädt die Daten.

import { prisma } from "@/lib/prisma";
import { agencyCostsForRange, loadAgencyCostConfig, type AgencyCostConfig, type AgencyCosts } from "@/lib/agenturkosten";
import { computeCustomerSpend, loadRetainerConfig } from "@/lib/customer-spend";
import { LEAD_ORIGINS, type LeadOrigin } from "@/lib/lead-herkunft";
import {
  BESTAND_JAHRE,
  bestandGrowth,
  bestandInYears,
  cohortFutureTrail,
  contractProvision,
  realStornoQuote,
  STORNO_PRO_JAHR,
  stornoFor,
  type ProvisionOverrides,
  type RealStorno,
  type TrailContract,
  type VermittlerTyp,
} from "@/lib/provision";
import { loadCustomerProvision } from "@/lib/provision-server";
import { loadCustomerContracts, type CustomerContract } from "@/lib/vertraege";

export type Range = { from: Date; to: Date };

export type OriginSum = { amount: number; contracts: number; leads: number };

export type ProvisionSummary = {
  /** Basis für Gewinn: Abschluss + (Makler) Bestand 1. Jahr, abzüglich Rückbelastungen im Zeitraum. */
  firstYear: number;
  /** Nur einmalige Abschlussprovision (abzüglich Rückbelastungen). */
  abschluss: number;
  /** Rückbelastungen gekündigter Verträge, gebucht im Zeitraum (Kündigungsdatum). */
  chargeback: number;
  chargebackContracts: number;
  /** Davon Honorar vom Kunden (PKV-Tarifoptimierung). */
  honorar: number;
  /**
   * Künftige Bestandsprovision der Verträge dieses Zeitraums (Kohorte) über 5 Jahre, soweit nicht schon in
   * firstYear: Stornoquote des Kunden, ohne Abzinsung, gekündigte nur bis zum Kündigungsdatum.
   */
  futureTrail: number;
  contracts: number;
  /** Leads mit Abschluss, deren Verträge im Zeitraum zählen. */
  leads: number;
  byOrigin: Record<LeadOrigin, OriginSum>;
  /** Weitere Verträge (nicht der erste Abschluss eines Leads, keine Übertragung). */
  crossSell: { contracts: number; amount: number };
  /** Bestätigte Bestandsübertragungen aus der Maklervollmacht (nur Bestandsprovision), getrennt von Neuabschlüssen. */
  uebertragung: { contracts: number; amount: number; leads: number };
  /** Bestandsprovision pro Jahr aus (laufenden) Verträgen dieses Zeitraums. */
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
  /** Verwendete Stornoquote pro Jahr (eigene oder Standard). */
  storno: number;
  /** Eigene Quote aus „Meine Provisionen“ (sonst Standard). */
  stornoCustom: boolean;
  /** Tatsächliche Stornoquote aus gekündigten Verträgen (erst ab 20 Verträgen). */
  real: RealStorno;
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
  /** „Nur jetzt“. */
  gewinn: number;
  /** „Inkl. Bestand“: gewinn + künftige Bestandsprovision der Kohorte (provision.futureTrail). */
  gewinnMitBestand: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const inRange = (d: Date, r: Range) => d >= r.from && d <= r.to;

const cancelledBy = (c: CustomerContract, at: Date) => c.status === "storniert" && !!c.cancelledAt && c.cancelledAt <= at;

/** Vertrag für die Bestandsrechnung (Sparten-Storno, Ende bei Kündigung). */
export function trailContractOf(c: CustomerContract, rates: ProvisionOverrides | undefined, storno: number): TrailContract & { contract: CustomerContract } {
  const p = contractProvision({ ...c, status: "aktiv" }, rates);
  return {
    trailPerYear: p.trailPerYear,
    trailFromYear2: p.trailFromYear2,
    signedAt: c.signedAt,
    storno: stornoFor(c.sparte, rates, storno),
    endsAt: c.status === "storniert" ? (c.cancelledAt ?? c.signedAt) : null,
    contract: c,
  };
}

/**
 * Provision der Verträge im Zeitraum (rein). Gekündigte Verträge zählen mit ihrer Abschlussprovision im
 * Zeitraum des Abschlusses; ihre Rückbelastung mindert Provision und Gewinn im Zeitraum des
 * Kündigungsdatums. opts.now/opts.storno für die künftige Bestandsprovision der Kohorte (futureTrail).
 */
export function summarizeProvision(
  contracts: CustomerContract[],
  rates: ProvisionOverrides | undefined,
  range: Range,
  opts: { now?: Date; storno?: number } = {},
): ProvisionSummary {
  const now = opts.now ?? new Date();
  const storno = opts.storno ?? STORNO_PRO_JAHR;
  const byOrigin = Object.fromEntries(LEAD_ORIGINS.map((o) => [o.key, { amount: 0, contracts: 0, leads: 0 }])) as Record<LeadOrigin, OriginSum>;
  const leadsOf = new Map<LeadOrigin, Set<string>>();
  const leads = new Set<string>();
  let firstYear = 0;
  let abschluss = 0;
  let trail = 0;
  let honorar = 0;
  let future = 0;
  let chargeback = 0;
  let chargebackContracts = 0;
  let n = 0;
  const cross = { contracts: 0, amount: 0 };
  const ueb = { contracts: 0, amount: 0 };
  const uebLeads = new Set<string>();
  for (const c of contracts) {
    if (c.status === "storniert" && c.cancelledAt && inRange(c.cancelledAt, range) && (c.chargeback ?? 0) > 0) {
      chargeback += c.chargeback!;
      chargebackContracts++;
    }
    if (!inRange(c.periodAt, range)) continue;
    const p = contractProvision({ ...c, status: "aktiv" }, rates);
    firstYear += p.firstYear;
    abschluss += p.abschluss;
    if (p.honorar) honorar += p.abschluss;
    if (!cancelledBy(c, now)) trail += p.trailPerYear;
    future += cohortFutureTrail(trailContractOf(c, rates, storno), now, BESTAND_JAHRE, storno);
    n++;
    leads.add(c.leadId);
    const o = byOrigin[c.origin];
    o.amount += p.firstYear;
    o.contracts++;
    const set = leadsOf.get(c.origin) ?? new Set<string>();
    set.add(c.leadId);
    leadsOf.set(c.origin, set);
    if (c.uebertragung) {
      ueb.contracts++;
      ueb.amount += p.firstYear;
      uebLeads.add(c.leadId);
    } else if (!c.primary) {
      cross.contracts++;
      cross.amount += p.firstYear;
    }
  }
  for (const [k, set] of leadsOf) byOrigin[k].leads = set.size;
  for (const k of Object.keys(byOrigin) as LeadOrigin[]) byOrigin[k].amount = r2(byOrigin[k].amount);
  return {
    firstYear: r2(firstYear - chargeback),
    abschluss: r2(abschluss - chargeback),
    chargeback: r2(chargeback),
    chargebackContracts,
    honorar: r2(honorar),
    futureTrail: Math.round(future),
    contracts: n,
    leads: leads.size,
    byOrigin,
    crossSell: { contracts: cross.contracts, amount: r2(cross.amount) },
    uebertragung: { contracts: ueb.contracts, amount: r2(ueb.amount), leads: uebLeads.size },
    trailPerYear: r2(trail),
  };
}

/**
 * Bestandsprovision aus allen bisherigen Verträgen und Wachstum bei gleichem Tempo (rein). storno = Quote des
 * Kunden (Standard 10 %), je Sparte ggf. eigene; gekündigte Verträge ab dem Kündigungsdatum raus.
 */
export function summarizeBestand(
  contracts: CustomerContract[],
  rates: ProvisionOverrides | undefined,
  typ: VermittlerTyp,
  now: Date,
  storno: number = STORNO_PRO_JAHR,
  stornoCustom = false,
): BestandSummary {
  const signed = contracts.filter((c) => c.signedAt <= now);
  const trailContracts = signed.map((c) => trailContractOf(c, rates, storno));
  const withTrail = trailContracts.filter((c) => c.trailPerYear > 0);
  const running = withTrail.filter((c) => !cancelledBy(c.contract, now));
  const perYear = r2(running.reduce((s, c) => s + c.trailPerYear, 0));
  // Tempo: Verträge der letzten 3 Monate, Bestand je Vertrag aus diesen (sonst aus allen)
  const since = new Date(now.getTime() - 91 * 86_400_000);
  const recent = trailContracts.filter((c) => c.signedAt >= since);
  const perMonth = recent.length / 3;
  const sample = recent.length ? recent : trailContracts;
  const avgTrail = sample.length ? sample.reduce((s, c) => s + c.trailPerYear, 0) / sample.length : 0;
  const fromYear2 = typ === "vertreter";
  return {
    perYear,
    contracts: running.length,
    fromYear2,
    inYears: Math.round(bestandInYears(withTrail, now, BESTAND_JAHRE, storno)),
    storno,
    stornoCustom,
    real: realStornoQuote(signed.map((c) => ({ signedAt: c.signedAt, cancelledAt: c.status === "storniert" ? c.cancelledAt : null })), now),
    growth: bestandGrowth({ existing: withTrail, newPerMonth: perMonth, avgTrail, fromYear2, now, storno }),
    perMonth: Math.round(perMonth * 10) / 10,
  };
}

const zahl = (n: number) => n.toLocaleString("de-DE");

/**
 * Zeile unter der Abschlussprovision (Ole, 17.11.2026). Der Betrag enthält alle Verträge des Zeitraums, auch
 * Cross-Selling; „Abschlüsse“ sind die ersten Verträge (einer je Kontakt). Mit Cross-Selling also beides:
 * „aus 3 Abschlüssen (4 Verträge, davon 1 Cross-Selling)“, sonst kurz. „einmalig“ nur, wenn kein Bestand des
 * 1. Jahres im Betrag steckt (Sparten mit Bestand ab dem 1. Jahr: „inkl. Bestand im 1. Jahr“).
 */
export function provisionAusText(prov: Pick<ProvisionSummary, "contracts" | "crossSell" | "firstYear" | "abschluss"> & Partial<Pick<ProvisionSummary, "uebertragung">>, makler: boolean): string {
  const cross = prov.crossSell.contracts;
  const ueb = prov.uebertragung?.contracts ?? 0;
  const abschluesse = prov.contracts - cross - ueb;
  const neu = prov.contracts - ueb;
  const vertraege = cross > 0 ? ` (${zahl(neu)} ${neu === 1 ? "Vertrag" : "Verträge"}, davon ${zahl(cross)} Cross-Selling)` : "";
  const art = makler ? "im 1. Jahr" : prov.firstYear > prov.abschluss + 0.005 ? "inkl. Bestand im 1. Jahr" : "einmalig";
  const uebText = ueb > 0 ? ` und ${zahl(ueb)} ${ueb === 1 ? "Bestandsübertragung" : "Bestandsübertragungen"}` : "";
  return `aus ${zahl(abschluesse)} ${abschluesse === 1 ? "Abschluss" : "Abschlüssen"}${vertraege}${uebText}, ${art}`;
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
  /** Stornoquote pro Jahr des Kunden (eigene oder Standard); optional für ältere Aufrufer. */
  storno?: number;
  stornoCustom?: boolean;
};

/** Daten einmal laden, dann für mehrere Zeiträume rechnen. */
export async function loadErtragData(customerId: string, opts: { leadWhere?: Record<string, unknown> } = {}): Promise<ErtragData> {
  const [prov, contracts, agencyCfg] = await Promise.all([
    loadCustomerProvision(customerId),
    loadCustomerContracts(customerId, opts).catch(() => [] as CustomerContract[]),
    loadAgencyCostConfig(customerId).catch(() => null),
  ]);
  return { typ: prov.typ, rates: prov.rates, contracts, agencyCfg, storno: prov.storno, stornoCustom: prov.stornoCustom };
}

/** Bestand mit der Stornoquote des Kunden (Kurzform für summarizeBestand). */
export function bestandOf(data: ErtragData, now: Date): BestandSummary {
  return summarizeBestand(data.contracts, data.rates, data.typ, now, data.storno ?? STORNO_PRO_JAHR, !!data.stornoCustom);
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
  const provision = summarizeProvision(data.contracts, data.rates, range, { now, storno: data.storno });
  const lc = leadCosts ?? (await customerLeadCosts(customerId, range)).total;
  const agency = data.agencyCfg ? agencyCostsForRange(data.agencyCfg, range, now) : NO_AGENCY;
  const gewinn = gewinnOf(provision.firstYear, lc, agency.total);
  return { provision, leadCosts: r2(lc), leadCostHint: null, agency, costs: r2(lc + agency.total), gewinn, gewinnMitBestand: r2(gewinn + provision.futureTrail) };
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

/** Verträge pro Kunde (laufende Verträge / Leads mit Abschluss, seit Start); null ohne Abschluss. */
export function contractsPerCustomer(contracts: CustomerContract[], now = new Date()): number | null {
  const active = contracts.filter((c) => !cancelledBy(c, now));
  const leads = new Set(active.map((c) => c.leadId));
  return leads.size ? Math.round((active.length / leads.size) * 10) / 10 : null;
}
