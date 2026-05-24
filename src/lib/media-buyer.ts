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
      reason: `Ziel erreicht (${leadsMtd}/${goal}). Kampagnen werden pausiert, um Überlieferung zu vermeiden.`,
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
        reason: `Endspurt: Ziel wird vor dem nächsten Lauf erreicht (${leadsMtd} + ~${leadsBeforeNextRun.toFixed(1)} erwartet ≥ ${goal}). Pausieren, um exakt zu landen.`,
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
        reason: `Noch keine Lead-Kosten messbar, aber Kampagnen pausiert und ${remaining} Leads offen — reaktivieren.`,
        targetBudget: currentBudget > 0 ? currentBudget : effMinBudget,
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
    const target = clamp(requiredBudgetRaw, effMinBudget, maxBudget);
    return {
      action: "boost",
      reason: `Endspurt (${daysLeft} Tage übrig, Prognose ${projected}/${goal}). Budget auf ${eur.format(target)}/Tag für ${remaining} fehlende Leads (≈ ${requiredPerDay.toFixed(1)} Leads/Tag bei kalk. ${cplFmt.format(costPerLead)}/Lead).`,
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
      reason: `Kampagnen pausiert, aber ${remaining} Leads offen (Prognose ${projected}/${goal}). Reaktivieren mit ${eur.format(target)}/Tag (≈ ${requiredPerDay.toFixed(1)} Leads/Tag bei kalk. ${cplFmt.format(costPerLead)}/Lead).`,
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
      reason: `Auf Kurs (Prognose ${projected}/${goal}, Budget ${eur.format(currentBudget)}/Tag).`,
      targetBudget: null,
      setStatus: null,
    };
  }

  if (target > currentBudget) {
    return {
      action: "increase",
      reason: `Hinterher (Prognose ${projected}/${goal}). Budget ${eur.format(currentBudget)} → ${eur.format(target)}/Tag (≈ ${requiredPerDay.toFixed(1)} Leads/Tag bei kalk. ${cplFmt.format(costPerLead)}/Lead).`,
      targetBudget: target,
      setStatus: null,
    };
  }
  return {
    action: "decrease",
    reason: `Überlieferung droht (Prognose ${projected}/${goal}). Budget ${eur.format(currentBudget)} → ${eur.format(target)}/Tag (kalk. ${cplFmt.format(costPerLead)}/Lead).`,
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

// Leitet alle Pools aus den aktuellen Kundendaten ab.
export async function derivePoolDefs(): Promise<PoolDef[]> {
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      leadGoalWechsel: true,
      leadGoalNeugeschaeft: true,
      leadGoalKinderwunsch: true,
      region: true,
    },
  });

  const defs: PoolDef[] = [];

  // PKV: ein Pool je Produkt über alle Kunden. Kinderwunsch ist hier
  // bewusst ausgenommen — das läuft regionsbasiert (siehe unten).
  const pkvGoals = { Wechsel: 0, Neugeschäft: 0 };
  for (const c of customers) {
    pkvGoals.Wechsel += c.leadGoalWechsel ?? 0;
    pkvGoals.Neugeschäft += c.leadGoalNeugeschaeft ?? 0;
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
    const goal = c.leadGoalKinderwunsch ?? 0;
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
    select: { autopilot: true, maxDailyBudget: true, campaignKeyword: true },
  });
  return {
    autopilot: pool.autopilot,
    maxDailyBudget: decToNumber(pool.maxDailyBudget),
    campaignKeyword: pool.campaignKeyword,
  };
}

async function countPoolLeads(
  def: PoolDef,
  monthStart: Date,
  mtdEnd: Date,
): Promise<number> {
  const where: {
    source: string;
    createdAt: { gte: Date; lte: Date };
    customerId?: { in: string[] };
  } = { source: def.product, createdAt: { gte: monthStart, lte: mtdEnd } };
  if (def.customerIds) {
    if (def.customerIds.length === 0) return 0;
    where.customerId = { in: def.customerIds };
  }
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
  };

  try {
    const leadsMtd = await countPoolLeads(def, ctx.monthStart, ctx.mtdEnd);
    const projected =
      ctx.daysElapsed > 0
        ? Math.round((leadsMtd / ctx.daysElapsed) * ctx.daysTotal)
        : 0;
    base.leadsMtd = leadsMtd;
    base.projected = projected;

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
    // Cost-per-Lead aus Meta-Spend (Monat) der gematchten Kampagnen ÷ Leads.
    const spend = matched.reduce(
      (s, c) => s + (ctx.spendByCampaign.get(c.id) ?? 0),
      0,
    );
    const costPerLead = leadsMtd > 0 && spend > 0 ? spend / leadsMtd : null;
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

  const defs = await derivePoolDefs();

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
        error: msg,
      });
    }
    await persistAndNotify(pools, dryRun);
    return { ranAt: now, dryRun, pools };
  }

  const ctx: RunCtx = {
    campaigns,
    spendByCampaign,
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
  goal: number;
  leadsMtd: number;
  autopilot: boolean;
  maxDailyBudget: number | null;
  campaignKeyword: string | null;
};

// Pools + aktuelle Ist-Leads für die Admin-Seite (ohne Meta-Aufrufe).
export async function listPoolsForAdmin(now: Date = new Date()): Promise<
  PoolAdminRow[]
> {
  const monthStart = startOfMonth(now);
  const mtdEnd = endOfDay(now);
  const defs = await derivePoolDefs();
  const rows: PoolAdminRow[] = [];
  for (const def of defs) {
    const settings = await ensurePool(def);
    const leadsMtd = await countPoolLeads(def, monthStart, mtdEnd);
    rows.push({
      key: def.key,
      label: def.label,
      kind: def.kind,
      goal: def.goal,
      leadsMtd,
      autopilot: settings.autopilot,
      maxDailyBudget: settings.maxDailyBudget,
      campaignKeyword: settings.campaignKeyword,
    });
  }
  return rows;
}
