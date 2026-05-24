// Automatischer Facebook-Media-Buyer.
//
// Ziel: pro Kunde die gewünschte Lead-Menge im Monat liefern und zum
// Monatsende eine Belieferungsquote von möglichst 100 % erreichen — ohne
// teure Überlieferung. Der Lauf ist idempotent pro Tag gedacht (einmal
// täglich per Cron) und arbeitet mit drei Hebeln:
//   1. Tagesbudget anpassen (primär)
//   2. Kampagne pausieren (Ziel erreicht) / reaktivieren (hinterher)
//   3. Endspurt-Boost in den letzten Tagen, wenn die Quote zu kippen droht
//
// Sicherheits-Guardrails (alle über Env überschreibbar):
//   MEDIA_BUYER_MIN_DAILY_BUDGET  Untergrenze Tagesbudget (EUR, default 5)
//   MEDIA_BUYER_MAX_DAILY_BUDGET  Obergrenze, falls Kunde keine eigene hat (EUR, default 200)
//   MEDIA_BUYER_MAX_STEP          Max. relative Budget-Änderung pro Lauf (default 0.5 = ±50 %)
//   MEDIA_BUYER_BOOST_DAYS        Länge des Endspurt-Fensters in Tagen (default 5)

import {
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  startOfMonth,
} from "date-fns";
import { computeKpis, type Kpis } from "@/lib/kpis";
import {
  findCampaignsByKeyword,
  getCampaignBudgetState,
  listCampaigns,
  setCampaignDailyBudget,
  setCampaignStatus,
  type CampaignBudgetState,
  type MetaCampaign,
} from "@/lib/meta-ads";
import { prisma } from "@/lib/prisma";
import { sendToAdmins } from "@/lib/push";

export type BuyerAction =
  | "increase"
  | "decrease"
  | "pause"
  | "activate"
  | "boost"
  | "none";

export type CustomerBuyerResult = {
  customerId: string;
  customerName: string;
  leadsMtd: number;
  goal: number;
  projected: number;
  daysElapsed: number;
  daysTotal: number;
  action: BuyerAction;
  reason: string;
  prevBudget: number | null;
  newBudget: number | null;
  campaigns: string[];
  error?: string;
};

export type MediaBuyerRunResult = {
  ranAt: Date;
  dryRun: boolean;
  customers: CustomerBuyerResult[];
};

function envNum(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function decToNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const obj = v as { toNumber?: () => number };
  if (typeof obj.toNumber === "function") return obj.toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

const eur = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

type Decision = {
  action: BuyerAction;
  reason: string;
  // Ziel-Gesamtbudget in EUR. null = Budget nicht ändern.
  targetBudget: number | null;
  // Kampagnen pausieren bzw. reaktivieren.
  setStatus: "ACTIVE" | "PAUSED" | null;
};

// Reine Entscheidungslogik (ohne Seiteneffekte) — so testbar.
export function decideBudget(params: {
  leadsMtd: number;
  goal: number;
  daysElapsed: number;
  daysTotal: number;
  currentBudget: number;
  costPerLead: number | null;
  minBudget: number;
  maxBudget: number;
  maxStep: number;
  boostDays: number;
  anyPaused: boolean;
}): Decision {
  const {
    leadsMtd,
    goal,
    daysElapsed,
    daysTotal,
    currentBudget,
    costPerLead,
    minBudget,
    maxBudget,
    maxStep,
    boostDays,
    anyPaused,
  } = params;

  const projected =
    daysElapsed > 0 ? Math.round((leadsMtd / daysElapsed) * daysTotal) : 0;
  const daysLeft = Math.max(1, daysTotal - daysElapsed + 1);
  const inBoostWindow = daysTotal - daysElapsed + 1 <= boostDays;

  // Ziel erreicht → Geld sparen, Kampagnen pausieren.
  if (leadsMtd >= goal) {
    return {
      action: "pause",
      reason: `Ziel erreicht (${leadsMtd}/${goal}). Kampagnen werden pausiert, um Überlieferung zu vermeiden.`,
      targetBudget: null,
      setStatus: "PAUSED",
    };
  }

  const remaining = goal - leadsMtd;
  const requiredPerDay = remaining / daysLeft;

  // Ohne CPL (noch keine Leads / kein Spend) lässt sich kein Zielbudget
  // ableiten. Dann nur sicherstellen, dass die Kampagnen überhaupt laufen.
  if (costPerLead == null || costPerLead <= 0) {
    if (anyPaused) {
      return {
        action: "activate",
        reason: `Noch keine Lead-Kosten messbar, aber Kampagnen pausiert und ${remaining} Leads offen — reaktivieren.`,
        targetBudget: currentBudget > 0 ? currentBudget : minBudget,
        setStatus: "ACTIVE",
      };
    }
    return {
      action: "none",
      reason: `Noch keine Cost-per-Lead messbar — Budget unverändert (${remaining} Leads offen).`,
      targetBudget: null,
      setStatus: null,
    };
  }

  const requiredBudgetRaw = requiredPerDay * costPerLead;

  // Endspurt: Quote droht zu kippen → ohne Step-Limit bis Max hochziehen.
  if (inBoostWindow && projected < goal) {
    const target = clamp(requiredBudgetRaw, minBudget, maxBudget);
    return {
      action: "boost",
      reason: `Endspurt (${daysLeft} Tage übrig, Prognose ${projected}/${goal}). Budget auf ${eur.format(target)}/Tag, um ${remaining} fehlende Leads zu liefern.`,
      targetBudget: target,
      setStatus: anyPaused ? "ACTIVE" : null,
    };
  }

  // Normaler Betrieb: Zielbudget mit Step-Limit annähern.
  const stepLow = currentBudget > 0 ? currentBudget * (1 - maxStep) : minBudget;
  const stepHigh =
    currentBudget > 0 ? currentBudget * (1 + maxStep) : maxBudget;
  const target = clamp(
    clamp(requiredBudgetRaw, stepLow, stepHigh),
    minBudget,
    maxBudget,
  );

  // Reaktivieren falls pausiert und noch Leads offen.
  if (anyPaused) {
    return {
      action: "activate",
      reason: `Kampagnen pausiert, aber ${remaining} Leads offen (Prognose ${projected}/${goal}). Reaktivieren mit ${eur.format(target)}/Tag.`,
      targetBudget: target,
      setStatus: "ACTIVE",
    };
  }

  // Innerhalb ±5 % keine Änderung — vermeidet Mikro-Anpassungen.
  if (currentBudget > 0 && Math.abs(target - currentBudget) / currentBudget < 0.05) {
    return {
      action: "none",
      reason: `Auf Kurs (Prognose ${projected}/${goal}, Budget ${eur.format(currentBudget)}/Tag).`,
      targetBudget: null,
      setStatus: null,
    };
  }

  if (target > currentBudget) {
    return {
      action: "increase",
      reason: `Hinterher (Prognose ${projected}/${goal}). Budget ${eur.format(currentBudget)} → ${eur.format(target)}/Tag.`,
      targetBudget: target,
      setStatus: null,
    };
  }
  return {
    action: "decrease",
    reason: `Überlieferung droht (Prognose ${projected}/${goal}). Budget ${eur.format(currentBudget)} → ${eur.format(target)}/Tag.`,
    targetBudget: target,
    setStatus: null,
  };
}

async function processCustomer(
  customer: {
    id: string;
    name: string;
    monthlyLeadGoal: number | null;
    campaignKeyword: string | null;
    maxDailyBudget: unknown;
  },
  ctx: {
    campaigns: MetaCampaign[];
    monthStart: Date;
    mtdEnd: Date;
    daysElapsed: number;
    daysTotal: number;
    minBudget: number;
    defaultMaxBudget: number;
    maxStep: number;
    boostDays: number;
    dryRun: boolean;
  },
): Promise<CustomerBuyerResult> {
  const goal = customer.monthlyLeadGoal ?? 0;
  const keyword = (customer.campaignKeyword ?? customer.name).trim();
  const maxBudget = decToNumber(customer.maxDailyBudget) ?? ctx.defaultMaxBudget;

  const base: CustomerBuyerResult = {
    customerId: customer.id,
    customerName: customer.name,
    leadsMtd: 0,
    goal,
    projected: 0,
    daysElapsed: ctx.daysElapsed,
    daysTotal: ctx.daysTotal,
    action: "none",
    reason: "",
    prevBudget: null,
    newBudget: null,
    campaigns: [],
  };

  try {
    const kpis = (await computeKpis({
      range: { from: ctx.monthStart, to: ctx.mtdEnd },
      customerId: customer.id,
      product: null,
    })) as Kpis;
    const leadsMtd = kpis.totalLeads;
    const costPerLead =
      leadsMtd > 0 && kpis.leadCosts > 0 ? kpis.leadCosts / leadsMtd : null;
    const projected =
      ctx.daysElapsed > 0
        ? Math.round((leadsMtd / ctx.daysElapsed) * ctx.daysTotal)
        : 0;

    base.leadsMtd = leadsMtd;
    base.projected = projected;

    const matched = findCampaignsByKeyword(ctx.campaigns, keyword);
    base.campaigns = matched.map((c) => c.name);

    if (matched.length === 0) {
      base.reason = `Keine Meta-Kampagne mit Keyword "${keyword}" gefunden.`;
      base.error = base.reason;
      return base;
    }

    const states: CampaignBudgetState[] = [];
    for (const c of matched) states.push(await getCampaignBudgetState(c));
    const controllable = states.filter((s) => s.level !== "none");

    if (controllable.length === 0) {
      base.reason = `Kampagnen gefunden (${base.campaigns.join(", ")}), aber kein steuerbares Tagesbudget (vermutlich Lifetime-Budget) — keine Budget-Steuerung möglich.`;
      base.error = base.reason;
      return base;
    }

    const currentBudget = controllable.reduce(
      (s, c) => s + c.dailyBudgetEur,
      0,
    );
    const anyPaused = states.some(
      (s) => s.effective_status !== "ACTIVE" && s.status !== "ACTIVE",
    );

    base.prevBudget = currentBudget;

    const decision = decideBudget({
      leadsMtd,
      goal,
      daysElapsed: ctx.daysElapsed,
      daysTotal: ctx.daysTotal,
      currentBudget,
      costPerLead,
      minBudget: ctx.minBudget,
      maxBudget,
      maxStep: ctx.maxStep,
      boostDays: ctx.boostDays,
      anyPaused,
    });

    base.action = decision.action;
    base.reason = decision.reason;

    if (ctx.dryRun) return base;

    // Status-Änderung (pause/activate) auf alle gematchten Kampagnen.
    if (decision.setStatus) {
      for (const s of states) {
        await setCampaignStatus(s.campaignId, decision.setStatus);
      }
    }

    // Budget-Änderung: Zielsumme gleichmäßig auf steuerbare Kampagnen verteilen.
    if (decision.targetBudget != null && controllable.length > 0) {
      const per = decision.targetBudget / controllable.length;
      for (const s of controllable) await setCampaignDailyBudget(s, per);
      base.newBudget = decision.targetBudget;
    }

    return base;
  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err);
    base.reason = `Fehler: ${base.error}`;
    return base;
  }
}

export async function runMediaBuyer(params: {
  now?: Date;
  dryRun?: boolean;
} = {}): Promise<MediaBuyerRunResult> {
  const now = params.now ?? new Date();
  const dryRun = params.dryRun ?? false;

  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const mtdEnd = endOfDay(now);
  const daysElapsed = Math.max(1, differenceInCalendarDays(now, monthStart) + 1);
  const daysTotal = differenceInCalendarDays(monthEnd, monthStart) + 1;

  const customers = await prisma.customer.findMany({
    where: { autopilot: true, monthlyLeadGoal: { not: null } },
    select: {
      id: true,
      name: true,
      monthlyLeadGoal: true,
      campaignKeyword: true,
      maxDailyBudget: true,
    },
    orderBy: { name: "asc" },
  });

  const results: CustomerBuyerResult[] = [];

  if (customers.length === 0) {
    return { ranAt: now, dryRun, customers: results };
  }

  // Kampagnen einmal laden und für alle Kunden wiederverwenden.
  let campaigns: MetaCampaign[];
  try {
    campaigns = await listCampaigns();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    for (const c of customers) {
      results.push({
        customerId: c.id,
        customerName: c.name,
        leadsMtd: 0,
        goal: c.monthlyLeadGoal ?? 0,
        projected: 0,
        daysElapsed,
        daysTotal,
        action: "none",
        reason: `Meta-API nicht erreichbar: ${msg}`,
        prevBudget: null,
        newBudget: null,
        campaigns: [],
        error: msg,
      });
    }
    await persistAndNotify(results, dryRun);
    return { ranAt: now, dryRun, customers: results };
  }

  const ctx = {
    campaigns,
    monthStart,
    mtdEnd,
    daysElapsed,
    daysTotal,
    minBudget: envNum("MEDIA_BUYER_MIN_DAILY_BUDGET", 5),
    defaultMaxBudget: envNum("MEDIA_BUYER_MAX_DAILY_BUDGET", 200),
    maxStep: envNum("MEDIA_BUYER_MAX_STEP", 0.5),
    boostDays: envNum("MEDIA_BUYER_BOOST_DAYS", 5),
    dryRun,
  };

  for (const customer of customers) {
    results.push(await processCustomer(customer, ctx));
  }

  await persistAndNotify(results, dryRun);
  return { ranAt: now, dryRun, customers: results };
}

async function persistAndNotify(
  results: CustomerBuyerResult[],
  dryRun: boolean,
): Promise<void> {
  for (const r of results) {
    await prisma.mediaBuyerAction.create({
      data: {
        customerId: r.customerId,
        action: r.action,
        reason: r.reason,
        leadsMtd: r.leadsMtd,
        leadsGoal: r.goal,
        projected: r.projected,
        daysElapsed: r.daysElapsed,
        daysTotal: r.daysTotal,
        prevBudget: r.prevBudget,
        newBudget: r.newBudget,
        campaigns: r.campaigns.length > 0 ? r.campaigns.join(", ") : null,
        dryRun,
        errorMessage: r.error ?? null,
      },
    });
  }

  if (dryRun) return;

  // Admins über alles informieren, was nicht "keine Änderung" war.
  const notable = results.filter(
    (r) => r.action !== "none" || r.error,
  );
  for (const r of notable) {
    const icon = r.error
      ? "⚠️"
      : r.action === "pause"
        ? "⏸️"
        : r.action === "boost"
          ? "🚀"
          : r.action === "increase" || r.action === "activate"
            ? "📈"
            : "📉";
    await sendToAdmins({
      title: `${icon} Media Buyer: ${r.customerName}`,
      body: r.reason.slice(0, 160),
      tag: `media-buyer:${r.customerId}`,
      url: "/admin/media-buyer",
    });
  }
}
