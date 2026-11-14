// Daten für die Tipps-Karte „So holen Sie mehr raus“ (lib/zahlen-tipps). Vergleichswerte nur als
// Schnitt aller Kunden (anonym, aggregiert), keine Daten anderer Kunden.

import { prisma } from "@/lib/prisma";
import { computeKpis, type Kpis } from "@/lib/kpis";
import { PAID_LEAD_WHERE } from "@/lib/lead-herkunft";
import { CLOSED_STATUS } from "@/lib/products";
import { contractProvision } from "@/lib/provision";
import type { ErtragData } from "@/lib/ertrag";
import type { TipSignals } from "@/lib/zahlen-tipps";
import { nextStepRate } from "@/lib/lead-next-step-server";

const DAY = 86_400_000;
const MIN_LEADS_FOR_RATES = 10;

let avgCache: { at: number; kpis: Kpis } | null = null;

/** Quoten aller Kunden (bezahlte Leads, 90 Tage), eine Stunde zwischengespeichert. */
async function averageKpis(now: Date): Promise<Kpis | null> {
  if (avgCache && now.getTime() - avgCache.at < 60 * 60 * 1000) return avgCache.kpis;
  const kpis = await computeKpis({ range: { from: new Date(now.getTime() - 90 * DAY), to: now }, customerId: null, origin: "paid" }).catch(() => null);
  if (kpis) avgCache = { at: now.getTime(), kpis };
  return kpis;
}

export async function loadTipSignals(customerId: string, data: ErtragData, now = new Date()): Promise<TipSignals> {
  const since90 = new Date(now.getTime() - 90 * DAY);
  const [customer, own, avg, paidLeads, notAsked, settings, imported, campaigns, withoutCross, steps] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { empfehlungEnabled: true, retainerMonthly: true } }),
    computeKpis({ range: { from: since90, to: now }, customerId, origin: "paid" }),
    averageKpis(now),
    prisma.lead.count({ where: { customerId, createdAt: { gte: since90 }, ...PAID_LEAD_WHERE } }),
    prisma.lead.count({ where: { customerId, status: CLOSED_STATUS, erasedAt: null, reviewRequest: { is: null } } }),
    prisma.referralSettings.findUnique({ where: { id: "default" }, select: { enabled: true, rewardKind: true, rewardFixed: true } }).catch(() => null),
    prisma.existingCustomer.count({ where: { customerId, leadId: null } }),
    prisma.customerCampaign.count({ where: { customerId } }),
    prisma.lead.count({
      where: {
        customerId,
        status: CLOSED_STATUS,
        erasedAt: null,
        closedAt: { lte: new Date(now.getTime() - 21 * DAY) },
        contracts: { none: { primaryLeadId: null, status: "aktiv" } },
      },
    }),
    nextStepRate(customerId, { now }).catch(() => null),
  ]);
  const leadIds = new Set(data.contracts.map((c) => c.leadId));
  const total = data.contracts.reduce((s, c) => s + contractProvision(c, data.rates).firstYear, 0);
  const missingPremium = data.contracts.filter((c) => c.status !== "storniert" && c.premium == null && c.provisionValue == null && c.beitragssumme == null).length;
  const enough = own.nettoLeads >= MIN_LEADS_FOR_RATES;
  const rate = (o: number | null, a: number | null | undefined) => ({ own: enough ? o : null, avg: a ?? null });
  return {
    avgProvision: leadIds.size ? total / leadIds.size : 0,
    paidLeadsPerMonth: paidLeads / 3,
    closedCustomers: leadIds.size,
    empfehlungEnabled: !!customer?.empfehlungEnabled,
    notAskedForReferral: customer?.empfehlungEnabled ? notAsked : 0,
    kollegenEnabled: settings?.enabled ?? true,
    kollegenPraemie:
      settings?.rewardKind === "fixed" && settings.rewardFixed != null ? Number(settings.rewardFixed) : customer?.retainerMonthly != null ? Number(customer.retainerMonthly) : null,
    bestandImported: imported > 0,
    bestandCampaigns: campaigns,
    withoutCrossSell: withoutCross,
    missingPremium,
    withoutNextStep: steps?.withoutNextStep ?? 0,
    nextStepRate: steps?.rate ?? null,
    rates: {
      reach: rate(own.reachabilityRate, avg?.reachabilityRate),
      termin: rate(own.terminRate, avg?.terminRate),
      close: rate(own.closingFromTerminRate, avg?.closingFromTerminRate),
    },
  };
}

/** Monate seit Start beim Kunden (Abo-Start bzw. Konto angelegt). */
export async function monthsSinceStart(customerId: string, now = new Date()): Promise<number | null> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { createdAt: true, retainerStart: true, onboarding: { select: { startDate: true } } } }).catch(() => null);
  const start = c?.onboarding?.startDate ?? c?.retainerStart ?? c?.createdAt;
  return start ? Math.max(0, (now.getTime() - start.getTime()) / (30.44 * DAY)) : null;
}
