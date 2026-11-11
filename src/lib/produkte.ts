// Zahlen → Produkte: wie laufen die Produkte über alle Vertreter und je Vertreter.
// Die Rechnung (aggregateProducts) ist ohne Datenbank und getestet; loadProdukte
// holt die Zeilen für einen Zeitraum.
//
// Annahmen:
// - Produkt = Lead.source, vereinheitlicht über canonicalProductKey (Revenue über
//   den Lead, Werbekosten über Cost.product). Ohne Angabe: „Ohne Produkt“.
// - Leads = im Zeitraum eingegangen, ohne anerkannte Stornos.
// - Werbekosten = Meta-Kosten (Cost kind LEAD) mit Produkt im Zeitraum, ohne die
//   Kampagnen der eigenen Kundengewinnung. Kosten mit Kunde zählen für diesen
//   Kunden; Kosten ohne Kunde (Pay-per-Lead-Pool) werden in der Matrix nach dem
//   Anteil des Kunden an den Leads des Produkts verteilt („anteilig“).
// - Termin = Lead mit Termin im Kalender oder Status „Termin vereinbart“.
// - Jahresbeitrag = gemeldeter Beitrag beim Abschluss (Monatsprodukte × 12);
//   Provision = Schätzung je Abschluss mit den Sätzen des Kunden (lib/provision).
// - Pay-per-Lead-Umsatz = nicht stornierte Revenue-Zeilen im Zeitraum.

import { prisma } from "@/lib/prisma";
import { canonicalProductKey, displayProduct } from "@/lib/products";
import { effectiveRates, estimatedProvision, ruleFor, type ProvisionOverrides } from "@/lib/provision";
import { loadKpiSettings, FIRST_MONTH } from "@/lib/zahlen";
import { LOW_SAMPLE, NO_PRODUCT, PRODUKT_RANGES, type MatrixCell, type MatrixRow, type ProdukteData, type ProductStats, type ProduktRange } from "@/lib/produkte-shared";

export { LOW_SAMPLE, NO_PRODUCT, PRODUKT_RANGES, type MatrixCell, type MatrixRow, type ProdukteData, type ProductStats, type ProduktRange };

export type ProductLead = { customerId: string; source: string | null; status: string | null; closeValue: number | null; hasAppointment: boolean };
export type ProductCost = { customerId: string | null; product: string | null; amount: number };
export type ProductRevenue = { customerId: string; source: string | null; amount: number };


export function productKeyOf(source: string | null | undefined): string {
  const s = (source ?? "").trim();
  return s ? canonicalProductKey(s) : NO_PRODUCT;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const rate = (a: number, b: number) => (b > 0 ? a / b : null);

/** Jahresbeitrag aus dem gemeldeten Wert (null = kein Beitrag, z. B. freier Wert). */
function annualPremium(source: string | null, closeValue: number | null, overrides?: ProvisionOverrides): number | null {
  if (!(closeValue != null && closeValue > 0)) return null;
  const r = ruleFor(source, overrides);
  if (r.kind === "percent") return closeValue;
  if (r.kind === "monthly") return closeValue * 12;
  return null;
}

export function aggregateProducts(input: {
  leads: ProductLead[];
  costs: ProductCost[];
  revenues: ProductRevenue[];
  rates?: Map<string, ProvisionOverrides>;
  names?: Map<string, string>;
}): { products: ProductStats[]; matrix: MatrixRow[] } {
  const rates = input.rates ?? new Map<string, ProvisionOverrides>();
  const stats = new Map<string, ProductStats>();
  const get = (key: string) => {
    let s = stats.get(key);
    if (!s) {
      s = { key, label: key === NO_PRODUCT ? NO_PRODUCT : displayProduct(key), leads: 0, cost: null, cpl: null, appointments: 0, appointmentRate: null, closes: 0, closeRate: null, premiumsReported: 0, premiumSum: 0, provision: 0, pplRevenue: 0, lowSample: false };
      stats.set(key, s);
    }
    return s;
  };
  // Kunde × Produkt
  const cells = new Map<string, Map<string, { leads: number; closes: number; directCost: number; hasDirect: boolean }>>();
  const cell = (customerId: string, key: string) => {
    const row = cells.get(customerId) ?? new Map();
    cells.set(customerId, row);
    let c = row.get(key);
    if (!c) {
      c = { leads: 0, closes: 0, directCost: 0, hasDirect: false };
      row.set(key, c);
    }
    return c;
  };

  for (const l of input.leads) {
    const key = productKeyOf(l.source);
    const s = get(key);
    const c = cell(l.customerId, key);
    s.leads++;
    c.leads++;
    if (l.hasAppointment || l.status === "Termin vereinbart") s.appointments++;
    if (l.status === "Abschluss") {
      s.closes++;
      c.closes++;
      const ov = rates.get(l.customerId);
      const p = annualPremium(l.source, l.closeValue, ov);
      if (p != null) {
        s.premiumsReported++;
        s.premiumSum += p;
      }
      s.provision += estimatedProvision(l.source, l.closeValue, ov) ?? 0;
    }
  }

  const pooled = new Map<string, number>();
  for (const c of input.costs) {
    if (!(c.amount > 0) || !c.product) continue;
    const key = productKeyOf(c.product);
    const s = get(key);
    s.cost = (s.cost ?? 0) + c.amount;
    if (c.customerId) {
      const x = cell(c.customerId, key);
      x.directCost += c.amount;
      x.hasDirect = true;
    } else pooled.set(key, (pooled.get(key) ?? 0) + c.amount);
  }

  for (const r of input.revenues) {
    if (!(r.amount > 0)) continue;
    get(productKeyOf(r.source)).pplRevenue += r.amount;
  }

  for (const s of stats.values()) {
    s.cost = s.cost == null ? null : r2(s.cost);
    s.cpl = s.cost != null && s.leads > 0 ? r2(s.cost / s.leads) : null;
    s.appointmentRate = rate(s.appointments, s.leads);
    s.closeRate = rate(s.closes, s.leads);
    s.premiumSum = r2(s.premiumSum);
    s.provision = r2(s.provision);
    s.pplRevenue = r2(s.pplRevenue);
    s.lowSample = s.leads < LOW_SAMPLE;
  }

  const matrix: MatrixRow[] = [];
  for (const [customerId, row] of cells) {
    const out: Record<string, MatrixCell> = {};
    let total = 0;
    for (const [key, c] of row) {
      const productLeads = stats.get(key)?.leads ?? 0;
      const share = productLeads > 0 ? c.leads / productLeads : 0;
      const pool = (pooled.get(key) ?? 0) * share;
      const cost = c.hasDirect || pool > 0 ? r2(c.directCost + pool) : null;
      out[key] = { leads: c.leads, cost, costShared: pool > 0, cpl: cost != null && c.leads > 0 ? r2(cost / c.leads) : null, closes: c.closes, closeRate: rate(c.closes, c.leads), lowSample: c.leads < LOW_SAMPLE };
      total += c.leads;
    }
    if (total === 0) continue; // nur Kosten, keine Leads
    matrix.push({ customerId, name: input.names?.get(customerId) ?? "Kunde", leads: total, cells: out });
  }
  matrix.sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name, "de"));
  const products = [...stats.values()].sort((a, b) => b.leads - a.leads || (b.cost ?? 0) - (a.cost ?? 0));
  return { products, matrix };
}

// ─── Zeitraum ────────────────────────────────────────────────────────────


const berlinMidnight = (y: number, m: number, d: number) => {
  // Mitternacht Berlin als UTC-Zeitpunkt (Sommer-/Winterzeit über die Zeitzonen-Differenz)
  const utc = Date.UTC(y, m - 1, d);
  const off = new Date(utc).toLocaleString("en-US", { timeZone: "Europe/Berlin", hour12: false, hour: "2-digit" });
  return new Date(utc - Number(off) * 3_600_000);
};

export function produktRange(key: string | undefined, now = new Date()): { key: ProduktRange; from: Date; to: Date } {
  const k = (PRODUKT_RANGES.some((r) => r.key === key) ? key : "90") as ProduktRange;
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now).split("-").map(Number);
  const today = berlinMidnight(y, m, d);
  const DAY = 86_400_000;
  switch (k) {
    case "30":
      return { key: k, from: new Date(today.getTime() - 29 * DAY), to: now };
    case "monat":
      return { key: k, from: berlinMidnight(y, m, 1), to: now };
    case "vormonat":
      return { key: k, from: m === 1 ? berlinMidnight(y - 1, 12, 1) : berlinMidnight(y, m - 1, 1), to: berlinMidnight(y, m, 1) };
    case "jahr":
      return { key: k, from: berlinMidnight(y, 1, 1), to: now };
    case "max":
      return { key: k, from: berlinMidnight(Number(FIRST_MONTH.slice(0, 4)), Number(FIRST_MONTH.slice(5, 7)), 1), to: now };
    default:
      return { key: k, from: new Date(today.getTime() - 89 * DAY), to: now };
  }
}

// ─── Laden ───────────────────────────────────────────────────────────────

const NOT_STORNO = { OR: [{ stornoState: null }, { stornoState: { not: "approved" } }] };


export async function loadProdukte(rangeKey?: string, now = new Date()): Promise<ProdukteData> {
  const { key, from, to } = produktRange(rangeKey, now);
  const settings = await loadKpiSettings();
  const patterns = settings.acquisitionCampaigns.map((c) => c.toLowerCase());
  const [leads, costs, revenues] = await Promise.all([
    prisma.lead.findMany({
      where: { createdAt: { gte: from, lt: to }, ...NOT_STORNO, customer: { plan: { not: "internal" } } },
      select: { customerId: true, source: true, status: true, closeValue: true, _count: { select: { appointments: true } } },
    }),
    prisma.cost.findMany({ where: { kind: "LEAD", product: { not: null }, occurredAt: { gte: from, lt: to } }, select: { customerId: true, product: true, amount: true, note: true } }),
    prisma.revenue.findMany({ where: { cancelled: false, occurredAt: { gte: from, lt: to }, customer: { plan: { not: "internal" } } }, select: { customerId: true, amount: true, lead: { select: { source: true } } } }),
  ]);
  const customerIds = [...new Set(leads.map((l) => l.customerId))];
  const customers = customerIds.length
    ? await prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true, vermittlerTyp: true, provisionRates: true } })
    : [];
  const { products, matrix } = aggregateProducts({
    leads: leads.map((l) => ({ customerId: l.customerId, source: l.source, status: l.status, closeValue: l.closeValue == null ? null : Number(l.closeValue), hasAppointment: l._count.appointments > 0 })),
    costs: costs
      .filter((c) => !patterns.some((p) => (c.note ?? "").toLowerCase().includes(p)))
      .map((c) => ({ customerId: c.customerId, product: c.product, amount: Number(c.amount) })),
    revenues: revenues.map((r) => ({ customerId: r.customerId, source: r.lead?.source ?? null, amount: Number(r.amount) })),
    rates: new Map(customers.map((c) => [c.id, effectiveRates(c.vermittlerTyp, c.provisionRates)])),
    names: new Map(customers.map((c) => [c.id, c.name])),
  });
  return { range: key, from: from.toISOString(), to: to.toISOString(), products, matrix, productOrder: products.filter((p) => p.leads > 0).map((p) => ({ key: p.key, label: p.label })) };
}
