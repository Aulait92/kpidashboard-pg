// Agenturkosten aus Kundensicht (Ole, 14.11.2026): was der Kunde an uns zahlt, für „Gewinn“ auf
// /buyer/zahlen. Betreuung + Software (Monatspreis), weitere Logins, Bestandskunden-Modul, Modul
// Empfehlungen, WhatsApp-Gebühren und Setup. Quelle: angenommenes Angebot und die abgerechneten
// Mengen am Kunden (seatsBilled, Modulpreise, Gebühren-Einträge), nicht die Preisliste.
//
// - Monatsbeträge tagesanteilig auf den Zeitraum (nie in die Zukunft).
// - Setup über die Mindestlaufzeit verteilt (12 bzw. 3 Monate, ohne Laufzeit über 12 Monate).
// - Brutto inkl. USt: Vermittler sind meist umsatzsteuerbefreit, die USt ist für sie echter Aufwand.
// - Retainer-Kunden: Betreuung + Software steckt schon (netto) in den Lead-Kosten, dort nicht doppelt;
//   hier kommt nur die USt darauf dazu.
// - Gutschrift für Kollegen-Empfehlungen mindert die Agenturkosten im Monat der Gutschrift.
//
// agencyCostsForRange ist rein (ohne Datenbank, getestet); loadAgencyCostConfig lädt die Daten.

import { prisma } from "@/lib/prisma";
import { PRICE_LIST, TERM_MONTHS, freimonateKunde, isPrepaid, normalizeTerm, rhythmusFuer, rhythmusMonatsAnteil } from "@/lib/offer-pricing";

const DAY_MS = 86_400_000;

/** Monatsbetrag (netto) in einem Zeitabschnitt; from/until null = offen. */
export type CostSegment = { from: Date | null; until: Date | null; monthly: number };

export type AgencyCostConfig = {
  vatRate: number;
  /** Faktor bei jährlicher Vorauszahlung ((12 − Freimonate) / 12), sonst 1. */
  annualFactor: number;
  /** Betreuung + Software. */
  base: CostSegment[];
  /** Steckt Betreuung + Software schon in den Lead-Kosten (Retainer)? Dann hier nur die USt darauf. */
  baseInLeadCosts: boolean;
  logins: CostSegment[];
  modules: CostSegment[];
  /** Einrichtung, verteilt über `months` ab `from`. */
  setup: { amount: number; from: Date; months: number } | null;
  /** WhatsApp-Gebühren je Monat („2026-11“), netto. */
  whatsapp: { month: string; amount: number }[];
  /** Gutschriften (Kollegen-Empfehlung), netto. */
  credits: { at: Date; amount: number }[];
};

export type AgencyCosts = {
  /** Betreuung + Software (brutto); bei Retainer nur die USt darauf. */
  betreuung: number;
  logins: number;
  module: number;
  whatsapp: number;
  setup: number;
  /** Gutschrift Empfehlung (positiv, wird abgezogen). */
  gutschrift: number;
  /** Summe brutto nach Gutschrift. */
  total: number;
  /** Retainer: Betreuung steckt in den Lead-Kosten. */
  baseInLeadCosts: boolean;
};

const utcDay = (t: number) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
const daysInMonthOf = (t: number) => {
  const d = new Date(t);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
};

/** Monatsbetrag tagesanteilig (je Tag Betrag / Tage des Monats) im Schnitt von Zeitraum, Abschnitt und „bis heute“. */
export function proratedMonthly(monthly: number, range: { from: Date; to: Date }, seg: { from: Date | null; until: Date | null }, now: Date): number {
  if (!(monthly > 0)) return 0;
  const start = utcDay(Math.max(range.from.getTime(), seg.from?.getTime() ?? -Infinity));
  const end = Math.min(range.to.getTime(), now.getTime(), seg.until?.getTime() ?? Infinity);
  let sum = 0;
  for (let d = start; d <= end; d += DAY_MS) sum += monthly / daysInMonthOf(d);
  return sum;
}

const monthBounds = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), until: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)) };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Agenturkosten (brutto) im Zeitraum. */
export function agencyCostsForRange(cfg: AgencyCostConfig, range: { from: Date; to: Date }, now = new Date()): AgencyCosts {
  const gross = 1 + cfg.vatRate;
  const seg = (list: CostSegment[], factor = 1) => list.reduce((s, x) => s + proratedMonthly(x.monthly * factor, range, x, now), 0);
  const baseNet = seg(cfg.base, cfg.baseInLeadCosts ? 1 : cfg.annualFactor);
  const betreuung = cfg.baseInLeadCosts ? baseNet * cfg.vatRate : baseNet * gross;
  const logins = seg(cfg.logins, cfg.annualFactor) * gross;
  const modules = seg(cfg.modules, cfg.annualFactor) * gross;
  let whatsapp = 0;
  for (const w of cfg.whatsapp) {
    // Abgerechnete Gebühr eines Monats gleichmäßig auf seine Tage verteilt
    const b = monthBounds(w.month);
    whatsapp += proratedMonthly(w.amount, range, b, b.until);
  }
  whatsapp *= gross;
  let setup = 0;
  if (cfg.setup && cfg.setup.amount > 0) {
    const from = cfg.setup.from;
    const until = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + cfg.setup.months, from.getUTCDate()) - 1);
    const totalDays = Math.max(1, Math.round((utcDay(until.getTime()) - utcDay(from.getTime())) / DAY_MS) + 1);
    const start = utcDay(Math.max(range.from.getTime(), from.getTime()));
    const end = Math.min(range.to.getTime(), now.getTime(), until.getTime());
    const days = end >= start ? Math.floor((utcDay(end) - start) / DAY_MS) + 1 : 0;
    setup = (cfg.setup.amount * days * gross) / totalDays;
  }
  const gutschrift = cfg.credits.filter((c) => c.at >= range.from && c.at <= range.to).reduce((s, c) => s + c.amount, 0) * gross;
  const total = betreuung + logins + modules + whatsapp + setup - gutschrift;
  return {
    betreuung: round2(betreuung),
    logins: round2(logins),
    module: round2(modules),
    whatsapp: round2(whatsapp),
    setup: round2(setup),
    gutschrift: round2(gutschrift),
    total: round2(total),
    baseInLeadCosts: cfg.baseInLeadCosts,
  };
}

/** Mindestlaufzeit für die Verteilung des Setups (ohne Laufzeit: 12 Monate). */
export function setupMonths(term: unknown): number {
  const m = TERM_MONTHS[normalizeTerm(term)];
  return m > 0 ? m : 12;
}

type AuditRow = { at: Date; details: unknown };
const detail = (r: AuditRow, key: string): unknown => (r.details && typeof r.details === "object" ? (r.details as Record<string, unknown>)[key] : undefined);

/**
 * Zeitabschnitte der weiteren Logins aus dem Abrechnungsprotokoll (billing.seats: from → to) und
 * dem aktuellen Stand seatsBilled. Ohne Protokoll gilt der aktuelle Stand ab Abrechnungsbeginn.
 */
export function seatSegments(seatsBilled: number, seatMonthly: number, audits: AuditRow[], start: Date | null): CostSegment[] {
  if (!(seatMonthly > 0)) return [];
  const isCount = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
  // Nur Einträge mit Menge vorher/nachher; Stand heute ist immer seatsBilled
  const sorted = audits.filter((a) => isCount(detail(a, "to"))).sort((a, b) => +a.at - +b.at);
  const out: CostSegment[] = [];
  let from = start;
  let count = sorted.length && isCount(detail(sorted[0], "from")) ? Number(detail(sorted[0], "from")) : sorted.length ? 0 : seatsBilled;
  for (const a of sorted) {
    if (count > 0) out.push({ from, until: new Date(a.at.getTime() - 1), monthly: count * seatMonthly });
    from = a.at;
    count = Number(detail(a, "to") ?? 0);
  }
  out.push({ from, until: null, monthly: (sorted.length ? seatsBilled : count) * seatMonthly });
  return out.filter((s) => s.monthly > 0);
}

/** Konfiguration der Agenturkosten eines Kunden (null = ohne Kunde / Datenbank nicht erreichbar). */
export async function loadAgencyCostConfig(customerId: string): Promise<AgencyCostConfig | null> {
  const c = await prisma.customer
    .findUnique({
      where: { id: customerId },
      select: {
        createdAt: true,
        retainerMonthly: true,
        retainerStart: true,
        retainerEnd: true,
        seatsBilled: true,
        seatMonthly: true,
        billingInterval: true,
        prepayFreeMonths: true,
        bestandMonthly: true,
        bestandGrandfathered: true,
        bestandCancelAt: true,
        empfehlungMonthly: true,
        empfehlungFree: true,
        empfehlungTrialEndsAt: true,
        empfehlungSince: true,
        empfehlungCancelAt: true,
        onboarding: { select: { offerId: true, startDate: true } },
      },
    })
    .catch(() => null);
  if (!c) return null;
  const offer = c.onboarding?.offerId
    ? await prisma.offer.findUnique({
        where: { id: c.onboarding.offerId },
        select: { status: true, setupFee: true, monthlyFee: true, term: true, startDate: true, acceptedAt: true, annualPrepay: true, annualFreeMonths: true },
      })
    : null;
  const accepted = offer && offer.status === "accepted" ? offer : null;
  const start = accepted?.startDate ?? c.onboarding?.startDate ?? c.retainerStart ?? accepted?.acceptedAt ?? null;
  const retainer = c.retainerMonthly != null ? Number(c.retainerMonthly) : 0;
  const [audits, fees, credits] = await Promise.all([
    prisma.auditLog.findMany({ where: { customerId, action: { in: ["billing.seats", "billing.bestand", "billing.empfehlung"] } }, orderBy: { at: "asc" }, select: { action: true, at: true, details: true } }),
    prisma.whatsAppFeeCharge.findMany({ where: { customerId }, select: { month: true, amount: true } }),
    prisma.colleagueReferral.findMany({
      where: { referrerId: customerId, rewardStatus: { in: ["credited", "done_manual"] }, rewardedAt: { not: null }, rewardAmount: { not: null } },
      select: { rewardedAt: true, rewardAmount: true },
    }),
  ]);
  const firstBook = (action: string) => audits.find((a) => a.action === action && detail(a, "mode") === "book")?.at ?? null;
  const modules: CostSegment[] = [];
  const bestand = c.bestandMonthly != null ? Number(c.bestandMonthly) : 0;
  if (bestand > 0 && !c.bestandGrandfathered) modules.push({ from: firstBook("billing.bestand") ?? start, until: c.bestandCancelAt, monthly: bestand });
  const empf = c.empfehlungMonthly != null ? Number(c.empfehlungMonthly) : 0;
  if (empf > 0 && !c.empfehlungFree) modules.push({ from: c.empfehlungTrialEndsAt ?? firstBook("billing.empfehlung") ?? c.empfehlungSince ?? start, until: c.empfehlungCancelAt, monthly: empf });
  // Vorauszahlung: jährlich bzw. 6 Monate (Laufzeit 6m) im Voraus
  const rhythmus = isPrepaid(c.billingInterval) ? c.billingInterval : rhythmusFuer(accepted?.term, !!accepted?.annualPrepay);
  const yearly = isPrepaid(rhythmus);
  return {
    vatRate: PRICE_LIST.vatRate,
    annualFactor: yearly ? rhythmusMonatsAnteil(rhythmus, freimonateKunde(c, accepted)) : 1,
    base: retainer > 0
      ? [{ from: c.retainerStart, until: c.retainerEnd, monthly: retainer }]
      : accepted && Number(accepted.monthlyFee) > 0
        ? [{ from: start, until: c.retainerEnd, monthly: Number(accepted.monthlyFee) }]
        : [],
    baseInLeadCosts: retainer > 0,
    logins: seatSegments(c.seatsBilled, c.seatMonthly != null ? Number(c.seatMonthly) : 0, audits.filter((a) => a.action === "billing.seats"), start ?? c.createdAt),
    modules,
    // Tatsächlich vereinbarter Setup-Betrag aus dem angenommenen Angebot (inkl. Rabatten), nicht der Listenpreis
    setup: accepted && Number(accepted.setupFee) > 0 ? { amount: Number(accepted.setupFee), from: accepted.startDate ?? accepted.acceptedAt ?? start ?? c.createdAt, months: setupMonths(accepted.term) } : null,
    whatsapp: fees.map((f) => ({ month: f.month, amount: Number(f.amount) })),
    credits: credits.map((r) => ({ at: r.rewardedAt!, amount: Number(r.rewardAmount) })),
  };
}
