// Automatischer Facebook-Media-Buyer.
//
// Gesteuert wird je (Kunde × Produkt) — die Lead-Ziele kommen produkt-
// getrennt (Wechsel/Neugeschäft) aus Airtable. Ziel: die gewünschte
// Lead-Menge im Monat liefern und zum Monatsende eine Belieferungsquote von
// möglichst 100 % erreichen — ohne teure Überlieferung. Der Lauf ist
// idempotent pro Tag gedacht (einmal täglich per Cron) und arbeitet mit
// drei Hebeln:
//   1. Tagesbudget anpassen (primär)
//   2. Kampagne pausieren (Ziel erreicht) / reaktivieren (hinterher)
//   3. Endspurt-Boost in den letzten Tagen, wenn die Quote zu kippen droht
//
// Sicherheits-Guardrails (alle über Env überschreibbar):
//   MEDIA_BUYER_MIN_DAILY_BUDGET  Untergrenze Tagesbudget (EUR, default 5)
//   MEDIA_BUYER_MAX_DAILY_BUDGET  Obergrenze, falls Kunde keine eigene hat (EUR, default 200)
//   MEDIA_BUYER_MAX_STEP          Max. relative Budget-Änderung pro Lauf (default 0.5 = ±50 %)
//   MEDIA_BUYER_BOOST_DAYS        Länge des Endspurt-Fensters in Tagen (default 5)
//   MEDIA_BUYER_PRECISION_DAYS    Präzisions-Fenster am Monatsende (default 3):
//                                 Step-Limit & Totzone aus, niedrigere Budget-
//                                 Untergrenze, vorausschauendes Pausieren.
//   MEDIA_BUYER_PRECISION_MIN_BUDGET  Budget-Untergrenze im Präzisions-Fenster (default 1)
//   MEDIA_BUYER_NORMAL_INTERVAL_HOURS Drosselung im Normalbetrieb (default 12):
//                                     außerhalb des Präzisions-Fensters höchstens
//                                     alle X h nachsteuern, auch bei stündlichem
//                                     Cron. So reicht EIN fester stündlicher Cron.
//   MEDIA_BUYER_RUN_INTERVAL_HOURS    Optionaler Override für die Stunden bis
//                                     zum nächsten Lauf. Ohne Wert wird das
//                                     Intervall automatisch aus den letzten
//                                     echten Läufen abgeleitet (passt sich an
//                                     Cron-Frequenz-Änderungen selbst an).

import {
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  startOfMonth,
} from "date-fns";
import { classifyProduct } from "@/lib/meta";
import {
  findCampaignsByKeyword,
  getCampaignBudgetState,
  getMonthlySpendByCampaign,
  listCampaigns,
  setCampaignDailyBudget,
  setCampaignStatus,
  type CampaignBudgetState,
  type MetaCampaign,
} from "@/lib/meta-ads";
import {
  findCampaignsByKeyword as findOutbrainCampaignsByKeyword,
  getMonthlySpendByCampaign as getOutbrainMonthlySpendByCampaign,
  listCampaigns as listOutbrainCampaigns,
  type OutbrainCampaign,
} from "@/lib/outbrain-ads";
import { prisma } from "@/lib/prisma";
import { sendToAdmins } from "@/lib/push";

export type BuyerAction =
  | "increase"
  | "decrease"
  | "pause"
  | "activate"
  | "boost"
  | "none";

// Ein Steuer-Ergebnis je Liefer-Pool.
export type PoolResult = {
  poolKey: string;
  poolLabel: string;
  kind: "product" | "region";
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
  // Channel-Breakdown (Phase 1: nur Beobachtung, keine Outbrain-Steuerung).
  metaLeadsMtd: number;
  metaSpendMtd: number;
  metaCpl: number | null;
  outbrainLeadsMtd: number;
  outbrainSpendMtd: number;
  outbrainCpl: number | null;
  error?: string;
};

export type MediaBuyerRunResult = {
  ranAt: Date;
  dryRun: boolean;
  pools: PoolResult[];
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

// Cost-per-Lead mit Cent-Genauigkeit (Budgets runden wir, CPL nicht).
const cplFmt = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
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
  // Präzisions-Endspurt: in den letzten Tagen fein landen.
  precisionDays: number;
  // Niedrigere Budget-Untergrenze im Präzisions-Fenster (Meta-Minimum).
  precisionMinBudget: number;
  // Stunden bis zum nächsten Lauf — für vorausschauendes Pausieren.
  lookAheadHours: number;
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
    precisionDays,
    precisionMinBudget,
    lookAheadHours,
  } = params;

  const projected =
    daysElapsed > 0 ? Math.round((leadsMtd / daysElapsed) * daysTotal) : 0;
  const daysLeft = Math.max(1, daysTotal - daysElapsed + 1);
  const inBoostWindow = daysTotal - daysElapsed + 1 <= boostDays;
  const precisionMode = daysTotal - daysElapsed + 1 <= precisionDays;
  // Im Präzisions-Fenster gilt eine niedrigere Budget-Untergrenze, damit das
  // Budget für die letzten Leads exakt heruntergefahren werden kann.
  const effMinBudget = precisionMode ? precisionMinBudget : minBudget;

  // Ziel erreicht → Geld sparen, Kampagnen pausieren.
  if (leadsMtd >= goal) {
    return {
      action: "pause",
      reason: `Ziel erreicht (${leadsMtd}/${goal}). Meta-Kampagnen werden pausiert, um Überlieferung zu vermeiden.`,
      targetBudget: null,
      setStatus: "PAUSED",
    };
  }

  // Präzisions-Endspurt: vorausschauend pausieren, wenn das Ziel schon VOR dem
  // nächsten Lauf erreicht würde (sonst überschießt die letzte Tagesportion).
  if (
    precisionMode &&
    costPerLead != null &&
    costPerLead > 0 &&
    currentBudget > 0
  ) {
    const leadsBeforeNextRun =
      (currentBudget / costPerLead) * (lookAheadHours / 24);
    if (leadsMtd + leadsBeforeNextRun >= goal) {
      return {
        action: "pause",
        reason: `Endspurt: Ziel wird vor dem nächsten Lauf erreicht (${leadsMtd} + ~${leadsBeforeNextRun.toFixed(1)} erwartet ≥ ${goal}). Meta-Kampagnen pausieren, um exakt zu landen.`,
        targetBudget: null,
        setStatus: "PAUSED",
      };
    }
  }

  const remaining = goal - leadsMtd;
  const requiredPerDay = remaining / daysLeft;

  // Ohne CPL (noch keine Leads / kein Spend) lässt sich kein Zielbudget
  // ableiten. Dann nur sicherstellen, dass die Kampagnen überhaupt laufen.
  if (costPerLead == null || costPerLead <= 0) {
    if (anyPaused) {
      return {
        action: "activate",
        reason: `Noch keine Meta-Lead-Kosten messbar, aber Meta-Kampagnen pausiert und ${remaining} Leads offen — reaktivieren.`,
        targetBudget: currentBudget > 0 ? currentBudget : effMinBudget,
        setStatus: "ACTIVE",
      };
    }
    return {
      action: "none",
      reason: `Noch keine Meta-Cost-per-Lead messbar — Meta-Budget unverändert (${remaining} Leads offen).`,
      targetBudget: null,
      setStatus: null,
    };
  }

  const requiredBudgetRaw = requiredPerDay * costPerLead;

  // Endspurt: Quote droht zu kippen → ohne Step-Limit bis Max hochziehen.
  if (inBoostWindow && projected < goal) {
    const target = clamp(requiredBudgetRaw, effMinBudget, maxBudget);
    return {
      action: "boost",
      reason: `Endspurt (${daysLeft} Tage übrig, Prognose ${projected}/${goal}). Meta-Budget auf ${eur.format(target)}/Tag für ${remaining} fehlende Leads (≈ ${requiredPerDay.toFixed(1)} Leads/Tag bei kalk. ${cplFmt.format(costPerLead)}/Meta-Lead).`,
      targetBudget: target,
      setStatus: anyPaused ? "ACTIVE" : null,
    };
  }

  // Zielbudget bestimmen. Im Präzisions-Fenster ohne Step-Limit (exaktes
  // Heran-Tarieren), sonst mit Step-Limit gegen ruckartige Sprünge.
  const stepLow = currentBudget > 0 ? currentBudget * (1 - maxStep) : effMinBudget;
  const stepHigh =
    currentBudget > 0 ? currentBudget * (1 + maxStep) : maxBudget;
  const target = precisionMode
    ? clamp(requiredBudgetRaw, effMinBudget, maxBudget)
    : clamp(clamp(requiredBudgetRaw, stepLow, stepHigh), effMinBudget, maxBudget);

  // Reaktivieren falls pausiert und noch Leads offen.
  if (anyPaused) {
    return {
      action: "activate",
      reason: `Meta-Kampagnen pausiert, aber ${remaining} Leads offen (Prognose ${projected}/${goal}). Meta reaktivieren mit ${eur.format(target)}/Tag (≈ ${requiredPerDay.toFixed(1)} Leads/Tag bei kalk. ${cplFmt.format(costPerLead)}/Meta-Lead).`,
      targetBudget: target,
      setStatus: "ACTIVE",
    };
  }

  // Außerhalb des Präzisions-Fensters: innerhalb ±5 % keine Änderung
  // (vermeidet Mikro-Anpassungen). Im Endspurt tarieren wir dagegen fein.
  if (
    !precisionMode &&
    currentBudget > 0 &&
    Math.abs(target - currentBudget) / currentBudget < 0.05
  ) {
    return {
      action: "none",
      reason: `Auf Kurs (Prognose ${projected}/${goal}, Meta-Budget ${eur.format(currentBudget)}/Tag).`,
      targetBudget: null,
      setStatus: null,
    };
  }

  if (target > currentBudget) {
    return {
      action: "increase",
      reason: `Hinterher (Prognose ${projected}/${goal}). Meta-Budget ${eur.format(currentBudget)} → ${eur.format(target)}/Tag (≈ ${requiredPerDay.toFixed(1)} Leads/Tag bei kalk. ${cplFmt.format(costPerLead)}/Meta-Lead).`,
      targetBudget: target,
      setStatus: null,
    };
  }
  return {
    action: "decrease",
    reason: `Überlieferung droht (Prognose ${projected}/${goal}). Meta-Budget ${eur.format(currentBudget)} → ${eur.format(target)}/Tag (kalk. ${cplFmt.format(costPerLead)}/Meta-Lead).`,
    targetBudget: target,
    setStatus: null,
  };
}

// ─── Pool-Ableitung ──────────────────────────────────────────────────

// Definition eines Liefer-Pools, abgeleitet aus den Kundendaten.
type PoolDef = {
  key: string;
  label: string;
  kind: "product" | "region";
  product: string; // Lead.source: "Wechsel" | "Neugeschäft" | "Kinderwunsch"
  region: string | null;
  goal: number; // Summe der Kunden-Ziele dieses Pools
  // Kunden, deren Leads in diesen Pool zählen. null = alle (PKV: nur nach
  // Produkt gefiltert), sonst die Kunden der Region.
  customerIds: string[] | null;
};

function isKinderwunschCampaign(name: string): boolean {
  return /kinderwunsch|kiwu/i.test(name);
}

// Effektives Monatsziel bei Mid-Month-Onboarding (Spiegel des Airtable-Feldes
// „Effektives Leadziel"): startet ein Kunde mitten im Monat, wird das
// Monatsziel proportional zu den verbleibenden Tagen heruntergerechnet —
// sonst würde die d'Hondt-Verteilung & der Media Buyer das volle Monatsziel
// in den Restmonat pressen und Bestandskunden unterversorgen.
export function effectiveGoal(
  goal: number,
  startDate: Date | null | undefined,
  now: Date,
): number {
  if (!goal || goal <= 0) return 0;
  if (!startDate) return goal;
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  if (startDate <= monthStart) return goal;
  if (startDate > monthEnd) return 0;
  const daysInMonth = differenceInCalendarDays(monthEnd, monthStart) + 1;
  const daysActive = differenceInCalendarDays(monthEnd, startDate) + 1;
  return Math.max(0, Math.round((goal * daysActive) / daysInMonth));
}

// Leitet alle Pools aus den aktuellen Kundendaten ab.
export async function derivePoolDefs(now: Date = new Date()): Promise<PoolDef[]> {
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      leadGoalWechsel: true,
      leadGoalNeugeschaeft: true,
      leadGoalKinderwunsch: true,
      startWechsel: true,
      startNeugeschaeft: true,
      startKinderwunsch: true,
      region: true,
    },
  });

  const defs: PoolDef[] = [];

  // PKV: ein Pool je Produkt über alle Kunden. Kinderwunsch ist hier
  // bewusst ausgenommen — das läuft regionsbasiert (siehe unten).
  // Pool-Ziel = Σ Effektive Ziele (anteilig bei Mid-Month-Onboarding).
  const pkvGoals = { Wechsel: 0, Neugeschäft: 0 };
  for (const c of customers) {
    pkvGoals.Wechsel += effectiveGoal(c.leadGoalWechsel ?? 0, c.startWechsel, now);
    pkvGoals.Neugeschäft += effectiveGoal(
      c.leadGoalNeugeschaeft ?? 0,
      c.startNeugeschaeft,
      now,
    );
  }
  for (const product of ["Wechsel", "Neugeschäft"] as const) {
    const goal = pkvGoals[product];
    if (goal > 0) {
      defs.push({
        key: `product:${product}`,
        label: `PKV ${product}`,
        kind: "product",
        product,
        region: null,
        goal,
        customerIds: null,
      });
    }
  }

  // Kinderwunsch: ein Pool je Region (Region kommt vom Kunden).
  const byRegion = new Map<string, { ids: string[]; goal: number }>();
  for (const c of customers) {
    const goal = effectiveGoal(
      c.leadGoalKinderwunsch ?? 0,
      c.startKinderwunsch,
      now,
    );
    const region = c.region?.trim();
    if (goal > 0 && region) {
      const e = byRegion.get(region) ?? { ids: [], goal: 0 };
      e.ids.push(c.id);
      e.goal += goal;
      byRegion.set(region, e);
    }
  }
  for (const [region, e] of byRegion) {
    defs.push({
      key: `region:${region}`,
      label: `Kinderwunsch ${region}`,
      kind: "region",
      product: "Kinderwunsch",
      region,
      goal: e.goal,
      customerIds: e.ids,
    });
  }

  return defs;
}

type PoolSettings = {
  autopilot: boolean;
  maxDailyBudget: number | null;
  campaignKeyword: string | null;
  outbrainCampaignKeyword: string | null;
};

// Stellt sicher, dass für jeden abgeleiteten Pool eine DeliveryPool-Zeile
// existiert (Label aktuell halten), und liefert die Steuer-Einstellungen.
async function ensurePool(def: PoolDef): Promise<PoolSettings> {
  const pool = await prisma.deliveryPool.upsert({
    where: { key: def.key },
    create: {
      key: def.key,
      label: def.label,
      kind: def.kind,
      product: def.product,
      region: def.region,
    },
    update: { label: def.label, product: def.product, region: def.region },
    select: {
      autopilot: true,
      maxDailyBudget: true,
      campaignKeyword: true,
      outbrainCampaignKeyword: true,
    },
  });
  return {
    autopilot: pool.autopilot,
    maxDailyBudget: decToNumber(pool.maxDailyBudget),
    campaignKeyword: pool.campaignKeyword,
    outbrainCampaignKeyword: pool.outbrainCampaignKeyword,
  };
}

async function countPoolLeads(
  def: PoolDef,
  monthStart: Date,
  mtdEnd: Date,
  channel?: string,
): Promise<number> {
  const where: {
    source: string;
    createdAt: { gte: Date; lte: Date };
    customerId?: { in: string[] };
    adChannel?: string;
  } = { source: def.product, createdAt: { gte: monthStart, lte: mtdEnd } };
  if (def.customerIds) {
    if (def.customerIds.length === 0) return 0;
    where.customerId = { in: def.customerIds };
  }
  if (channel) where.adChannel = channel;
  return prisma.lead.count({ where });
}

function matchPoolCampaigns(
  def: PoolDef,
  campaigns: MetaCampaign[],
  keywordOverride: string | null,
): MetaCampaign[] {
  if (keywordOverride && keywordOverride.trim()) {
    return findCampaignsByKeyword(campaigns, keywordOverride);
  }
  if (def.kind === "product") {
    return campaigns.filter((c) => classifyProduct(c.name) === def.product);
  }
  // Region-Pool: Kinderwunsch-Kampagne, deren Name die Region enthält.
  const region = def.region!.toLowerCase();
  return campaigns.filter(
    (c) =>
      isKinderwunschCampaign(c.name) && c.name.toLowerCase().includes(region),
  );
}

// ─── Pool-Steuerung ──────────────────────────────────────────────────

type RunCtx = {
  campaigns: MetaCampaign[];
  spendByCampaign: Map<string, number>;
  // Outbrain-Pendant — Phase 1: nur lesen, kein Steuern.
  outbrainCampaigns: OutbrainCampaign[];
  outbrainSpendByCampaign: Map<string, number>;
  monthStart: Date;
  mtdEnd: Date;
  daysElapsed: number;
  daysTotal: number;
  minBudget: number;
  defaultMaxBudget: number;
  maxStep: number;
  boostDays: number;
  precisionDays: number;
  precisionMinBudget: number;
  lookAheadHours: number;
  dryRun: boolean;
};

function matchOutbrainPoolCampaigns(
  def: PoolDef,
  campaigns: OutbrainCampaign[],
  keywordOverride: string | null,
): OutbrainCampaign[] {
  if (keywordOverride && keywordOverride.trim()) {
    return findOutbrainCampaignsByKeyword(campaigns, keywordOverride);
  }
  // Ohne explizites Keyword versuchen wir den Produktnamen — bei Region-
  // Pools zusätzlich den Region-Namen. Outbrain-Naming ist oft anders als
  // Meta, deshalb ist das Override-Feld in der Praxis wichtiger.
  if (def.kind === "product") {
    const p = def.product.toLowerCase();
    return campaigns.filter((c) => c.name.toLowerCase().includes(p));
  }
  const region = def.region!.toLowerCase();
  return campaigns.filter((c) => c.name.toLowerCase().includes(region));
}

async function processPool(
  def: PoolDef,
  settings: PoolSettings,
  ctx: RunCtx,
): Promise<PoolResult> {
  const maxBudget = settings.maxDailyBudget ?? ctx.defaultMaxBudget;

  const base: PoolResult = {
    poolKey: def.key,
    poolLabel: def.label,
    kind: def.kind,
    leadsMtd: 0,
    goal: def.goal,
    projected: 0,
    daysElapsed: ctx.daysElapsed,
    daysTotal: ctx.daysTotal,
    action: "none",
    reason: "",
    prevBudget: null,
    newBudget: null,
    campaigns: [],
    metaLeadsMtd: 0,
    metaSpendMtd: 0,
    metaCpl: null,
    outbrainLeadsMtd: 0,
    outbrainSpendMtd: 0,
    outbrainCpl: null,
  };

  try {
    // Pool-Leads = Brutto inkl. beider Channels — d'Hondt-Verteilung & Pool-
    // Pacing arbeiten kanal-agnostisch.
    const leadsMtd = await countPoolLeads(def, ctx.monthStart, ctx.mtdEnd);
    const projected =
      ctx.daysElapsed > 0
        ? Math.round((leadsMtd / ctx.daysElapsed) * ctx.daysTotal)
        : 0;
    base.leadsMtd = leadsMtd;
    base.projected = projected;

    // Channel-Breakdown: getrennte Lead-Zähler und Spend aus den Cost-Tabellen
    // bzw. den Ad-APIs. Wird auch dann ausgewertet, wenn nur einer der beiden
    // Channels aktiv ist (der andere ist dann 0).
    const [metaLeadsMtd, outbrainLeadsMtd] = await Promise.all([
      countPoolLeads(def, ctx.monthStart, ctx.mtdEnd, "Meta"),
      countPoolLeads(def, ctx.monthStart, ctx.mtdEnd, "Outbrain"),
    ]);
    base.metaLeadsMtd = metaLeadsMtd;
    base.outbrainLeadsMtd = outbrainLeadsMtd;

    // Outbrain-Spend zuerst ausrechnen, ist immer rein lesend.
    const matchedOutbrain = matchOutbrainPoolCampaigns(
      def,
      ctx.outbrainCampaigns,
      settings.outbrainCampaignKeyword,
    );
    const outbrainSpend = matchedOutbrain.reduce(
      (s, c) => s + (ctx.outbrainSpendByCampaign.get(c.id) ?? 0),
      0,
    );
    base.outbrainSpendMtd = outbrainSpend;
    base.outbrainCpl =
      outbrainLeadsMtd > 0 && outbrainSpend > 0
        ? outbrainSpend / outbrainLeadsMtd
        : null;

    const matched = matchPoolCampaigns(
      def,
      ctx.campaigns,
      settings.campaignKeyword,
    );
    base.campaigns = matched.map((c) => c.name);

    if (matched.length === 0) {
      base.reason = `Keine passende Meta-Kampagne für Pool "${def.label}" gefunden.`;
      base.error = base.reason;
      return base;
    }

    const states: CampaignBudgetState[] = [];
    for (const c of matched) states.push(await getCampaignBudgetState(c));
    const controllable = states.filter((s) => s.level !== "none");

    if (controllable.length === 0) {
      base.reason = `Kampagnen gefunden (${base.campaigns.join(", ")}), aber kein steuerbares Tagesbudget (vermutlich Lifetime-Budget).`;
      base.error = base.reason;
      return base;
    }

    const currentBudget = controllable.reduce(
      (s, c) => s + c.dailyBudgetEur,
      0,
    );
    // Cost-per-Lead pro Channel: Meta CPL aus Meta-Spend / Meta-Leads,
    // Outbrain analog. Für die Decision-Logik nutzen wir den **Meta-CPL**,
    // weil wir in Phase 1 nur Meta steuern.
    const metaSpend = matched.reduce(
      (s, c) => s + (ctx.spendByCampaign.get(c.id) ?? 0),
      0,
    );
    base.metaSpendMtd = metaSpend;
    base.metaCpl =
      metaLeadsMtd > 0 && metaSpend > 0 ? metaSpend / metaLeadsMtd : null;
    // Fallback: wenn noch keine Channel-Attribution da ist (alte Leads ohne
    // adChannel), nutze Pool-Gesamtwerte als CPL-Quelle. Nur für die
    // Steuerlogik — Channel-Breakdown bleibt korrekt.
    const costPerLead =
      base.metaCpl ?? (leadsMtd > 0 && metaSpend > 0 ? metaSpend / leadsMtd : null);
    const anyPaused = states.some(
      (s) => s.effective_status !== "ACTIVE" && s.status !== "ACTIVE",
    );

    base.prevBudget = currentBudget;

    const decision = decideBudget({
      leadsMtd,
      goal: def.goal,
      daysElapsed: ctx.daysElapsed,
      daysTotal: ctx.daysTotal,
      currentBudget,
      costPerLead,
      minBudget: ctx.minBudget,
      maxBudget,
      maxStep: ctx.maxStep,
      boostDays: ctx.boostDays,
      anyPaused,
      precisionDays: ctx.precisionDays,
      precisionMinBudget: ctx.precisionMinBudget,
      lookAheadHours: ctx.lookAheadHours,
    });

    base.action = decision.action;
    base.reason = decision.reason;

    if (ctx.dryRun) return base;

    if (decision.setStatus) {
      for (const s of states) {
        await setCampaignStatus(s.campaignId, decision.setStatus);
      }
    }
    if (decision.targetBudget != null) {
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

// Stunden bis zum (vermutlich) nächsten Lauf — für das vorausschauende
// Pausieren. Reihenfolge: explizite Env-Override > automatisch aus dem
// Abstand der letzten echten (Nicht-Trockenlauf-)Läufe > Default 12.
// So passt sich das Pausieren automatisch an, wenn du die Cron-Frequenz
// änderst (z. B. im Endspurt auf stündlich), ohne Env anzufassen.
async function deriveLookAheadHours(now: Date): Promise<number> {
  const override = process.env.MEDIA_BUYER_RUN_INTERVAL_HOURS;
  if (override) {
    const n = Number(override);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const last = await prisma.mediaBuyerAction.findFirst({
    where: { dryRun: false },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (last) {
    const gapH = (now.getTime() - last.createdAt.getTime()) / 3_600_000;
    // Clamp gegen Ausreißer (z. B. erster Lauf nach langer Pause).
    return Math.min(36, Math.max(0.25, gapH));
  }
  return 12;
}

export async function runMediaBuyer(params: {
  now?: Date;
  dryRun?: boolean;
  // force = Drosselung im Normalbetrieb überspringen (für „Jetzt anwenden",
  // z. B. direkt nach dem Aktivieren des Autopiloten).
  force?: boolean;
} = {}): Promise<MediaBuyerRunResult> {
  const now = params.now ?? new Date();
  const dryRun = params.dryRun ?? false;
  const force = params.force ?? false;

  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const mtdEnd = endOfDay(now);
  const daysElapsed = Math.max(1, differenceInCalendarDays(now, monthStart) + 1);
  const daysTotal = differenceInCalendarDays(monthEnd, monthStart) + 1;

  const precisionDays = envNum("MEDIA_BUYER_PRECISION_DAYS", 3);
  const inPrecision = daysTotal - daysElapsed + 1 <= precisionDays;

  // Selbst-Drosselung: Der Endpoint darf beliebig oft (z. B. stündlich)
  // aufgerufen werden. Außerhalb des Präzisions-Fensters wird aber höchstens
  // alle MEDIA_BUYER_NORMAL_INTERVAL_HOURS Stunden wirklich nachgesteuert —
  // so bleibt der Normalbetrieb ruhig, der Endspurt aber engmaschig, ganz
  // ohne den Cron umstellen zu müssen. Trockenläufe sind nie gedrosselt.
  if (!dryRun && !inPrecision && !force) {
    const normalInterval = envNum("MEDIA_BUYER_NORMAL_INTERVAL_HOURS", 12);
    const last = await prisma.mediaBuyerAction.findFirst({
      where: { dryRun: false },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (last) {
      const gapH = (now.getTime() - last.createdAt.getTime()) / 3_600_000;
      if (gapH < normalInterval - 0.5) {
        // Noch zu früh — dieser Aufruf ist ein No-Op (nichts an Meta, kein Log).
        return { ranAt: now, dryRun, pools: [] };
      }
    }
  }

  const defs = await derivePoolDefs(now);

  // Alle Pools anlegen/aktualisieren (auch ohne Autopilot, fürs Admin).
  const settingsByKey = new Map<string, PoolSettings>();
  for (const def of defs) settingsByKey.set(def.key, await ensurePool(def));

  // Live: nur Autopilot-Pools steuern. Trockenlauf: alle simulieren.
  const toProcess = defs.filter(
    (d) => dryRun || settingsByKey.get(d.key)?.autopilot,
  );

  const pools: PoolResult[] = [];
  if (toProcess.length === 0) {
    return { ranAt: now, dryRun, pools };
  }

  let campaigns: MetaCampaign[];
  let spendByCampaign: Map<string, number>;
  try {
    [campaigns, spendByCampaign] = await Promise.all([
      listCampaigns(),
      getMonthlySpendByCampaign(now),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    for (const def of toProcess) {
      pools.push({
        poolKey: def.key,
        poolLabel: def.label,
        kind: def.kind,
        leadsMtd: 0,
        goal: def.goal,
        projected: 0,
        daysElapsed,
        daysTotal,
        action: "none",
        reason: `Meta-API nicht erreichbar: ${msg}`,
        prevBudget: null,
        newBudget: null,
        campaigns: [],
        metaLeadsMtd: 0,
        metaSpendMtd: 0,
        metaCpl: null,
        outbrainLeadsMtd: 0,
        outbrainSpendMtd: 0,
        outbrainCpl: null,
        error: msg,
      });
    }
    await persistAndNotify(pools, dryRun);
    return { ranAt: now, dryRun, pools };
  }

  // Outbrain ist read-only und optional: wenn nicht konfiguriert oder API
  // gerade zickt, läuft der Buyer mit leeren Listen weiter (Channel-Splits
  // sind dann 0, Meta-Steuerung bleibt unbeeinträchtigt).
  let outbrainCampaigns: OutbrainCampaign[] = [];
  let outbrainSpendByCampaign = new Map<string, number>();
  try {
    [outbrainCampaigns, outbrainSpendByCampaign] = await Promise.all([
      listOutbrainCampaigns(),
      getOutbrainMonthlySpendByCampaign(now),
    ]);
  } catch (err) {
    console.warn(
      "[media-buyer] Outbrain nicht erreichbar — Channel-Sicht fällt aus:",
      err instanceof Error ? err.message : err,
    );
  }

  const ctx: RunCtx = {
    campaigns,
    spendByCampaign,
    outbrainCampaigns,
    outbrainSpendByCampaign,
    monthStart,
    mtdEnd,
    daysElapsed,
    daysTotal,
    minBudget: envNum("MEDIA_BUYER_MIN_DAILY_BUDGET", 5),
    defaultMaxBudget: envNum("MEDIA_BUYER_MAX_DAILY_BUDGET", 200),
    maxStep: envNum("MEDIA_BUYER_MAX_STEP", 0.5),
    boostDays: envNum("MEDIA_BUYER_BOOST_DAYS", 5),
    precisionDays,
    precisionMinBudget: envNum("MEDIA_BUYER_PRECISION_MIN_BUDGET", 1),
    lookAheadHours: await deriveLookAheadHours(now),
    dryRun,
  };

  for (const def of toProcess) {
    pools.push(await processPool(def, settingsByKey.get(def.key)!, ctx));
  }

  await persistAndNotify(pools, dryRun);
  return { ranAt: now, dryRun, pools };
}

async function persistAndNotify(
  pools: PoolResult[],
  dryRun: boolean,
): Promise<void> {
  for (const r of pools) {
    await prisma.mediaBuyerAction.create({
      data: {
        poolKey: r.poolKey,
        poolLabel: r.poolLabel,
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

  const notable = pools.filter((r) => r.action !== "none" || r.error);
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
      title: `${icon} Media Buyer: ${r.poolLabel}`,
      body: r.reason.slice(0, 160),
      tag: `media-buyer:${r.poolKey}`,
      url: "/admin/media-buyer",
    });
  }
}

// ─── Admin-Anzeige ───────────────────────────────────────────────────

export type PoolAdminRow = {
  key: string;
  label: string;
  kind: "product" | "region";
  product: string;
  region: string | null;
  goal: number;
  leadsMtd: number;
  projected: number;
  daysElapsed: number;
  daysTotal: number;
  customerCount: number;
  autopilot: boolean;
  maxDailyBudget: number | null;
  campaignKeyword: string | null;
  outbrainCampaignKeyword: string | null;
  // Cost-per-Lead MTD (Pool-Aggregat; aus Cost-Tabelle, kein Meta-Call).
  cpl: number | null;
  // Channel-Split aus Lead.adChannel + Cost-Note-Prefix (Phase 1).
  metaLeadsMtd: number;
  metaSpendMtd: number;
  metaCpl: number | null;
  outbrainLeadsMtd: number;
  outbrainSpendMtd: number;
  outbrainCpl: number | null;
  // Letzte Entscheidung des Buyers für diesen Pool (für die Empfehlungs-Karte).
  latestAction: string | null;
  latestReason: string | null;
};

// Pools + aktuelle Ist-Leads + Pacing + letzte Entscheidung für die Admin-
// Seite. KEINE Meta-Aufrufe — alle Werte aus DB.
export async function listPoolsForAdmin(now: Date = new Date()): Promise<
  PoolAdminRow[]
> {
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const mtdEnd = endOfDay(now);
  const daysElapsed = Math.max(1, differenceInCalendarDays(now, monthStart) + 1);
  const daysTotal = differenceInCalendarDays(monthEnd, monthStart) + 1;

  const defs = await derivePoolDefs(now);
  // Kundenzahl pro Pool — für Produkt-Pools alle Kunden mit effektivem Ziel > 0
  // (Kunden, die diesen Monat tatsächlich beliefert werden); für Region-Pools
  // die Kunden der Region (aus def.customerIds). Mid-Month-Onboarder mit
  // Startdatum > Monatsende werden so nicht mitgezählt.
  const allCustomers = await prisma.customer.findMany({
    select: {
      leadGoalWechsel: true,
      leadGoalNeugeschaeft: true,
      leadGoalKinderwunsch: true,
      startWechsel: true,
      startNeugeschaeft: true,
      startKinderwunsch: true,
      region: true,
    },
  });
  const customerCountFor = (def: PoolDef): number => {
    if (def.kind === "region")
      return def.customerIds?.length ?? 0;
    if (def.product === "Wechsel")
      return allCustomers.filter(
        (c) => effectiveGoal(c.leadGoalWechsel ?? 0, c.startWechsel, now) > 0,
      ).length;
    if (def.product === "Neugeschäft")
      return allCustomers.filter(
        (c) =>
          effectiveGoal(c.leadGoalNeugeschaeft ?? 0, c.startNeugeschaeft, now) >
          0,
      ).length;
    return 0;
  };
  // Cost-per-Lead MTD pro Produkt: aus Cost (kind=LEAD, product=X, dieser Monat)
  // / leadsMtd. Channel-Split aus dem note-Prefix (Meta:/Outbrain:).
  const monthCostRows = await prisma.cost.findMany({
    where: { kind: "LEAD", occurredAt: { gte: monthStart, lte: mtdEnd } },
    select: { product: true, note: true, amount: true },
  });
  const costByProduct = new Map<string, number>();
  const metaCostByProduct = new Map<string, number>();
  const outbrainCostByProduct = new Map<string, number>();
  for (const c of monthCostRows) {
    if (!c.product) continue;
    const amount = decToNumber(c.amount) ?? 0;
    costByProduct.set(c.product, (costByProduct.get(c.product) ?? 0) + amount);
    const note = c.note ?? "";
    if (note.startsWith("Meta:")) {
      metaCostByProduct.set(
        c.product,
        (metaCostByProduct.get(c.product) ?? 0) + amount,
      );
    } else if (note.startsWith("Outbrain:")) {
      outbrainCostByProduct.set(
        c.product,
        (outbrainCostByProduct.get(c.product) ?? 0) + amount,
      );
    }
  }
  // Letzte Entscheidung pro Pool in einem Rutsch holen (vermeidet N+1).
  const latest = await prisma.mediaBuyerAction.findMany({
    where: { dryRun: false, poolKey: { in: defs.map((d) => d.key) } },
    orderBy: { createdAt: "desc" },
    distinct: ["poolKey"],
    select: { poolKey: true, action: true, reason: true },
  });
  const latestByKey = new Map(latest.map((l) => [l.poolKey, l]));

  const rows: PoolAdminRow[] = [];
  for (const def of defs) {
    const settings = await ensurePool(def);
    const [leadsMtd, metaLeadsMtd, outbrainLeadsMtd] = await Promise.all([
      countPoolLeads(def, monthStart, mtdEnd),
      countPoolLeads(def, monthStart, mtdEnd, "Meta"),
      countPoolLeads(def, monthStart, mtdEnd, "Outbrain"),
    ]);
    const projected = Math.round((leadsMtd / daysElapsed) * daysTotal);
    const last = latestByKey.get(def.key);
    const metaSpend = metaCostByProduct.get(def.product) ?? 0;
    const outbrainSpend = outbrainCostByProduct.get(def.product) ?? 0;
    rows.push({
      key: def.key,
      label: def.label,
      kind: def.kind,
      product: def.product,
      region: def.region,
      goal: def.goal,
      leadsMtd,
      projected,
      daysElapsed,
      daysTotal,
      customerCount: customerCountFor(def),
      autopilot: settings.autopilot,
      maxDailyBudget: settings.maxDailyBudget,
      campaignKeyword: settings.campaignKeyword,
      outbrainCampaignKeyword: settings.outbrainCampaignKeyword,
      cpl:
        def.kind === "product" && leadsMtd > 0
          ? (costByProduct.get(def.product) ?? 0) / leadsMtd
          : null,
      metaLeadsMtd,
      metaSpendMtd: metaSpend,
      metaCpl: metaLeadsMtd > 0 ? metaSpend / metaLeadsMtd : null,
      outbrainLeadsMtd,
      outbrainSpendMtd: outbrainSpend,
      outbrainCpl:
        outbrainLeadsMtd > 0 ? outbrainSpend / outbrainLeadsMtd : null,
      latestAction: last?.action ?? null,
      latestReason: last?.reason ?? null,
    });
  }
  return rows;
}
