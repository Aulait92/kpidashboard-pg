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
//
// Meta-Lernphase: Budgetänderungen werden durch guardLearning() aus
// media-buyer-lernphase.ts geschont (Standard ±20 % je Schritt, höchstens eine
// Änderung je 72 h; Reset nur, wenn er sich lohnt). Regeln und Env-Schwellen
// (MEDIA_BUYER_LEARNING_*) stehen im Kopf jener Datei.

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
import {
  findCampaignsByKeyword as findGoogleCampaignsByKeyword,
  getMonthlySpendByCampaign as getGoogleMonthlySpendByCampaign,
  getSpendByCampaign as getGoogleSpendByCampaign,
  listCampaigns as listGoogleCampaigns,
  setCampaignDailyBudget as setGoogleCampaignDailyBudget,
  setCampaignStatus as setGoogleCampaignStatus,
  type GoogleCampaign,
} from "@/lib/google-ads";
import { prisma } from "@/lib/prisma";
import {
  guardLearning,
  learningLabel,
  loadLearningConfig,
  summarizeLearning,
  type LearningConfig,
  type LearningStatus,
} from "@/lib/media-buyer-lernphase";
import {
  canonicalProductKey,
  displayProduct,
  isLegacyProduct,
} from "@/lib/products";
import { sendToAdmins } from "@/lib/push";
import { effektiveSteuer } from "@/lib/ppl/steuer";
import {
  aggregatePoolGoal,
  customersBehind,
  goalSourceFromEnv,
  holdForSourceSwitch,
  subscriptionMonthGoal,
  type GoalSource,
  type GoalSubscription,
  type PoolCustomerGoal,
  type SubscriptionGoal,
} from "@/lib/media-buyer-ziele";
import {
  applyMonthlyCap,
  applyPriceGuard,
  computeMaxCpl,
  shouldAlertCpl,
  stornoRate,
} from "@/lib/media-buyer-preisgrenze";

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
  googleLeadsMtd: number;
  googleSpendMtd: number;
  googleCpl: number | null;
  // Meta-Lernphase (null = kein steuerbares Meta im Pool).
  learningStatus?: LearningStatus | null;
  learningSince?: Date | null;
  // Vom Buyer in diesem Lauf pausierte Kampagnen ("meta:<id>", "outbrain:<id>" …).
  pausedCampaignIds?: string[];
  // Preisgrenze je Lead (EUR) und ob der 7-Tage-CPL darüber lag.
  maxCpl?: number | null;
  cplOverMax?: boolean;
  error?: string;
};

export type MediaBuyerRunResult = {
  ranAt: Date;
  dryRun: boolean;
  pools: PoolResult[];
  // Gesetzt, wenn der Lauf gar nicht gesteuert hat (Not-Aus, Laufsperre).
  skipped?: string;
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

  // Kein Lead-Ziel → der Pool ist nur zur Sichtbarkeit (Monitoring) da und wird
  // NICHT gesteuert. Ohne diese Schranke würde leadsMtd >= goal (0) immer
  // greifen und die Kampagnen fälschlich pausieren.
  if (!goal || goal <= 0) {
    return {
      action: "none",
      reason: "Kein Lead-Ziel gesetzt, keine Budget-Steuerung (nur Monitoring).",
      targetBudget: null,
      setStatus: null,
    };
  }

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
        reason: `Noch keine Meta-Lead-Kosten messbar, aber Meta-Kampagnen pausiert und ${remaining} Leads offen, reaktivieren.`,
        targetBudget: currentBudget > 0 ? currentBudget : effMinBudget,
        setStatus: "ACTIVE",
      };
    }
    return {
      action: "none",
      reason: `Noch keine Meta-Cost-per-Lead messbar, Meta-Budget unverändert (${remaining} Leads offen).`,
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
export type PoolDef = {
  key: string;
  label: string;
  kind: "product" | "region";
  product: string; // Lead.source: kanonischer Produkt-Key (Legacy oder echt)
  region: string | null;
  goal: number; // Summe der Kunden-Ziele dieses Pools
  // Kunden, deren Leads in diesen Pool zählen. null = alle (PKV: nur nach
  // Produkt gefiltert), sonst die Kunden der Region.
  customerIds: string[] | null;
  // Anzahl Kunden mit effektivem Ziel > 0 in diesem Pool (fürs Admin-Display).
  customerCount: number;
  // Zielquelle (MEDIA_BUYER_GOAL_SOURCE) und beide Werte zum Vergleich.
  goalSource: GoalSource;
  softwareGoal: number;
  airtableGoal: number;
  // Software-Ziel zerlegt: schon geliefert, fest offen (bezahlt), erwartet (Verlängerungen).
  software: { geliefert: number; fest: number; erwartet: number };
  // Lead-Preis aus den Bezügen (gewichtet mit dem Soll) und Anteil steuerfreier Leads.
  leadPrice: number | null;
  taxFreeShare: number;
  // Ziel und Geliefertes je Kunde (gewählte Quelle).
  customers: (PoolCustomerGoal & { name: string })[];
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

// Ziel eines einzelnen Kunden-Produkt-Bezugs. Test-Bezüge liefern ihr VOLLES
// Ziel (über die Test-Dauer, keine Mid-Month-Kürzung); Live-Bezüge werden
// anteilig auf den Restmonat gerechnet (effectiveGoal).
function goalForCustomerProduct(
  cp: {
    leadGoal: number | null;
    startDate: Date | null;
    testMode: boolean;
    testDurationDays: number | null;
  },
  now: Date,
): number {
  const raw = cp.leadGoal ?? 0;
  const isTest = cp.testMode || (cp.testDurationDays ?? 0) > 0;
  return isTest ? raw : effectiveGoal(raw, cp.startDate, now);
}

// Label für einen Produkt-Pool. Die drei Legacy-Sparten behalten ihr
// historisches Label ("PKV Tarifoptimierung" etc.); neue Produkte zeigen
// ihren (Display-)Namen direkt.
function productPoolLabel(canonicalKey: string, displayName: string): string {
  if (canonicalKey === "Wechsel" || canonicalKey === "Neugeschäft") {
    return `PKV ${displayProduct(canonicalKey)}`;
  }
  return displayName;
}

// Pool-Key für einen Region-Pool. Kinderwunsch behält aus Gründen der
// Rückwärtskompatibilität den nackten "region:<Region>"-Key (bestehende
// DeliveryPool-Records); jedes andere regionsbasierte Produkt bekommt den
// Produkt-Key mit hinein, damit zwei Region-Produkte derselben Stadt nicht
// auf denselben Pool kollidieren.
export function regionPoolKey(canonicalKey: string, region: string): string {
  return canonicalKey === "Kinderwunsch"
    ? `region:${region}`
    : `region:${canonicalKey}:${region}`;
}

// Ein Pool im Aufbau: Ziele je Kunde aus beiden Quellen (Software, Airtable),
// damit der Admin beide vergleichen kann.
type PoolAcc = {
  key: string;
  kind: "product" | "region";
  canonicalKey: string;
  region: string | null;
  displayName: string;
  airtable: Map<string, number>; // customerId → effektives Airtable-Ziel
  software: SubscriptionGoal[];
};

// Lädt die Bezüge der Software samt Bestellungen und Gelieferten und rechnet
// je Bezug das Soll des laufenden Monats (Modell: lib/media-buyer-ziele.ts).
async function loadSoftwareGoals(now: Date): Promise<
  { sub: { productKey: string; customerId: string; region: string | null }; goal: SubscriptionGoal }[]
> {
  const monthStart = startOfMonth(now);
  const monthEnd = new Date(endOfMonth(now).getTime() + 1);
  const subs = await prisma.leadSubscription.findMany({
    select: {
      id: true,
      customerId: true,
      productKey: true,
      active: true,
      status: true,
      period: true,
      goal: true,
      testQuantity: true,
      startDate: true,
      price: true,
      steuer: true,
      customer: {
        select: {
          region: true,
          dormantSince: true,
          vermittlerRegisterNr: true,
          vermittlerRegisterStatus: true,
          vermittlerGeprueftAt: true,
        },
      },
      areas: { select: { quantity: true, period: true } },
      // Bestellungen, die den Monat berühren können (inkl. der Woche über den
      // Monatsanfang); die jüngste ist für die Verlängerung maßgeblich.
      orders: {
        where: { periodEnd: { gt: new Date(monthStart.getTime() - 7 * 86_400_000) } },
        select: {
          id: true,
          periodStart: true,
          periodEnd: true,
          quantity: true,
          status: true,
          autoRenew: true,
        },
      },
    },
  });
  if (subs.length === 0) return [];
  const subIds = subs.map((s) => s.id);
  const orderIds = subs.flatMap((s) => s.orders.map((o) => o.id));
  const [byOrder, inMonth, before] = await Promise.all([
    orderIds.length
      ? prisma.lead.groupBy({
          by: ["orderId"],
          where: { orderId: { in: orderIds }, isTest: false },
          _count: { _all: true },
        })
      : Promise.resolve([] as { orderId: string | null; _count: { _all: number } }[]),
    prisma.lead.groupBy({
      by: ["subscriptionId"],
      where: { subscriptionId: { in: subIds }, isTest: false, deliveredAt: { gte: monthStart, lte: now } },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["subscriptionId"],
      where: { subscriptionId: { in: subIds }, isTest: false, deliveredAt: { lt: monthStart } },
      _count: { _all: true },
    }),
  ]);
  const orderCount = new Map(byOrder.map((r) => [r.orderId, r._count._all]));
  const monthCount = new Map(inMonth.map((r) => [r.subscriptionId, r._count._all]));
  const beforeCount = new Map(before.map((r) => [r.subscriptionId, r._count._all]));
  const window = {
    now,
    monthStart,
    monthEnd,
    projectRenewals: !["0", "false", "aus", "off"].includes(
      (process.env.MEDIA_BUYER_GOAL_RENEWALS ?? "").trim().toLowerCase(),
    ),
  };
  return subs.map((s) => {
    const input: GoalSubscription = {
      id: s.id,
      customerId: s.customerId,
      productKey: s.productKey,
      active: s.active,
      dormant: s.customer.dormantSince != null,
      status: s.status,
      period: s.period,
      goal: s.goal,
      testQuantity: s.testQuantity,
      startDate: s.startDate,
      price: decToNumber(s.price) ?? 0,
      taxFree: effektiveSteuer(s, s.customer).steuer === "steuerfrei_4_11",
      areas: s.areas,
      deliveredMonth: monthCount.get(s.id) ?? 0,
      deliveredBefore: beforeCount.get(s.id) ?? 0,
      orders: s.orders.map((o) => ({ ...o, delivered: orderCount.get(o.id) ?? 0 })),
    };
    return {
      sub: { productKey: s.productKey, customerId: s.customerId, region: s.customer.region },
      goal: subscriptionMonthGoal(input, window),
    };
  });
}

// Leitet alle Pools ab. Ziele kommen aus der gewählten Quelle
// (MEDIA_BUYER_GOAL_SOURCE, Standard „software“ = Bezüge/Bestellungen der
// App; „airtable“ = CustomerProduct.leadGoal, der Airtable-Spiegel). Beide
// Werte werden immer berechnet, damit der Admin sie vergleichen kann.
//
// Pools: ein Pool je Produkt (Product.poolKind="product") bzw. je Region
// (poolKind="region", Region des Kunden bzw. des CustomerProduct). Jedes
// aktive Produkt erscheint, auch ohne Ziel (nur Monitoring).
export async function derivePoolDefs(
  now: Date = new Date(),
  source: GoalSource = goalSourceFromEnv(),
): Promise<PoolDef[]> {
  const accs = new Map<string, PoolAcc>();

  const products = await prisma.product.findMany({
    where: { active: true },
    select: {
      name: true,
      displayName: true,
      poolKind: true,
      customerProducts: {
        select: {
          customerId: true,
          leadGoal: true,
          startDate: true,
          testMode: true,
          testDurationDays: true,
          region: true,
          customer: { select: { region: true } },
        },
      },
    },
  });
  // Pool-Label je Produkt. Ein explizit gepflegter Product.displayName hat
  // IMMER Vorrang, auch vor dem Legacy-Label „PKV …".
  const labelByKey = new Map<string, string>();
  const kindByKey = new Map<string, "product" | "region">();
  const displayByKey = new Map<string, string>();
  for (const p of products) {
    const canonicalKey = canonicalProductKey(p.name);
    const explicit = p.displayName?.trim();
    if (explicit) labelByKey.set(canonicalKey, explicit);
    else if (!labelByKey.has(canonicalKey))
      labelByKey.set(canonicalKey, productPoolLabel(canonicalKey, p.name));
    if (p.poolKind === "region") kindByKey.set(canonicalKey, "region");
    else if (!kindByKey.has(canonicalKey)) kindByKey.set(canonicalKey, "product");
    if (!displayByKey.has(canonicalKey)) displayByKey.set(canonicalKey, p.displayName ?? p.name);
  }

  function accFor(canonicalKey: string, region: string | null): PoolAcc | null {
    const kind = kindByKey.get(canonicalKey) ?? "product";
    const r = region?.trim() ?? "";
    if (kind === "region" && !r) return null;
    const key = kind === "region" ? regionPoolKey(canonicalKey, r) : `product:${canonicalKey}`;
    let acc = accs.get(key);
    if (!acc) {
      acc = {
        key,
        kind,
        canonicalKey,
        region: kind === "region" ? r : null,
        displayName: displayByKey.get(canonicalKey) ?? canonicalKey,
        airtable: new Map(),
        software: [],
      };
      accs.set(key, acc);
    }
    return acc;
  }

  // ── Airtable: Product × CustomerProduct ──
  for (const p of products) {
    const canonicalKey = canonicalProductKey(p.name);
    for (const cp of p.customerProducts) {
      const goal = goalForCustomerProduct(cp, now);
      if (goal <= 0) continue;
      const acc = accFor(canonicalKey, cp.region ?? cp.customer.region);
      if (!acc) continue;
      acc.airtable.set(cp.customerId, (acc.airtable.get(cp.customerId) ?? 0) + goal);
    }
  }

  // ── Software: LeadSubscription × LeadOrder ──
  for (const { sub, goal } of await loadSoftwareGoals(now)) {
    if (goal.soll <= 0 && goal.price <= 0) continue;
    const acc = accFor(canonicalProductKey(sub.productKey), sub.region);
    if (acc) acc.software.push(goal);
  }

  // Jedes aktive Produkt sichtbar machen, auch ohne Lead-Ziel (Monitoring).
  for (const p of products) {
    if (p.poolKind === "region") continue;
    accFor(canonicalProductKey(p.name), null);
  }

  // Gelieferte Leads je Kunde × Produkt im Monat (für die Airtable-Sicht je Kunde).
  const monthStart = startOfMonth(now);
  const airtableCustomerIds = [...new Set([...accs.values()].flatMap((a) => [...a.airtable.keys()]))];
  const deliveredRows = airtableCustomerIds.length
    ? await prisma.lead.groupBy({
        by: ["customerId", "source"],
        where: {
          customerId: { in: airtableCustomerIds },
          isTest: false,
          createdAt: { gte: monthStart, lte: endOfDay(now) },
        },
        _count: { _all: true },
      })
    : [];
  const deliveredBy = new Map<string, number>();
  for (const r of deliveredRows) {
    const k = `${r.customerId}|${canonicalProductKey(r.source ?? "")}`;
    deliveredBy.set(k, (deliveredBy.get(k) ?? 0) + r._count._all);
  }

  const allCustomerIds = new Set<string>(airtableCustomerIds);
  for (const a of accs.values()) for (const g of a.software) allCustomerIds.add(g.customerId);
  const names = allCustomerIds.size
    ? await prisma.customer.findMany({
        where: { id: { in: [...allCustomerIds] } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(names.map((c) => [c.id, c.name]));

  const defs: PoolDef[] = [];
  for (const acc of accs.values()) {
    const sw = aggregatePoolGoal(acc.software);
    const airtableGoal = [...acc.airtable.values()].reduce((s, g) => s + g, 0);
    const airtableCustomers: PoolCustomerGoal[] = [...acc.airtable.entries()].map(([customerId, goal]) => ({
      customerId,
      goal,
      delivered: deliveredBy.get(`${customerId}|${acc.canonicalKey}`) ?? 0,
    }));
    const selected = source === "software" ? sw.customers : airtableCustomers;
    const label =
      acc.kind === "region"
        ? `${labelByKey.get(acc.canonicalKey) ?? displayProduct(acc.canonicalKey)} ${acc.region}`
        : (labelByKey.get(acc.canonicalKey) ?? productPoolLabel(acc.canonicalKey, acc.displayName));
    // Region-Pools zählen die Leads der Kunden der Region (beide Quellen, damit
    // der Vergleich auf denselben Ist-Zahlen beruht).
    const regionCustomers = [...new Set([...acc.airtable.keys(), ...sw.customers.map((c) => c.customerId)])];
    defs.push({
      key: acc.key,
      label,
      kind: acc.kind,
      product: acc.canonicalKey,
      region: acc.region,
      goal: source === "software" ? sw.goal : airtableGoal,
      goalSource: source,
      softwareGoal: sw.goal,
      airtableGoal,
      software: { geliefert: sw.geliefert, fest: Math.round(sw.fest), erwartet: Math.round(sw.erwartet) },
      leadPrice: sw.leadPrice,
      taxFreeShare: sw.taxFreeShare,
      customers: selected
        .map((c) => ({ ...c, name: nameById.get(c.customerId) ?? c.customerId }))
        .sort((a, b) => b.goal - a.goal),
      customerIds: acc.kind === "product" ? null : regionCustomers,
      customerCount: selected.filter((c) => c.goal > 0).length,
    });
  }
  return defs;
}

// Diagnose: pro Produkt das rohe (Airtable-) vs. effektive (anteilige) Lead-Ziel
// + Aufschlüsselung pro Kunde. Zeigt, ob ein zu niedriges Pool-Ziel an der
// Mid-Month-Kürzung (rawGoal >> effectiveGoal) oder an fehlenden
// CustomerProduct-Zeilen (rawGoal schon zu niedrig) liegt.
export type ProductGoalBreakdown = {
  key: string;
  label: string;
  rawGoal: number;
  effectiveGoal: number;
  customers: {
    customer: string;
    leadGoal: number;
    startDate: string | null;
    effective: number;
  }[];
};

export async function listProductGoalBreakdown(
  now: Date = new Date(),
): Promise<ProductGoalBreakdown[]> {
  const rows = await prisma.customerProduct.findMany({
    // Ruhende Konten (lib/ruhend.ts) zählen nicht mehr in die Lead-Ziele
    where: { customer: { dormantSince: null } },
    select: {
      leadGoal: true,
      startDate: true,
      testMode: true,
      testDurationDays: true,
      product: { select: { name: true } },
      customer: { select: { name: true } },
    },
  });
  const byKey = new Map<string, ProductGoalBreakdown>();
  for (const r of rows) {
    const key = canonicalProductKey(r.product.name);
    const entry =
      byKey.get(key) ??
      ({
        key,
        label: displayProduct(key),
        rawGoal: 0,
        effectiveGoal: 0,
        customers: [],
      } satisfies ProductGoalBreakdown);
    const raw = r.leadGoal ?? 0;
    // „effective" spiegelt die tatsächlich verwendete Logik: Test → voll,
    // Live → anteilig.
    const eff = goalForCustomerProduct(r, now);
    entry.rawGoal += raw;
    entry.effectiveGoal += eff;
    entry.customers.push({
      customer: r.customer.name,
      leadGoal: raw,
      startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : null,
      effective: eff,
    });
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => b.rawGoal - a.rawGoal);
}

type PoolSettings = {
  autopilot: boolean;
  // Höchstpreis je Lead (EUR) für diesen Pool; null = Env bzw. Break-even.
  maxCpl: number | null;
  // maxDailyBudget = Meta-Cap (Historie); je Channel separat.
  maxDailyBudget: number | null;
  outbrainMaxDailyBudget: number | null;
  tiktokMaxDailyBudget: number | null;
  googleMaxDailyBudget: number | null;
  campaignKeyword: string | null;
  outbrainCampaignKeyword: string | null;
  tiktokCampaignKeyword: string | null;
  googleCampaignKeyword: string | null;
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
      maxCpl: true,
      maxDailyBudget: true,
      outbrainMaxDailyBudget: true,
      tiktokMaxDailyBudget: true,
      googleMaxDailyBudget: true,
      campaignKeyword: true,
      outbrainCampaignKeyword: true,
      tiktokCampaignKeyword: true,
      googleCampaignKeyword: true,
    },
  });
  return {
    autopilot: pool.autopilot,
    maxCpl: decToNumber(pool.maxCpl),
    maxDailyBudget: decToNumber(pool.maxDailyBudget),
    outbrainMaxDailyBudget: decToNumber(pool.outbrainMaxDailyBudget),
    tiktokMaxDailyBudget: decToNumber(pool.tiktokMaxDailyBudget),
    googleMaxDailyBudget: decToNumber(pool.googleMaxDailyBudget),
    campaignKeyword: pool.campaignKeyword,
    outbrainCampaignKeyword: pool.outbrainCampaignKeyword,
    tiktokCampaignKeyword: pool.tiktokCampaignKeyword,
    googleCampaignKeyword: pool.googleCampaignKeyword,
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
    isTest: false;
  } = { source: def.product, createdAt: { gte: monthStart, lte: mtdEnd }, isTest: false };
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
    // Legacy-Sparten über den bestehenden Meta-Klassifizierer; neue Produkte
    // matchen generisch über den Produktnamen im Kampagnen-Namen.
    if (isLegacyProduct(def.product)) {
      return campaigns.filter((c) => classifyProduct(c.name) === def.product);
    }
    const p = def.product.toLowerCase();
    return campaigns.filter((c) => c.name.toLowerCase().includes(p));
  }
  // Region-Pool: Kampagne, deren Name die Region enthält. Für Kinderwunsch
  // zusätzlich der historische Kinderwunsch-Namensfilter; neue Region-Produkte
  // matchen über Produktname + Region.
  const region = def.region!.toLowerCase();
  if (def.product === "Kinderwunsch") {
    return campaigns.filter(
      (c) =>
        isKinderwunschCampaign(c.name) && c.name.toLowerCase().includes(region),
    );
  }
  const p = def.product.toLowerCase();
  return campaigns.filter(
    (c) =>
      c.name.toLowerCase().includes(p) && c.name.toLowerCase().includes(region),
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
  googleCampaigns: GoogleCampaign[];
  googleSpendByCampaign: Map<string, number>;
  // Rolling-Lookback-Spend für die CPL-Decision.
  recentSpendByCampaign: Map<string, number>;
  recentOutbrainSpendByCampaign: Map<string, number>;
  recentTiktokSpendByCampaign: Map<string, number>;
  recentGoogleSpendByCampaign: Map<string, number>;
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
  googleMinBudget: number;
  googleDefaultMaxBudget: number;
  maxStep: number;
  boostDays: number;
  precisionDays: number;
  precisionMinBudget: number;
  lookAheadHours: number;
  learningCfg: LearningConfig;
  now: Date;
  // Datenfrische: gesetzt = Lead-Eingang auffällig alt → nur halten.
  staleReason: string | null;
  // Nicht lesbare Zusatzkanäle (Fehlermeldung je Kanal).
  channelErrors: { outbrain?: string; tiktok?: string; google?: string };
  // Monats-Gesamtgrenze über alle Pools/Kanäle; null = keine Grenze.
  // dailyRate wird nach jeder Erhöhung fortgeschrieben.
  monthlyCap: { cap: number; spentMtd: number; dailyRate: number } | null;
  cplAlertRuns: number;
  dryRun: boolean;
};

// Aus dem eigenen Log: wann zuletzt das Budget wirklich geändert wurde und seit
// wann der Pool (durch uns) pausiert ist.
async function loadPoolHistory(poolKey: string): Promise<{
  lastChangeAt: Date | null;
  pausedSince: Date | null;
  buyerPausedIds: Set<string>;
  // Wie viele Läufe in Folge lag der CPL über dem Höchstpreis (inkl. Flag)?
  overMaxCplStreak: number;
}> {
  const rows = await prisma.mediaBuyerAction.findMany({
    where: { poolKey, dryRun: false },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      action: true,
      prevBudget: true,
      newBudget: true,
      createdAt: true,
      errorMessage: true,
      pausedCampaignIds: true,
      cplOverMax: true,
    },
  });
  let overMaxCplStreak = 0;
  for (const r of rows) {
    if (!r.cplOverMax) break;
    overMaxCplStreak++;
  }
  let lastChangeAt: Date | null = null;
  for (const r of rows) {
    if (r.errorMessage) continue;
    if (!["increase", "decrease", "boost", "activate"].includes(r.action)) continue;
    const next = decToNumber(r.newBudget);
    if (next == null) continue;
    const prev = decToNumber(r.prevBudget);
    if (prev == null || Math.abs(next - prev) > Math.max(0.5, prev * 0.005)) {
      lastChangeAt = r.createdAt;
      break;
    }
  }
  // Seit der letzten Reaktivierung/Budgetänderung: wann pausiert und welche
  // Kampagnen hat der Buyer SELBST pausiert (nur die darf er reaktivieren).
  let pausedSince: Date | null = null;
  const buyerPausedIds = new Set<string>();
  for (const r of rows) {
    if (["increase", "decrease", "boost", "activate"].includes(r.action)) break;
    if (r.action === "pause") {
      pausedSince = r.createdAt;
      for (const id of (r.pausedCampaignIds ?? "").split(",")) {
        if (id.trim()) buyerPausedIds.add(id.trim());
      }
    }
  }
  return { lastChangeAt, pausedSince, buyerPausedIds, overMaxCplStreak };
}

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
  googleBudget: number;
};

export function allocateBudgetAcrossChannels(params: {
  target: number;
  metaCurrent: number;
  outbrainCurrent: number;
  tiktokCurrent: number;
  googleCurrent: number;
  metaCpl: number | null;
  outbrainCpl: number | null;
  tiktokCpl: number | null;
  googleCpl: number | null;
  metaMin: number;
  metaMax: number;
  outbrainMin: number;
  outbrainMax: number;
  tiktokMin: number;
  tiktokMax: number;
  googleMin: number;
  googleMax: number;
  metaAvailable: boolean;
  outbrainAvailable: boolean;
  tiktokAvailable: boolean;
  googleAvailable: boolean;
}): ChannelAllocation {
  const ch: {
    key: "meta" | "outbrain" | "tiktok" | "google";
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
    {
      key: "google",
      available: params.googleAvailable,
      current: params.googleCurrent,
      cpl: params.googleCpl,
      min: params.googleMin,
      max: params.googleMax,
    },
  ];
  const active = ch.filter((c) => c.available);
  const result: ChannelAllocation = {
    metaBudget: 0,
    outbrainBudget: 0,
    tiktokBudget: 0,
    googleBudget: 0,
  };
  if (active.length === 0) return result;

  // Gewichte: wenn alle aktiven Channels einen CPL haben, inverse-CPL.
  // Wenn manche null sind: gleicher Anteil (Probe), wenn alle null:
  // proportional zum aktuellen Budget oder gleichgewichtet.
  const withCpl = active.filter((c) => c.cpl != null && c.cpl > 0);
  const shares = new Map<string, number>();
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
  result.googleBudget = round(budgets.get("google") ?? 0);
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

function matchGooglePoolCampaigns(
  def: PoolDef,
  campaigns: GoogleCampaign[],
  keywordOverride: string | null,
): GoogleCampaign[] {
  if (keywordOverride && keywordOverride.trim()) {
    return findGoogleCampaignsByKeyword(campaigns, keywordOverride);
  }
  if (def.kind === "product") {
    const p = def.product.toLowerCase();
    return campaigns.filter((c) => c.name.toLowerCase().includes(p));
  }
  const region = def.region!.toLowerCase();
  return campaigns.filter((c) => c.name.toLowerCase().includes(region));
}

// Reverse-Charge-USt-Satz auf Meta-Rechnungen (für steuerfreie Leads nicht
// abziehbar). 0 erlaubt (Regel aus).
function rcVat(): number {
  const n = Number(process.env.MEDIA_BUYER_RC_VAT);
  return process.env.MEDIA_BUYER_RC_VAT && Number.isFinite(n) && n >= 0 ? n : 0.19;
}

// Höchstpreis je Lead für einen Pool: Feld > Env > Break-even aus dem Lead-Preis
// der Bezüge (gewichtet mit dem Soll, derivePoolDefs) × (1 − Stornoquote 30
// Tage) / (1 + USt × Anteil steuerfreier Leads). Regeln: media-buyer-preisgrenze.ts.
async function loadPoolMaxCpl(
  def: PoolDef,
  poolOverride: number | null,
  now: Date,
): Promise<{ value: number | null; source: string | null; taxFreeShare: number }> {
  const envRaw = Number(process.env.MEDIA_BUYER_MAX_CPL);
  const envOverride = Number.isFinite(envRaw) && envRaw > 0 ? envRaw : null;
  if ((poolOverride ?? 0) > 0 || envOverride != null) {
    return {
      ...computeMaxCpl({ poolOverride, envOverride, leadPrices: [], stornoRate: null, defaultStorno: 0.1 }),
      taxFreeShare: 0,
    };
  }
  const customerFilter = def.customerIds ? { customerId: { in: def.customerIds } } : {};
  // Ohne Software-Preis: einfacher Schnitt je Kunde; CustomerProduct (Airtable)
  // nur noch, wenn Airtable die Zielquelle ist.
  const [subs, cps] = def.leadPrice != null
    ? [[], []]
    : await Promise.all([
        prisma.leadSubscription.findMany({
          where: { active: true, ...customerFilter },
          select: { customerId: true, productKey: true, price: true },
        }),
        def.goalSource === "airtable"
          ? prisma.customerProduct.findMany({
              where: { leadPrice: { not: null }, ...customerFilter },
              select: { customerId: true, leadPrice: true, product: { select: { name: true } } },
            })
          : Promise.resolve([] as { customerId: string; leadPrice: unknown; product: { name: string } }[]),
      ]);
  // Je Kunde ein Preis: Pay-per-Lead-Bezug vor CustomerProduct.
  const priceByCustomer = new Map<string, number>();
  for (const sub of subs) {
    if (canonicalProductKey(sub.productKey) !== def.product) continue;
    const v = decToNumber(sub.price);
    if (v && v > 0 && !priceByCustomer.has(sub.customerId)) priceByCustomer.set(sub.customerId, v);
  }
  for (const cp of cps) {
    if (canonicalProductKey(cp.product.name) !== def.product) continue;
    const v = decToNumber(cp.leadPrice);
    if (v && v > 0 && !priceByCustomer.has(cp.customerId)) priceByCustomer.set(cp.customerId, v);
  }
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const leadWhere = {
    source: def.product,
    isTest: false,
    createdAt: { gte: since, lte: now },
    ...(def.customerIds ? { customerId: { in: def.customerIds } } : {}),
  };
  const [delivered, cancelled] = await Promise.all([
    prisma.lead.count({ where: leadWhere }),
    prisma.lead.count({ where: { ...leadWhere, stornoState: "approved" } }),
  ]);
  const res = computeMaxCpl({
    poolOverride: null,
    envOverride: null,
    leadPrices: def.leadPrice != null ? [def.leadPrice] : [...priceByCustomer.values()],
    stornoRate: stornoRate(delivered, cancelled, envNum("MEDIA_BUYER_STORNO_MIN_LEADS", 20)),
    defaultStorno: envNum("MEDIA_BUYER_DEFAULT_STORNO", 0.1),
    taxFreeShare: def.taxFreeShare,
    rcVat: rcVat(),
  });
  return { ...res, taxFreeShare: res.taxFreeShare ?? 0 };
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
    googleLeadsMtd: 0,
    googleSpendMtd: 0,
    googleCpl: null,
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
    const [metaLeadsMtd, outbrainLeadsMtd, tiktokLeadsMtd, googleLeadsMtd] =
      await Promise.all([
        countPoolLeads(def, ctx.monthStart, ctx.mtdEnd, "Meta"),
        countPoolLeads(def, ctx.monthStart, ctx.mtdEnd, "Outbrain"),
        countPoolLeads(def, ctx.monthStart, ctx.mtdEnd, "TikTok"),
        countPoolLeads(def, ctx.monthStart, ctx.mtdEnd, "Google"),
      ]);
    base.metaLeadsMtd = metaLeadsMtd;
    base.outbrainLeadsMtd = outbrainLeadsMtd;
    base.tiktokLeadsMtd = tiktokLeadsMtd;
    base.googleLeadsMtd = googleLeadsMtd;

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

    const matchedGoogle = matchGooglePoolCampaigns(
      def,
      ctx.googleCampaigns,
      settings.googleCampaignKeyword,
    );
    const googleSpend = matchedGoogle.reduce(
      (s, c) => s + (ctx.googleSpendByCampaign.get(c.id) ?? 0),
      0,
    );
    base.googleSpendMtd = googleSpend;
    base.googleCpl =
      googleLeadsMtd > 0 && googleSpend > 0
        ? googleSpend / googleLeadsMtd
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
    // Google-Steuerstatus: nur Kampagnen mit eigenem DAILY-Budget.
    const googleSteerable =
      matchedGoogle.filter((c) => c.hasDailyBudget && c.budgetResourceName)
        .length > 0;

    base.campaigns = [
      ...matched.map((c) => c.name),
      ...matchedOutbrain.map((c) => `Outbrain: ${c.name}`),
      ...matchedTikTok.map((c) => `TikTok: ${c.name}`),
      ...matchedGoogle.map((c) => `Google: ${c.name}`),
    ];

    if (
      !metaSteerable &&
      !outbrainSteerable &&
      !tiktokSteerable &&
      !googleSteerable
    ) {
      base.reason = `Keine steuerbaren Kampagnen für Pool "${def.label}", weder Meta, Outbrain, TikTok noch Google matched/steuerbar.`;
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
    const googleCurrent = matchedGoogle
      .filter((c) => c.hasDailyBudget)
      .reduce((s, c) => s + c.dailyBudgetEur, 0);
    const currentBudget =
      metaCurrent + outbrainCurrent + tiktokCurrent + googleCurrent;

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
    const [
      metaLeadsRecent,
      outbrainLeadsRecent,
      tiktokLeadsRecent,
      googleLeadsRecent,
    ] = await Promise.all([
      countPoolLeads(def, ctx.recentSince, ctx.mtdEnd, "Meta"),
      countPoolLeads(def, ctx.recentSince, ctx.mtdEnd, "Outbrain"),
      countPoolLeads(def, ctx.recentSince, ctx.mtdEnd, "TikTok"),
      countPoolLeads(def, ctx.recentSince, ctx.mtdEnd, "Google"),
    ]);
    const recentLeadsTotal =
      metaLeadsRecent +
      outbrainLeadsRecent +
      tiktokLeadsRecent +
      googleLeadsRecent;
    const outbrainSpendRecent = matchedOutbrain.reduce(
      (s, c) => s + (ctx.recentOutbrainSpendByCampaign.get(c.id) ?? 0),
      0,
    );
    const tiktokSpendRecent = matchedTikTok.reduce(
      (s, c) => s + (ctx.recentTiktokSpendByCampaign.get(c.id) ?? 0),
      0,
    );
    const googleSpendRecent = matchedGoogle.reduce(
      (s, c) => s + (ctx.recentGoogleSpendByCampaign.get(c.id) ?? 0),
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
    const googleCplRecent =
      googleLeadsRecent > 0 && googleSpendRecent > 0
        ? googleSpendRecent / googleLeadsRecent
        : null;

    // Blended CPL — IMMER aus dem 7-Tage-Lookback (kein MTD-Fallback). So
    // spiegelt die Steuerung stets die aktuellen Lead-Kosten der letzten Tage,
    // nicht den verwässerten Monatsdurchschnitt. Ohne Spend/Leads in den 7
    // Tagen bleibt costPerLead null → der Buyer hält das Budget und sorgt nur
    // dafür, dass die Kampagnen laufen (siehe decideBudget).
    let costPerLead: number | null = null;
    const recentTotalSpend =
      metaSpendRecent +
      outbrainSpendRecent +
      tiktokSpendRecent +
      googleSpendRecent;
    if (recentLeadsTotal > 0 && recentTotalSpend > 0) {
      costPerLead = recentTotalSpend / recentLeadsTotal;
    } else if (metaLeadsRecent > 0 && metaSpendRecent > 0) {
      costPerLead = metaSpendRecent / metaLeadsRecent;
    }

    // Pausiert zählt nur, was der Buyer selbst pausiert hat (laut Log). Von
    // Hand pausierte Kampagnen bleiben aus, der Buyer reaktiviert sie nie.
    const history = await loadPoolHistory(def.key);
    const metaPausedByBuyer = states.filter(
      (s) => s.status !== "ACTIVE" && history.buyerPausedIds.has(`meta:${s.campaignId}`),
    );
    const outbrainPausedByBuyer = matchedOutbrain.filter(
      (c) => c.budgetId && !c.enabled && history.buyerPausedIds.has(`outbrain:${c.id}`),
    );
    const tiktokPausedByBuyer = matchedTikTok.filter(
      (c) => c.hasDailyBudget && !c.enabled && history.buyerPausedIds.has(`tiktok:${c.id}`),
    );
    const googlePausedByBuyer = matchedGoogle.filter(
      (c) => c.hasDailyBudget && !c.enabled && history.buyerPausedIds.has(`google:${c.id}`),
    );
    const anyPaused =
      metaPausedByBuyer.length > 0 ||
      outbrainPausedByBuyer.length > 0 ||
      tiktokPausedByBuyer.length > 0 ||
      googlePausedByBuyer.length > 0;

    base.prevBudget = currentBudget;

    // Decision auf Pool-Ebene — Max-Budget ist Summe der Channel-Caps.
    const outbrainMax =
      settings.outbrainMaxDailyBudget ?? ctx.outbrainDefaultMaxBudget;
    const tiktokMax =
      settings.tiktokMaxDailyBudget ?? ctx.tiktokDefaultMaxBudget;
    const googleMax =
      settings.googleMaxDailyBudget ?? ctx.googleDefaultMaxBudget;
    const poolMax = maxBudget + outbrainMax + tiktokMax + googleMax;
    let decision = decideBudget({
      leadsMtd,
      goal: def.goal,
      daysElapsed: ctx.daysElapsed,
      daysTotal: ctx.daysTotal,
      currentBudget,
      costPerLead,
      minBudget: ctx.minBudget,
      maxBudget: poolMax,
      // Mit Meta gilt EINE Schrittgrenze: die der Lernphasen-Regel (auch für
      // den Endspurt-Boost). Ohne Meta die klassische MAX_STEP-Grenze.
      maxStep: metaSteerable && ctx.learningCfg.enabled ? 10 : ctx.maxStep,
      boostDays: ctx.boostDays,
      anyPaused,
      precisionDays: ctx.precisionDays,
      precisionMinBudget: ctx.precisionMinBudget,
      lookAheadHours: ctx.lookAheadHours,
    });

    // ── Preisgrenze je Lead ──
    const maxCpl = await loadPoolMaxCpl(def, settings.maxCpl, ctx.now);
    base.maxCpl = maxCpl.value;
    const price = applyPriceGuard({
      decision,
      currentBudget,
      costPerLead,
      maxCpl: maxCpl.value,
    });
    decision = price.decision;
    base.cplOverMax = price.overMax;
    if (price.overMax) {
      const streak = history.overMaxCplStreak + 1;
      if (!ctx.dryRun && shouldAlertCpl(streak, ctx.cplAlertRuns)) {
        await sendToAdmins({
          title: `⚠️ Media Buyer: ${def.label} zu teuer`,
          body: `CPL ${cplFmt.format(costPerLead ?? 0)} liegt seit ${streak} Läufen über dem Höchstpreis ${cplFmt.format(maxCpl.value ?? 0)}. Budget wird nicht erhöht.`,
          tag: `media-buyer-cpl:${def.key}`,
          url: "/admin/media-buyer",
        }).catch(() => undefined);
      }
    }

    // ── Monats-Gesamtgrenze (optional) ──
    if (ctx.monthlyCap) {
      const capped = applyMonthlyCap({
        decision,
        currentBudget,
        cap: ctx.monthlyCap.cap,
        spentMtd: ctx.monthlyCap.spentMtd,
        dailyRate: ctx.monthlyCap.dailyRate,
        daysLeft: Math.max(1, ctx.daysTotal - ctx.daysElapsed + 1),
      });
      decision = capped.decision;
    }

    // ── Meta-Lernphase schonen ──
    // Nur wenn Meta im Pool steuerbar ist (Outbrain/TikTok/Google kennen keine
    // Meta-Lernphase). Fehlt der Lernstatus, gilt „unbekannt" = schonen.
    let protectStep: number | null = null;
    if (metaSteerable) {
      const learning = summarizeLearning(states.flatMap((s) => s.adSets ?? []));
      const lastChangeMs = Math.max(
        history.lastChangeAt?.getTime() ?? 0,
        learning.lastSigEditAt?.getTime() ?? 0,
      );
      const hoursSinceLastChange =
        lastChangeMs > 0 ? (ctx.now.getTime() - lastChangeMs) / 3_600_000 : null;
      const pausedDays =
        anyPaused && history.pausedSince
          ? (ctx.now.getTime() - history.pausedSince.getTime()) / 86_400_000
          : null;
      const spendMtd = metaSpend + outbrainSpend + tiktokSpend + googleSpend;
      const daysLeft = Math.max(1, ctx.daysTotal - ctx.daysElapsed + 1);
      const guard = guardLearning({
        decision,
        currentBudget,
        learning: learning.status,
        hoursSinceLastChange,
        pausedDays,
        leadsMtd,
        goal: def.goal,
        projected,
        daysLeft,
        inBoostWindow: daysLeft <= ctx.boostDays,
        costPerLead,
        cplMtd: leadsMtd > 0 && spendMtd > 0 ? spendMtd / leadsMtd : null,
        maxBudget: poolMax,
        cfg: ctx.learningCfg,
      });
      decision = guard.decision;
      protectStep = guard.protectStep;
      base.learningStatus = learning.status;
      base.learningSince =
        learning.status === "LEARNING"
          ? (learning.lastSigEditAt ?? (lastChangeMs > 0 ? new Date(lastChangeMs) : null))
          : lastChangeMs > 0
            ? new Date(lastChangeMs)
            : null;
      // Größerer Sprung (Reset bzw. freie Änderung) → ab jetzt neue Lernphase.
      if (
        decision.targetBudget != null &&
        protectStep == null &&
        currentBudget > 0 &&
        Math.abs(decision.targetBudget / currentBudget - 1) > ctx.learningCfg.maxStep
      ) {
        base.learningStatus = "LEARNING";
        base.learningSince = ctx.now;
      }
    }

    base.action = decision.action;
    // Monatsgrenze: Erhöhungen dieses Pools für die folgenden Pools mitzählen.
    if (ctx.monthlyCap && decision.targetBudget != null && decision.targetBudget > currentBudget) {
      ctx.monthlyCap.dailyRate += decision.targetBudget - currentBudget;
    }

    // Channel-Allokation nur, wenn ein neues Ziel gesetzt wurde. Sonst
    // bleiben die Budgets unverändert.
    let metaTarget: number | null = null;
    let outbrainTarget: number | null = null;
    let tiktokTarget: number | null = null;
    let googleTarget: number | null = null;
    if (decision.targetBudget != null) {
      const alloc = allocateBudgetAcrossChannels({
        target: decision.targetBudget,
        metaCurrent,
        outbrainCurrent,
        tiktokCurrent,
        googleCurrent,
        // Allokation folgt dem Lookback-CPL — jüngste Tage entscheiden.
        metaCpl: metaCplRecent ?? base.metaCpl,
        outbrainCpl: outbrainCplRecent ?? base.outbrainCpl,
        tiktokCpl: tiktokCplRecent ?? base.tiktokCpl,
        googleCpl: googleCplRecent ?? base.googleCpl,
        metaMin: metaSteerable ? ctx.minBudget : 0,
        metaMax: metaSteerable ? maxBudget : 0,
        outbrainMin: outbrainSteerable ? ctx.outbrainMinBudget : 0,
        outbrainMax: outbrainSteerable ? outbrainMax : 0,
        tiktokMin: tiktokSteerable ? ctx.tiktokMinBudget : 0,
        tiktokMax: tiktokSteerable ? tiktokMax : 0,
        googleMin: googleSteerable ? ctx.googleMinBudget : 0,
        googleMax: googleSteerable ? googleMax : 0,
        metaAvailable: metaSteerable,
        outbrainAvailable: outbrainSteerable,
        tiktokAvailable: tiktokSteerable,
        googleAvailable: googleSteerable,
      });
      metaTarget = metaSteerable ? alloc.metaBudget : null;
      // Die Channel-Aufteilung kann Metas Anteil stärker verschieben als die
      // Gesamtänderung. Bei Schonung Meta selbst nochmals auf ±Schritt deckeln.
      if (metaTarget != null && protectStep != null && metaCurrent > 0) {
        metaTarget = clamp(
          metaTarget,
          metaCurrent * (1 - protectStep),
          metaCurrent * (1 + protectStep),
        );
      }
      outbrainTarget = outbrainSteerable ? alloc.outbrainBudget : null;
      tiktokTarget = tiktokSteerable ? alloc.tiktokBudget : null;
      googleTarget = googleSteerable ? alloc.googleBudget : null;
      base.newBudget =
        (metaTarget ?? 0) +
        (outbrainTarget ?? 0) +
        (tiktokTarget ?? 0) +
        (googleTarget ?? 0);
    }

    // Reason-Text mit Channel-Breakdown ergänzen.
    base.reason = decision.reason;
    if (
      metaTarget != null ||
      outbrainTarget != null ||
      tiktokTarget != null ||
      googleTarget != null
    ) {
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
      if (googleTarget != null) {
        bits.push(
          `Google ${eur.format(googleCurrent)} → ${eur.format(googleTarget)}/Tag`,
        );
      } else if (googleSteerable) {
        bits.push(`Google ${eur.format(googleCurrent)}/Tag (unverändert)`);
      }
      if (bits.length > 0) {
        base.reason = `${decision.reason} · ${bits.join(", ")}`;
      }
    }

    // ── Datenfrische: bei alten Daten oder unlesbarem Kanal nur halten ──
    const wantsWrite = decision.targetBudget != null || decision.setStatus != null;
    const unreadable: string[] = [];
    if (ctx.channelErrors.outbrain && (settings.outbrainCampaignKeyword || outbrainLeadsMtd > 0))
      unreadable.push("Outbrain");
    if (ctx.channelErrors.tiktok && (settings.tiktokCampaignKeyword || tiktokLeadsMtd > 0))
      unreadable.push("TikTok");
    if (ctx.channelErrors.google && (settings.googleCampaignKeyword || googleLeadsMtd > 0))
      unreadable.push("Google");
    const holdWhy = [
      ctx.staleReason,
      unreadable.length > 0 ? `${unreadable.join(", ")} nicht lesbar` : null,
    ].filter(Boolean);
    if (wantsWrite && holdWhy.length > 0) {
      const msg = `Daten nicht verlässlich (${holdWhy.join("; ")}): nichts geändert, Budget gehalten. Geplant war: ${decision.reason}`;
      base.action = "none";
      base.reason = msg;
      base.newBudget = null;
      base.error = msg;
      return base;
    }

    if (ctx.dryRun) return base;

    // Jeder Schreibvorgang einzeln abgesichert; Teilfehler werden ehrlich
    // gemeldet (Log + Push), statt „Budget gesetzt" zu behaupten.
    const failures: string[] = [];
    let writes = 0;
    const tryWrite = async (label: string, fn: () => Promise<void>) => {
      writes++;
      try {
        await fn();
      } catch (err) {
        failures.push(
          `${label}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200),
        );
      }
    };
    const pausedIds: string[] = [];

    // ── Schreiben: Meta ──
    if (decision.setStatus === "PAUSED" && metaSteerable) {
      // Nur pausieren, was gerade läuft, und genau das merken.
      for (const st of states.filter((x) => x.status === "ACTIVE")) {
        await tryWrite(`Meta ${st.campaignName}`, async () => {
          await setCampaignStatus(st.campaignId, "PAUSED");
          pausedIds.push(`meta:${st.campaignId}`);
        });
      }
    } else if (decision.setStatus === "ACTIVE") {
      for (const st of metaPausedByBuyer) {
        await tryWrite(`Meta ${st.campaignName}`, () =>
          setCampaignStatus(st.campaignId, "ACTIVE"),
        );
      }
    }
    if (metaTarget != null && controllable.length > 0) {
      // Proportional zum bisherigen Budget je Kampagne: jede Kampagne ändert
      // sich um denselben Prozentsatz (gleichmäßiges Aufteilen könnte einzelne
      // Kampagnen weit über ±20 % verschieben und die Lernphase zurücksetzen).
      const total = metaTarget;
      const proportional =
        metaCurrent > 0 && controllable.every((x) => x.dailyBudgetEur > 0);
      for (const st of controllable) {
        const per = proportional
          ? (st.dailyBudgetEur / metaCurrent) * total
          : total / controllable.length;
        await tryWrite(`Meta-Budget ${st.campaignName}`, () =>
          setCampaignDailyBudget(st, per),
        );
      }
    }

    // ── Schreiben: Outbrain ──
    if (decision.setStatus === "PAUSED" && outbrainSteerable) {
      for (const c of matchedOutbrain.filter((x) => x.budgetId && x.enabled)) {
        await tryWrite(`Outbrain ${c.name}`, async () => {
          await setOutbrainCampaignStatus(c, false);
          pausedIds.push(`outbrain:${c.id}`);
        });
      }
    } else if (decision.setStatus === "ACTIVE") {
      for (const c of outbrainPausedByBuyer) {
        await tryWrite(`Outbrain ${c.name}`, () => setOutbrainCampaignStatus(c, true));
      }
    }
    if (outbrainTarget != null) {
      const total = outbrainTarget;
      const steerable = matchedOutbrain.filter((c) => c.budgetId);
      for (const c of steerable) {
        await tryWrite(`Outbrain-Budget ${c.name}`, () =>
          setOutbrainCampaignDailyBudget(c, total / steerable.length),
        );
      }
    }

    // ── Schreiben: TikTok ──
    if (decision.setStatus === "PAUSED" && tiktokSteerable) {
      for (const c of matchedTikTok.filter((x) => x.hasDailyBudget && x.enabled)) {
        await tryWrite(`TikTok ${c.name}`, async () => {
          await setTikTokCampaignStatus(c, false);
          pausedIds.push(`tiktok:${c.id}`);
        });
      }
    } else if (decision.setStatus === "ACTIVE") {
      for (const c of tiktokPausedByBuyer) {
        await tryWrite(`TikTok ${c.name}`, () => setTikTokCampaignStatus(c, true));
      }
    }
    if (tiktokTarget != null) {
      const total = tiktokTarget;
      const steerable = matchedTikTok.filter((c) => c.hasDailyBudget);
      for (const c of steerable) {
        await tryWrite(`TikTok-Budget ${c.name}`, () =>
          setTikTokCampaignDailyBudget(c, total / steerable.length),
        );
      }
    }

    // ── Schreiben: Google Ads ──
    if (decision.setStatus === "PAUSED" && googleSteerable) {
      for (const c of matchedGoogle.filter((x) => x.hasDailyBudget && x.enabled)) {
        await tryWrite(`Google ${c.name}`, async () => {
          await setGoogleCampaignStatus(c, false);
          pausedIds.push(`google:${c.id}`);
        });
      }
    } else if (decision.setStatus === "ACTIVE") {
      for (const c of googlePausedByBuyer) {
        await tryWrite(`Google ${c.name}`, () => setGoogleCampaignStatus(c, true));
      }
    }
    if (googleTarget != null) {
      const total = googleTarget;
      const steerable = matchedGoogle.filter(
        (c) => c.hasDailyBudget && c.budgetResourceName,
      );
      for (const c of steerable) {
        await tryWrite(`Google-Budget ${c.name}`, () =>
          setGoogleCampaignDailyBudget(c, total / steerable.length),
        );
      }
    }

    base.pausedCampaignIds = pausedIds;
    if (failures.length > 0) {
      const summary = `Teilfehler: ${failures.length} von ${writes} Änderungen fehlgeschlagen (${failures.join(" | ")})`;
      base.error = summary;
      base.reason = `${base.reason} · ${summary}`;
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

type RunParams = {
  now?: Date;
  dryRun?: boolean;
  // force = Drosselung im Normalbetrieb überspringen (für „Jetzt anwenden",
  // z. B. direkt nach dem Aktivieren des Autopiloten).
  force?: boolean;
};

// Not-Aus: Live-Läufe (auch „Jetzt anwenden") nur mit MEDIA_BUYER_ENABLED=1.
// Trockenläufe schreiben nichts an die Werbekonten und bleiben erlaubt.
export function mediaBuyerEnabled(): boolean {
  return process.env.MEDIA_BUYER_ENABLED === "1";
}

export async function runMediaBuyer(
  params: RunParams = {},
): Promise<MediaBuyerRunResult> {
  const now = params.now ?? new Date();
  const dryRun = params.dryRun ?? false;
  if (dryRun) return runMediaBuyerUnlocked(params);
  if (!mediaBuyerEnabled()) {
    return {
      ranAt: now,
      dryRun,
      pools: [],
      skipped: "Media Buyer ist abgeschaltet (MEDIA_BUYER_ENABLED=1 zum Einschalten).",
    };
  }
  // Laufsperre gegen Doppelläufe (Cron + „Jetzt anwenden" gleichzeitig):
  // Postgres-Advisory-Lock, gehalten von einer Transaktion für die Dauer des
  // Laufs. Ist er belegt, steuert dieser Aufruf nichts.
  let locked = false;
  let result: MediaBuyerRunResult | null = null;
  await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext('media-buyer-run')) AS ok`;
      locked = rows[0]?.ok === true;
      if (!locked) return;
      result = await runMediaBuyerUnlocked(params);
    },
    { maxWait: 10_000, timeout: 30 * 60_000 },
  );
  if (!locked || !result) {
    return {
      ranAt: now,
      dryRun,
      pools: [],
      skipped: "Ein anderer Media-Buyer-Lauf läuft gerade, dieser Aufruf hat nichts geändert.",
    };
  }
  return result;
}

async function runMediaBuyerUnlocked(
  params: RunParams,
): Promise<MediaBuyerRunResult> {
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
        googleLeadsMtd: 0,
        googleSpendMtd: 0,
        googleCpl: null,
        error: msg,
      });
    }
    await persistAndNotify(pools, dryRun);
    return { ranAt: now, dryRun, pools };
  }

  // Outbrain + TikTok sind optional: wenn nicht konfiguriert oder API gerade
  // zickt, läuft der Buyer mit leeren Listen weiter (Channel-Splits sind
  // dann 0, Meta-Steuerung bleibt unbeeinträchtigt).
  const channelErrors: RunCtx["channelErrors"] = {};
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
    channelErrors.outbrain = err instanceof Error ? err.message : String(err);
    console.warn(
      "[media-buyer] Outbrain nicht erreichbar, Channel-Sicht fällt aus:",
      channelErrors.outbrain,
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
    channelErrors.tiktok = err instanceof Error ? err.message : String(err);
    console.warn(
      "[media-buyer] TikTok nicht erreichbar, Channel-Sicht fällt aus:",
      channelErrors.tiktok,
    );
  }

  let googleCampaigns: GoogleCampaign[] = [];
  let googleSpendByCampaign = new Map<string, number>();
  let recentGoogleSpendByCampaign = new Map<string, number>();
  try {
    [
      googleCampaigns,
      googleSpendByCampaign,
      recentGoogleSpendByCampaign,
    ] = await Promise.all([
      listGoogleCampaigns(),
      getGoogleMonthlySpendByCampaign(now),
      getGoogleSpendByCampaign({ since: recentSince, until: now }),
    ]);
  } catch (err) {
    channelErrors.google = err instanceof Error ? err.message : String(err);
    console.warn(
      "[media-buyer] Google Ads nicht erreichbar, Channel-Sicht fällt aus:",
      channelErrors.google,
    );
  }

  // ── Datenfrische: gibt Meta Geld aus, aber seit Stunden kommt kein Lead
  // an, ist vermutlich der Lead-Eingang gestört → nur halten.
  let staleReason: string | null = null;
  const maxLeadAgeH = envNum("MEDIA_BUYER_MAX_LEAD_AGE_HOURS", 24);
  try {
    const [newest, spendRecentDay] = await Promise.all([
      prisma.lead.findFirst({
        where: { isTest: false },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      getSpendByCampaign({ since: new Date(now.getTime() - 86_400_000), until: now }),
    ]);
    const spentDay = [...spendRecentDay.values()].reduce((a, b) => a + b, 0);
    const ageH = newest ? (now.getTime() - newest.createdAt.getTime()) / 3_600_000 : Infinity;
    if (spentDay > envNum("MEDIA_BUYER_STALE_MIN_SPEND", 20) && ageH > maxLeadAgeH) {
      staleReason = `letzter Lead vor ${Number.isFinite(ageH) ? Math.round(ageH) : "?"} h trotz ${eur.format(spentDay)} Meta-Ausgaben`;
    }
  } catch (err) {
    staleReason = `Datenfrische nicht prüfbar (${err instanceof Error ? err.message.slice(0, 80) : "Fehler"})`;
  }

  // ── Optionale Monats-Gesamtgrenze über alle Pools und Kanäle ──
  const capRaw = Number(process.env.MEDIA_BUYER_MONTHLY_CAP);
  const sumMap = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const monthlyCap =
    Number.isFinite(capRaw) && capRaw > 0
      ? {
          cap: capRaw,
          spentMtd:
            sumMap(spendByCampaign) +
            sumMap(outbrainSpendByCampaign) +
            sumMap(tiktokSpendByCampaign) +
            sumMap(googleSpendByCampaign),
          dailyRate:
            (sumMap(recentSpendByCampaign) +
              sumMap(recentOutbrainSpendByCampaign) +
              sumMap(recentTiktokSpendByCampaign) +
              sumMap(recentGoogleSpendByCampaign)) /
            cplLookbackDays,
        }
      : null;

  const ctx: RunCtx = {
    campaigns,
    spendByCampaign,
    outbrainCampaigns,
    outbrainSpendByCampaign,
    tiktokCampaigns,
    tiktokSpendByCampaign,
    googleCampaigns,
    googleSpendByCampaign,
    recentSpendByCampaign,
    recentOutbrainSpendByCampaign,
    recentTiktokSpendByCampaign,
    recentGoogleSpendByCampaign,
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
    googleMinBudget: envNum("MEDIA_BUYER_GOOGLE_MIN_DAILY_BUDGET", 10),
    googleDefaultMaxBudget: envNum("MEDIA_BUYER_GOOGLE_MAX_DAILY_BUDGET", 200),
    defaultMaxBudget: envNum("MEDIA_BUYER_MAX_DAILY_BUDGET", 200),
    maxStep: envNum("MEDIA_BUYER_MAX_STEP", 0.5),
    boostDays: envNum("MEDIA_BUYER_BOOST_DAYS", 5),
    precisionDays,
    precisionMinBudget: envNum("MEDIA_BUYER_PRECISION_MIN_BUDGET", 1),
    lookAheadHours: await deriveLookAheadHours(now),
    learningCfg: loadLearningConfig(),
    now,
    staleReason,
    channelErrors,
    monthlyCap,
    cplAlertRuns: envNum("MEDIA_BUYER_CPL_ALERT_RUNS", 3),
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
        learningStatus: r.learningStatus ?? null,
        learningSince: r.learningSince ?? null,
        pausedCampaignIds:
          r.pausedCampaignIds && r.pausedCampaignIds.length > 0
            ? r.pausedCampaignIds.join(",")
            : null,
        maxCpl: r.maxCpl ?? null,
        cplOverMax: r.cplOverMax ?? false,
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
  googleMaxDailyBudget: number | null;
  campaignKeyword: string | null;
  outbrainCampaignKeyword: string | null;
  tiktokCampaignKeyword: string | null;
  googleCampaignKeyword: string | null;
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
  googleLeadsMtd: number;
  googleSpendMtd: number;
  googleCpl: number | null;
  // Letzte Entscheidung des Buyers für diesen Pool (für die Empfehlungs-Karte).
  latestAction: string | null;
  latestReason: string | null;
  // Meta-Lernphase knapp („abgeschlossen", „läuft (Tag 3/7)", „eingeschränkt").
  learningLabel: string | null;
  // Höchstpreis je Lead (EUR); null = „Höchstpreis fehlt" (keine Erhöhungen).
  maxCpl: number | null;
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
  // Kundenzahl pro Pool — bereits in derivePoolDefs aus CustomerProduct
  // aggregiert (nur Kunden mit effektivem Ziel > 0; Mid-Month-Onboarder mit
  // Startdatum > Monatsende fallen via effectiveGoal=0 raus).
  const customerCountFor = (def: PoolDef): number => def.customerCount;
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
  const googleCostByProduct = new Map<string, number>();
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
    } else if (note.startsWith("Google:")) {
      googleCostByProduct.set(
        c.product,
        (googleCostByProduct.get(c.product) ?? 0) + amount,
      );
    }
  }
  // Letzte Entscheidung pro Pool in einem Rutsch holen (vermeidet N+1).
  const latest = await prisma.mediaBuyerAction.findMany({
    where: { dryRun: false, poolKey: { in: defs.map((d) => d.key) } },
    orderBy: { createdAt: "desc" },
    distinct: ["poolKey"],
    select: {
      poolKey: true,
      action: true,
      reason: true,
      learningStatus: true,
      learningSince: true,
    },
  });
  const latestByKey = new Map(latest.map((l) => [l.poolKey, l]));
  const learningDays = loadLearningConfig().learningDays;

  const rows: PoolAdminRow[] = [];
  for (const def of defs) {
    const settings = await ensurePool(def);
    const maxCpl = await loadPoolMaxCpl(def, settings.maxCpl, now);
    const [
      leadsMtd,
      metaLeadsMtd,
      outbrainLeadsMtd,
      tiktokLeadsMtd,
      googleLeadsMtd,
    ] = await Promise.all([
      countPoolLeads(def, monthStart, mtdEnd),
      countPoolLeads(def, monthStart, mtdEnd, "Meta"),
      countPoolLeads(def, monthStart, mtdEnd, "Outbrain"),
      countPoolLeads(def, monthStart, mtdEnd, "TikTok"),
      countPoolLeads(def, monthStart, mtdEnd, "Google"),
    ]);
    const projected = Math.round((leadsMtd / daysElapsed) * daysTotal);
    const last = latestByKey.get(def.key);
    const metaSpend = metaCostByProduct.get(def.product) ?? 0;
    const outbrainSpend = outbrainCostByProduct.get(def.product) ?? 0;
    const tiktokSpend = tiktokCostByProduct.get(def.product) ?? 0;
    const googleSpend = googleCostByProduct.get(def.product) ?? 0;
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
      googleMaxDailyBudget: settings.googleMaxDailyBudget,
      campaignKeyword: settings.campaignKeyword,
      outbrainCampaignKeyword: settings.outbrainCampaignKeyword,
      tiktokCampaignKeyword: settings.tiktokCampaignKeyword,
      googleCampaignKeyword: settings.googleCampaignKeyword,
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
      googleLeadsMtd,
      googleSpendMtd: googleSpend,
      googleCpl: googleLeadsMtd > 0 ? googleSpend / googleLeadsMtd : null,
      latestAction: last?.action ?? null,
      latestReason: last?.reason ?? null,
      learningLabel: learningLabel(
        last?.learningStatus,
        last?.learningSince,
        now,
        learningDays,
      ),
      maxCpl: maxCpl.value,
    });
  }
  return rows;
}
