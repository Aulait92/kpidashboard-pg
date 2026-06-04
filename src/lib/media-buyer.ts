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
  getSpendByCampaign,
  listCampaigns,
  setCampaignDailyBudget,
  setCampaignStatus,
  type CampaignBudgetState,
  type MetaCampaign,
} from "@/lib/meta-ads";
import {
  findCampaignsByKeyword as findOutbrainCampaignsByKeyword,
  getMonthlySpendByCampaign as getOutbrainMonthlySpendByCampaign,
  getSpendByCampaign as getOutbrainSpendByCampaign,
  listCampaigns as listOutbrainCampaigns,
  setCampaignDailyBudget as setOutbrainCampaignDailyBudget,
  setCampaignStatus as setOutbrainCampaignStatus,
  type OutbrainCampaign,
} from "@/lib/outbrain-ads";
import {
  findCampaignsByKeyword as findTikTokCampaignsByKeyword,
  getMonthlySpendByCampaign as getTikTokMonthlySpendByCampaign,
  getSpendByCampaign as getTikTokSpendByCampaign,
  listCampaigns as listTikTokCampaigns,
  setCampaignDailyBudget as setTikTokCampaignDailyBudget,
  setCampaignStatus as setTikTokCampaignStatus,
  type TikTokCampaign,
} from "@/lib/tiktok-ads";
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
  tiktokLeadsMtd: number;
  tiktokSpendMtd: number;
  tiktokCpl: number | null;
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
      reason: `Endspurt (${daysLeft} Tage übrig, Prognose ${projected}/${goal}). Meta-Budget auf ${eur.format(target)}/Tag für ${remaining} fehlende Leads (≈ ${requiredPerDay.toFixed(1)} Leads/Tag bei kalk. ${cplFmt.format(costPerLead)}/Lead (7-Tage-Schnitt)).`,
      targetBudget: target,
      setStatus: anyPaused ? "ACTIVE" : null,
    };
  }

  // Zielbudget bestimmen. Im Präzisions-Fenster ohne Step-Limit (exaktes
  // Heran-Tarieren), sonst mit Step-Limit gegen ruckartige Sprünge.
  const stepLow = currentBudget > 0 ? currentBudget * (1 - maxStep) : effMinBudget;
  const stepHigh =
    currentBudget > 0 ? currentBudget * (1 + maxStep) : maxBudget;
  // targetRaw = reines Math-Ziel innerhalb Min/Max — wird bei Reaktivierungen
  // und im Präzisions-Fenster genutzt (Step-Bremse hier nicht sinnvoll).
  const targetRaw = clamp(requiredBudgetRaw, effMinBudget, maxBudget);
  const target = precisionMode
    ? targetRaw
    : clamp(clamp(requiredBudgetRaw, stepLow, stepHigh), effMinBudget, maxBudget);

  // Reaktivieren falls pausiert und noch Leads offen. Step-Limit überspringen:
  // pausierte Kampagnen geben aktuell 0 € aus, das angezeigte „currentBudget"
  // ist nur der hinterlegte Wert — wir können direkt auf das Math-Ziel gehen,
  // statt erst künstlich auf 50 % des hinterlegten Werts zu klemmen.
  if (anyPaused) {
    return {
      action: "activate",
      reason: `Meta-Kampagnen pausiert, aber ${remaining} Leads offen (Prognose ${projected}/${goal}). Meta reaktivieren mit ${eur.format(targetRaw)}/Tag (≈ ${requiredPerDay.toFixed(1)} Leads/Tag bei kalk. ${cplFmt.format(costPerLead)}/Lead (7-Tage-Schnitt)).`,
      targetBudget: targetRaw,
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
      reason: `Hinterher (Prognose ${projected}/${goal}). Meta-Budget ${eur.format(currentBudget)} → ${eur.format(target)}/Tag (≈ ${requiredPerDay.toFixed(1)} Leads/Tag bei kalk. ${cplFmt.format(costPerLead)}/Lead (7-Tage-Schnitt)).`,
      targetBudget: target,
      setStatus: null,
    };
  }
  return {
    action: "decrease",
    reason: `Überlieferung droht (Prognose ${projected}/${goal}). Meta-Budget ${eur.format(currentBudget)} → ${eur.format(target)}/Tag (kalk. ${cplFmt.format(costPerLead)}/Lead (7-Tage-Schnitt)).`,
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
  // maxDailyBudget = Meta-Cap (Historie); outbrain-/tiktokMaxDailyBudget separat.
  maxDailyBudget: number | null;
  outbrainMaxDailyBudget: number | null;
  tiktokMaxDailyBudget: number | null;
  campaignKeyword: string | null;
  outbrainCampaignKeyword: string | null;
  tiktokCampaignKeyword: string | null;
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
      outbrainMaxDailyBudget: true,
      tiktokMaxDailyBudget: true,
      campaignKeyword: true,
      outbrainCampaignKeyword: true,
      tiktokCampaignKeyword: true,
    },
  });
  return {
    autopilot: pool.autopilot,
    maxDailyBudget: decToNumber(pool.maxDailyBudget),
    outbrainMaxDailyBudget: decToNumber(pool.outbrainMaxDailyBudget),
    tiktokMaxDailyBudget: decToNumber(pool.tiktokMaxDailyBudget),
    campaignKeyword: pool.campaignKeyword,
    outbrainCampaignKeyword: pool.outbrainCampaignKeyword,
    tiktokCampaignKeyword: pool.tiktokCampaignKeyword,
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
  outbrainCampaigns: OutbrainCampaign[];
  outbrainSpendByCampaign: Map<string, number>;
  tiktokCampaigns: TikTokCampaign[];
  tiktokSpendByCampaign: Map<string, number>;
  // Rolling-Lookback-Spend für die CPL-Decision.
  recentSpendByCampaign: Map<string, number>;
  recentOutbrainSpendByCampaign: Map<string, number>;
  recentTiktokSpendByCampaign: Map<string, number>;
  recentSince: Date;
  monthStart: Date;
  mtdEnd: Date;
  daysElapsed: number;
  daysTotal: number;
  minBudget: number;
  defaultMaxBudget: number;
  outbrainMinBudget: number;
  outbrainDefaultMaxBudget: number;
  tiktokMinBudget: number;
  tiktokDefaultMaxBudget: number;
  maxStep: number;
  boostDays: number;
  precisionDays: number;
  precisionMinBudget: number;
  lookAheadHours: number;
  dryRun: boolean;
};

// Verteilt das Gesamt-Tagesbudget des Pools auf N Channels (Meta, Outbrain,
// TikTok). Strategie: inverse-CPL-Gewichtung — der günstigere Channel bekommt
// den größeren Anteil. Wenn ein Channel keine CPL-Historie hat, fällt's auf
// die aktuelle Budget-Verteilung zurück (oder gleichgewichtet, wenn auch das
// nicht da ist). Per-Channel Min/Max-Caps werden hart respektiert; Über-/
// Unterhang wandert auf die anderen verfügbaren Channels, soweit deren Caps
// das hergeben.
export type ChannelAllocation = {
  metaBudget: number;
  outbrainBudget: number;
  tiktokBudget: number;
};

export function allocateBudgetAcrossChannels(params: {
  target: number;
  metaCurrent: number;
  outbrainCurrent: number;
  tiktokCurrent: number;
  metaCpl: number | null;
  outbrainCpl: number | null;
  tiktokCpl: number | null;
  metaMin: number;
  metaMax: number;
  outbrainMin: number;
  outbrainMax: number;
  tiktokMin: number;
  tiktokMax: number;
  metaAvailable: boolean;
  outbrainAvailable: boolean;
  tiktokAvailable: boolean;
}): ChannelAllocation {
  const ch: {
    key: "meta" | "outbrain" | "tiktok";
    available: boolean;
    current: number;
    cpl: number | null;
    min: number;
    max: number;
  }[] = [
    {
      key: "meta",
      available: params.metaAvailable,
      current: params.metaCurrent,
      cpl: params.metaCpl,
      min: params.metaMin,
      max: params.metaMax,
    },
    {
      key: "outbrain",
      available: params.outbrainAvailable,
      current: params.outbrainCurrent,
      cpl: params.outbrainCpl,
      min: params.outbrainMin,
      max: params.outbrainMax,
    },
    {
      key: "tiktok",
      available: params.tiktokAvailable,
      current: params.tiktokCurrent,
      cpl: params.tiktokCpl,
      min: params.tiktokMin,
      max: params.tiktokMax,
    },
  ];
  const active = ch.filter((c) => c.available);
  const result: ChannelAllocation = {
    metaBudget: 0,
    outbrainBudget: 0,
    tiktokBudget: 0,
  };
  if (active.length === 0) return result;

  // Gewichte: wenn alle aktiven Channels einen CPL haben, inverse-CPL.
  // Wenn manche null sind: gleicher Anteil (Probe), wenn alle null:
  // proportional zum aktuellen Budget oder gleichgewichtet.
  const withCpl = active.filter((c) => c.cpl != null && c.cpl > 0);
  let shares = new Map<string, number>();
  if (withCpl.length === active.length) {
    const totalW = active.reduce((s, c) => s + 1 / (c.cpl as number), 0);
    for (const c of active) {
      shares.set(c.key, 1 / (c.cpl as number) / totalW);
    }
  } else if (withCpl.length > 0) {
    // Aktive mit CPL kriegen inverse-CPL-Anteil aus 80% des Topfes; die
    // ohne CPL teilen sich 20% (Probe-Budget zum Lernen).
    const probeShare = 0.2;
    const knownPart = 1 - probeShare;
    const totalW = withCpl.reduce((s, c) => s + 1 / (c.cpl as number), 0);
    for (const c of withCpl) {
      shares.set(c.key, (knownPart * 1) / (c.cpl as number) / totalW);
    }
    const unknown = active.filter((c) => !shares.has(c.key));
    for (const c of unknown) {
      shares.set(c.key, probeShare / unknown.length);
    }
  } else {
    // Niemand hat CPL → proportional zum aktuellen Budget, sonst gleich.
    const totalCurrent = active.reduce((s, c) => s + c.current, 0);
    if (totalCurrent > 0) {
      for (const c of active) shares.set(c.key, c.current / totalCurrent);
    } else {
      for (const c of active) shares.set(c.key, 1 / active.length);
    }
  }

  // Initial-Allokation und Min/Max-Clamp-Iteration. Mehrere Pässe, weil ein
  // Clamp auf einem Channel Überhang auf andere wirft und die neu clampen.
  const budgets = new Map<string, number>();
  for (const c of active) {
    budgets.set(c.key, params.target * (shares.get(c.key) ?? 0));
  }
  for (let pass = 0; pass < 4; pass++) {
    let overflow = 0;
    for (const c of active) {
      const raw = budgets.get(c.key) ?? 0;
      const clamped = clamp(raw, c.min, c.max);
      overflow += raw - clamped;
      budgets.set(c.key, clamped);
    }
    if (Math.abs(overflow) < 0.5) break;
    // Verteile overflow auf Channels mit Kapazität (raw < max bei pos
    // overflow, raw > min bei neg overflow).
    const eligible = active.filter((c) => {
      const v = budgets.get(c.key) ?? 0;
      return overflow > 0 ? v < c.max : v > c.min;
    });
    if (eligible.length === 0) break;
    const perChannel = overflow / eligible.length;
    for (const c of eligible) {
      budgets.set(c.key, (budgets.get(c.key) ?? 0) + perChannel);
    }
  }

  const round = (v: number) => Math.round(v * 100) / 100;
  result.metaBudget = round(budgets.get("meta") ?? 0);
  result.outbrainBudget = round(budgets.get("outbrain") ?? 0);
  result.tiktokBudget = round(budgets.get("tiktok") ?? 0);
  return result;
}

function matchOutbrainPoolCampaigns(
  def: PoolDef,
  campaigns: OutbrainCampaign[],
  keywordOverride: string | null,
): OutbrainCampaign[] {
  if (keywordOverride && keywordOverride.trim()) {
    return findOutbrainCampaignsByKeyword(campaigns, keywordOverride);
  }
  if (def.kind === "product") {
    const p = def.product.toLowerCase();
    return campaigns.filter((c) => c.name.toLowerCase().includes(p));
  }
  const region = def.region!.toLowerCase();
  return campaigns.filter((c) => c.name.toLowerCase().includes(region));
}

function matchTikTokPoolCampaigns(
  def: PoolDef,
  campaigns: TikTokCampaign[],
  keywordOverride: string | null,
): TikTokCampaign[] {
  if (keywordOverride && keywordOverride.trim()) {
    return findTikTokCampaignsByKeyword(campaigns, keywordOverride);
  }
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
    tiktokLeadsMtd: 0,
    tiktokSpendMtd: 0,
    tiktokCpl: null,
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
    // bzw. den Ad-APIs. Wird auch dann ausgewertet, wenn nur einer der drei
    // Channels aktiv ist (die anderen sind dann 0).
    const [metaLeadsMtd, outbrainLeadsMtd, tiktokLeadsMtd] = await Promise.all([
      countPoolLeads(def, ctx.monthStart, ctx.mtdEnd, "Meta"),
      countPoolLeads(def, ctx.monthStart, ctx.mtdEnd, "Outbrain"),
      countPoolLeads(def, ctx.monthStart, ctx.mtdEnd, "TikTok"),
    ]);
    base.metaLeadsMtd = metaLeadsMtd;
    base.outbrainLeadsMtd = outbrainLeadsMtd;
    base.tiktokLeadsMtd = tiktokLeadsMtd;

    // Outbrain- und TikTok-Spend ausrechnen.
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

    const matchedTikTok = matchTikTokPoolCampaigns(
      def,
      ctx.tiktokCampaigns,
      settings.tiktokCampaignKeyword,
    );
    const tiktokSpend = matchedTikTok.reduce(
      (s, c) => s + (ctx.tiktokSpendByCampaign.get(c.id) ?? 0),
      0,
    );
    base.tiktokSpendMtd = tiktokSpend;
    base.tiktokCpl =
      tiktokLeadsMtd > 0 && tiktokSpend > 0
        ? tiktokSpend / tiktokLeadsMtd
        : null;

    const matched = matchPoolCampaigns(
      def,
      ctx.campaigns,
      settings.campaignKeyword,
    );
    const metaAvailable = matched.length > 0;

    // Meta-Steuerstatus (sofern überhaupt Meta-Kampagnen matched).
    const states: CampaignBudgetState[] = [];
    if (metaAvailable) {
      for (const c of matched) states.push(await getCampaignBudgetState(c));
    }
    const controllable = states.filter((s) => s.level !== "none");
    const metaSteerable = controllable.length > 0;

    // Outbrain-Steuerstatus: nur Kampagnen mit budgetId sind via PUT änderbar
    // (Shared-/Lifetime-Budget-Kampagnen sind read-only).
    const outbrainSteerable = matchedOutbrain.filter((c) => c.budgetId).length > 0;
    // TikTok-Steuerstatus: nur BUDGET_MODE_DAY ist sinnvoll steuerbar.
    const tiktokSteerable = matchedTikTok.filter((c) => c.hasDailyBudget).length > 0;

    base.campaigns = [
      ...matched.map((c) => c.name),
      ...matchedOutbrain.map((c) => `Outbrain: ${c.name}`),
      ...matchedTikTok.map((c) => `TikTok: ${c.name}`),
    ];

    if (!metaSteerable && !outbrainSteerable && !tiktokSteerable) {
      base.reason = `Keine steuerbaren Kampagnen für Pool "${def.label}" — weder Meta noch Outbrain noch TikTok matched/steuerbar.`;
      base.error = base.reason;
      return base;
    }

    // Aktuelle Budgets pro Channel.
    const metaCurrent = controllable.reduce(
      (s, c) => s + c.dailyBudgetEur,
      0,
    );
    const outbrainCurrent = matchedOutbrain
      .filter((c) => c.budgetId)
      .reduce((s, c) => s + c.dailyBudgetEur, 0);
    const tiktokCurrent = matchedTikTok
      .filter((c) => c.hasDailyBudget)
      .reduce((s, c) => s + c.dailyBudgetEur, 0);
    const currentBudget = metaCurrent + outbrainCurrent + tiktokCurrent;

    // Meta-Spend MTD (fürs Display) + Lookback (für CPL-Entscheidung).
    const metaSpend = matched.reduce(
      (s, c) => s + (ctx.spendByCampaign.get(c.id) ?? 0),
      0,
    );
    base.metaSpendMtd = metaSpend;
    const metaSpendRecent = matched.reduce(
      (s, c) => s + (ctx.recentSpendByCampaign.get(c.id) ?? 0),
      0,
    );
    const [metaLeadsRecent, outbrainLeadsRecent, tiktokLeadsRecent] =
      await Promise.all([
        countPoolLeads(def, ctx.recentSince, ctx.mtdEnd, "Meta"),
        countPoolLeads(def, ctx.recentSince, ctx.mtdEnd, "Outbrain"),
        countPoolLeads(def, ctx.recentSince, ctx.mtdEnd, "TikTok"),
      ]);
    const recentLeadsTotal =
      metaLeadsRecent + outbrainLeadsRecent + tiktokLeadsRecent;
    const outbrainSpendRecent = matchedOutbrain.reduce(
      (s, c) => s + (ctx.recentOutbrainSpendByCampaign.get(c.id) ?? 0),
      0,
    );
    const tiktokSpendRecent = matchedTikTok.reduce(
      (s, c) => s + (ctx.recentTiktokSpendByCampaign.get(c.id) ?? 0),
      0,
    );

    // Display-CPLs (MTD).
    base.metaCpl =
      metaLeadsMtd > 0 && metaSpend > 0 ? metaSpend / metaLeadsMtd : null;
    // Decision-CPLs (Lookback).
    const metaCplRecent =
      metaLeadsRecent > 0 && metaSpendRecent > 0
        ? metaSpendRecent / metaLeadsRecent
        : null;
    const outbrainCplRecent =
      outbrainLeadsRecent > 0 && outbrainSpendRecent > 0
        ? outbrainSpendRecent / outbrainLeadsRecent
        : null;
    const tiktokCplRecent =
      tiktokLeadsRecent > 0 && tiktokSpendRecent > 0
        ? tiktokSpendRecent / tiktokLeadsRecent
        : null;

    // Blended CPL — Lookback über alle Channels. Fallback-Kaskade auf MTD.
    let costPerLead: number | null = null;
    const recentTotalSpend =
      metaSpendRecent + outbrainSpendRecent + tiktokSpendRecent;
    if (recentLeadsTotal > 0 && recentTotalSpend > 0) {
      costPerLead = recentTotalSpend / recentLeadsTotal;
    } else if (metaLeadsRecent > 0 && metaSpendRecent > 0) {
      costPerLead = metaSpendRecent / metaLeadsRecent;
    } else if (leadsMtd > 0 && metaSpend + outbrainSpend + tiktokSpend > 0) {
      costPerLead = (metaSpend + outbrainSpend + tiktokSpend) / leadsMtd;
    } else if (metaLeadsMtd > 0 && metaSpend > 0) {
      costPerLead = metaSpend / metaLeadsMtd;
    }

    const anyPaused =
      states.some(
        (s) => s.effective_status !== "ACTIVE" && s.status !== "ACTIVE",
      ) ||
      matchedOutbrain.filter((c) => c.budgetId).some((c) => !c.enabled) ||
      matchedTikTok.filter((c) => c.hasDailyBudget).some((c) => !c.enabled);

    base.prevBudget = currentBudget;

    // Decision auf Pool-Ebene — Max-Budget ist Summe der Channel-Caps.
    const outbrainMax =
      settings.outbrainMaxDailyBudget ?? ctx.outbrainDefaultMaxBudget;
    const tiktokMax =
      settings.tiktokMaxDailyBudget ?? ctx.tiktokDefaultMaxBudget;
    const poolMax = maxBudget + outbrainMax + tiktokMax;
    const decision = decideBudget({
      leadsMtd,
      goal: def.goal,
      daysElapsed: ctx.daysElapsed,
      daysTotal: ctx.daysTotal,
      currentBudget,
      costPerLead,
      minBudget: ctx.minBudget,
      maxBudget: poolMax,
      maxStep: ctx.maxStep,
      boostDays: ctx.boostDays,
      anyPaused,
      precisionDays: ctx.precisionDays,
      precisionMinBudget: ctx.precisionMinBudget,
      lookAheadHours: ctx.lookAheadHours,
    });

    base.action = decision.action;

    // Channel-Allokation nur, wenn ein neues Ziel gesetzt wurde. Sonst
    // bleiben die Budgets unverändert.
    let metaTarget: number | null = null;
    let outbrainTarget: number | null = null;
    let tiktokTarget: number | null = null;
    if (decision.targetBudget != null) {
      const alloc = allocateBudgetAcrossChannels({
        target: decision.targetBudget,
        metaCurrent,
        outbrainCurrent,
        tiktokCurrent,
        // Allokation folgt dem Lookback-CPL — jüngste Tage entscheiden.
        metaCpl: metaCplRecent ?? base.metaCpl,
        outbrainCpl: outbrainCplRecent ?? base.outbrainCpl,
        tiktokCpl: tiktokCplRecent ?? base.tiktokCpl,
        metaMin: metaSteerable ? ctx.minBudget : 0,
        metaMax: metaSteerable ? maxBudget : 0,
        outbrainMin: outbrainSteerable ? ctx.outbrainMinBudget : 0,
        outbrainMax: outbrainSteerable ? outbrainMax : 0,
        tiktokMin: tiktokSteerable ? ctx.tiktokMinBudget : 0,
        tiktokMax: tiktokSteerable ? tiktokMax : 0,
        metaAvailable: metaSteerable,
        outbrainAvailable: outbrainSteerable,
        tiktokAvailable: tiktokSteerable,
      });
      metaTarget = metaSteerable ? alloc.metaBudget : null;
      outbrainTarget = outbrainSteerable ? alloc.outbrainBudget : null;
      tiktokTarget = tiktokSteerable ? alloc.tiktokBudget : null;
      base.newBudget =
        (metaTarget ?? 0) + (outbrainTarget ?? 0) + (tiktokTarget ?? 0);
    }

    // Reason-Text mit Channel-Breakdown ergänzen.
    base.reason = decision.reason;
    if (metaTarget != null || outbrainTarget != null || tiktokTarget != null) {
      const bits: string[] = [];
      if (metaTarget != null) {
        bits.push(`Meta ${eur.format(metaCurrent)} → ${eur.format(metaTarget)}/Tag`);
      } else if (metaSteerable) {
        bits.push(`Meta ${eur.format(metaCurrent)}/Tag (unverändert)`);
      }
      if (outbrainTarget != null) {
        bits.push(
          `Outbrain ${eur.format(outbrainCurrent)} → ${eur.format(outbrainTarget)}/Tag`,
        );
      } else if (outbrainSteerable) {
        bits.push(`Outbrain ${eur.format(outbrainCurrent)}/Tag (unverändert)`);
      }
      if (tiktokTarget != null) {
        bits.push(
          `TikTok ${eur.format(tiktokCurrent)} → ${eur.format(tiktokTarget)}/Tag`,
        );
      } else if (tiktokSteerable) {
        bits.push(`TikTok ${eur.format(tiktokCurrent)}/Tag (unverändert)`);
      }
      if (bits.length > 0) {
        base.reason = `${decision.reason} · ${bits.join(", ")}`;
      }
    }

    if (ctx.dryRun) return base;

    // ── Schreiben: Meta ──
    if (decision.setStatus && metaSteerable) {
      for (const s of states) {
        await setCampaignStatus(s.campaignId, decision.setStatus);
      }
    }
    if (metaTarget != null && controllable.length > 0) {
      const per = metaTarget / controllable.length;
      for (const s of controllable) await setCampaignDailyBudget(s, per);
    }

    // ── Schreiben: Outbrain ──
    if (decision.setStatus && outbrainSteerable) {
      const enabled = decision.setStatus === "ACTIVE";
      for (const c of matchedOutbrain) {
        if (!c.budgetId) continue;
        try {
          await setOutbrainCampaignStatus(c, enabled);
        } catch (err) {
          console.warn(
            `[media-buyer] Outbrain-Status für ${c.name} failte:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
    if (outbrainTarget != null) {
      const steerable = matchedOutbrain.filter((c) => c.budgetId);
      if (steerable.length > 0) {
        const per = outbrainTarget / steerable.length;
        for (const c of steerable) {
          try {
            await setOutbrainCampaignDailyBudget(c, per);
          } catch (err) {
            console.warn(
              `[media-buyer] Outbrain-Budget für ${c.name} failte:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
      }
    }

    // ── Schreiben: TikTok ──
    if (decision.setStatus && tiktokSteerable) {
      const enabled = decision.setStatus === "ACTIVE";
      for (const c of matchedTikTok) {
        if (!c.hasDailyBudget) continue;
        try {
          await setTikTokCampaignStatus(c, enabled);
        } catch (err) {
          console.warn(
            `[media-buyer] TikTok-Status für ${c.name} failte:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
    if (tiktokTarget != null) {
      const steerable = matchedTikTok.filter((c) => c.hasDailyBudget);
      if (steerable.length > 0) {
        const per = tiktokTarget / steerable.length;
        for (const c of steerable) {
          try {
            await setTikTokCampaignDailyBudget(c, per);
          } catch (err) {
            console.warn(
              `[media-buyer] TikTok-Budget für ${c.name} failte:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
      }
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

  // Rolling-Lookback für die CPL-Decision (Default 7 Tage). MTD bleibt
  // separat fürs Admin-Display.
  const cplLookbackDays = envNum("MEDIA_BUYER_CPL_LOOKBACK_DAYS", 7);
  const recentSince = new Date(
    now.getTime() - cplLookbackDays * 24 * 3600 * 1000,
  );

  let campaigns: MetaCampaign[];
  let spendByCampaign: Map<string, number>;
  let recentSpendByCampaign: Map<string, number>;
  try {
    [campaigns, spendByCampaign, recentSpendByCampaign] = await Promise.all([
      listCampaigns(),
      getMonthlySpendByCampaign(now),
      getSpendByCampaign({ since: recentSince, until: now }),
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
        tiktokLeadsMtd: 0,
        tiktokSpendMtd: 0,
        tiktokCpl: null,
        error: msg,
      });
    }
    await persistAndNotify(pools, dryRun);
    return { ranAt: now, dryRun, pools };
  }

  // Outbrain + TikTok sind optional: wenn nicht konfiguriert oder API gerade
  // zickt, läuft der Buyer mit leeren Listen weiter (Channel-Splits sind
  // dann 0, Meta-Steuerung bleibt unbeeinträchtigt).
  let outbrainCampaigns: OutbrainCampaign[] = [];
  let outbrainSpendByCampaign = new Map<string, number>();
  let recentOutbrainSpendByCampaign = new Map<string, number>();
  try {
    [
      outbrainCampaigns,
      outbrainSpendByCampaign,
      recentOutbrainSpendByCampaign,
    ] = await Promise.all([
      listOutbrainCampaigns(),
      getOutbrainMonthlySpendByCampaign(now),
      getOutbrainSpendByCampaign({ since: recentSince, until: now }),
    ]);
  } catch (err) {
    console.warn(
      "[media-buyer] Outbrain nicht erreichbar — Channel-Sicht fällt aus:",
      err instanceof Error ? err.message : err,
    );
  }

  let tiktokCampaigns: TikTokCampaign[] = [];
  let tiktokSpendByCampaign = new Map<string, number>();
  let recentTiktokSpendByCampaign = new Map<string, number>();
  try {
    [
      tiktokCampaigns,
      tiktokSpendByCampaign,
      recentTiktokSpendByCampaign,
    ] = await Promise.all([
      listTikTokCampaigns(),
      getTikTokMonthlySpendByCampaign(now),
      getTikTokSpendByCampaign({ since: recentSince, until: now }),
    ]);
  } catch (err) {
    console.warn(
      "[media-buyer] TikTok nicht erreichbar — Channel-Sicht fällt aus:",
      err instanceof Error ? err.message : err,
    );
  }

  const ctx: RunCtx = {
    campaigns,
    spendByCampaign,
    outbrainCampaigns,
    outbrainSpendByCampaign,
    tiktokCampaigns,
    tiktokSpendByCampaign,
    recentSpendByCampaign,
    recentOutbrainSpendByCampaign,
    recentTiktokSpendByCampaign,
    recentSince,
    monthStart,
    mtdEnd,
    daysElapsed,
    daysTotal,
    minBudget: envNum("MEDIA_BUYER_MIN_DAILY_BUDGET", 5),
    outbrainMinBudget: envNum("MEDIA_BUYER_OUTBRAIN_MIN_DAILY_BUDGET", 20),
    outbrainDefaultMaxBudget: envNum("MEDIA_BUYER_OUTBRAIN_MAX_DAILY_BUDGET", 200),
    tiktokMinBudget: envNum("MEDIA_BUYER_TIKTOK_MIN_DAILY_BUDGET", 20),
    tiktokDefaultMaxBudget: envNum("MEDIA_BUYER_TIKTOK_MAX_DAILY_BUDGET", 200),
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
  outbrainMaxDailyBudget: number | null;
  tiktokMaxDailyBudget: number | null;
  campaignKeyword: string | null;
  outbrainCampaignKeyword: string | null;
  tiktokCampaignKeyword: string | null;
  // Cost-per-Lead MTD (Pool-Aggregat; aus Cost-Tabelle, kein Meta-Call).
  cpl: number | null;
  // Channel-Split aus Lead.adChannel + Cost-Note-Prefix.
  metaLeadsMtd: number;
  metaSpendMtd: number;
  metaCpl: number | null;
  outbrainLeadsMtd: number;
  outbrainSpendMtd: number;
  outbrainCpl: number | null;
  tiktokLeadsMtd: number;
  tiktokSpendMtd: number;
  tiktokCpl: number | null;
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
  const tiktokCostByProduct = new Map<string, number>();
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
    } else if (note.startsWith("TikTok:")) {
      tiktokCostByProduct.set(
        c.product,
        (tiktokCostByProduct.get(c.product) ?? 0) + amount,
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
    const [leadsMtd, metaLeadsMtd, outbrainLeadsMtd, tiktokLeadsMtd] =
      await Promise.all([
        countPoolLeads(def, monthStart, mtdEnd),
        countPoolLeads(def, monthStart, mtdEnd, "Meta"),
        countPoolLeads(def, monthStart, mtdEnd, "Outbrain"),
        countPoolLeads(def, monthStart, mtdEnd, "TikTok"),
      ]);
    const projected = Math.round((leadsMtd / daysElapsed) * daysTotal);
    const last = latestByKey.get(def.key);
    const metaSpend = metaCostByProduct.get(def.product) ?? 0;
    const outbrainSpend = outbrainCostByProduct.get(def.product) ?? 0;
    const tiktokSpend = tiktokCostByProduct.get(def.product) ?? 0;
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
      outbrainMaxDailyBudget: settings.outbrainMaxDailyBudget,
      tiktokMaxDailyBudget: settings.tiktokMaxDailyBudget,
      campaignKeyword: settings.campaignKeyword,
      outbrainCampaignKeyword: settings.outbrainCampaignKeyword,
      tiktokCampaignKeyword: settings.tiktokCampaignKeyword,
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
      tiktokLeadsMtd,
      tiktokSpendMtd: tiktokSpend,
      tiktokCpl: tiktokLeadsMtd > 0 ? tiktokSpend / tiktokLeadsMtd : null,
      latestAction: last?.action ?? null,
      latestReason: last?.reason ?? null,
    });
  }
  return rows;
}
