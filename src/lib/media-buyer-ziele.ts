// Lead-Ziele des Media Buyers aus den Bezügen der Software (reine Logik, ohne
// Datenbank, daher testbar). Löst Airtable (CustomerProduct.leadGoal) als
// Zielquelle ab (Ole, 20.11.2026).
//
// Zielmodell je Bezug (LeadSubscription) für den laufenden Kalendermonat:
//
//   Soll bis Monatsende = schon geliefert + fest offen + erwartet
//
//   geliefert  Leads dieses Bezugs mit Lieferdatum im laufenden Monat (bis jetzt).
//   fest       noch offene Mengen, die bis Monatsende fällig sind:
//     - Wochenbestellung (period=week): je bezahlter Bestellung (Status paid
//       oder processing, wie die Verteilung in lib/ppl/engine.ts) Rest =
//       Menge − schon auf diese Bestellung geliefert. Läuft die Bestellung über
//       das Monatsende hinaus, zählt der Rest nur anteilig (Anteil der
//       verbleibenden Zeit, der noch in diesen Monat fällt). Abgelaufene
//       Bestellungen zählen nicht mehr. open/failed/cancelled zählen nie.
//     - Monatsziel (period=month, Großabnehmer wie Heinrich von Kleist,
//       Convexa): Ziel (ohne Ziel: Summe der Gebietsmengen, sonst Testmenge),
//       bei Start mitten im Monat anteilig auf die Resttage; offen = Ziel −
//       geliefert im Monat.
//     - Einmal-Ziel (period=once) und Test ohne Ziel: Gesamtmenge − alles
//       bisher Gelieferte; der ganze Rest ist in diesem Monat fällig.
//   erwartet   Verlängerungen von Wochenbestellungen: hat die jüngste
//              Bestellung den Status paid/processing und „jede Woche
//              wiederholen“, zählt ihre Menge für die restlichen Wochen bis
//              Monatsende (Woche über das Monatsende anteilig nach Tagen).
//              Abschaltbar mit MEDIA_BUYER_GOAL_RENEWALS=0.
//
// Inaktive (pausierte/gekündigte) Bezüge und ruhende Konten haben nichts mehr
// offen; ihre schon gelieferten Leads zählen aber weiter ins Soll, weil sie
// auch in der Pool-Belieferung (countPoolLeads, brutto) stecken. So bleibt
// „Pool-Soll − Pool-Ist“ gleich dem, was den Kunden noch zusteht.
//
// Pool-Ziel = Summe der Soll-Werte der Bezüge des Pools (gerundet).
// Lead-Preis je Pool = Preise der Bezüge, gewichtet mit ihrem Soll (ohne Soll:
// einfacher Schnitt der aktiven Bezüge). Anteil steuerfreier Leads (§ 4 Nr. 11
// UStG) ebenso gewichtet, für die Preisgrenze.

export type GoalSource = "software" | "airtable";

/** Zielquelle aus MEDIA_BUYER_GOAL_SOURCE (Standard software). */
export function goalSourceFromEnv(raw = process.env.MEDIA_BUYER_GOAL_SOURCE): GoalSource {
  return raw?.trim().toLowerCase() === "airtable" ? "airtable" : "software";
}

export const PAID_ORDER_STATUS = ["paid", "processing"] as const;
const isPaid = (status: string) => (PAID_ORDER_STATUS as readonly string[]).includes(status);

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export type GoalOrder = {
  periodStart: Date;
  periodEnd: Date;
  quantity: number;
  status: string;
  autoRenew: boolean;
  /** Schon auf diese Bestellung gelieferte Leads (gesamt, auch Vormonat). */
  delivered: number;
};

export type GoalSubscription = {
  id: string;
  customerId: string;
  productKey: string;
  active: boolean;
  /** Konto ruhend (Customer.dormantSince gesetzt). */
  dormant: boolean;
  status: string; // live | test
  period: string; // week | month | once
  goal: number | null;
  testQuantity: number | null;
  startDate: Date | null;
  price: number;
  /** Bezug wird steuerfrei nach § 4 Nr. 11 UStG abgerechnet. */
  taxFree: boolean;
  areas: { quantity: number; period: string | null }[];
  /** Geliefert im laufenden Monat (bis jetzt). */
  deliveredMonth: number;
  /** Geliefert vor Monatsbeginn (für Einmal-/Test-Mengen). */
  deliveredBefore: number;
  orders: GoalOrder[];
};

export type GoalWindow = {
  now: Date;
  monthStart: Date;
  /** Exklusives Monatsende (erster Moment des Folgemonats). */
  monthEnd: Date;
  /** Verlängerungen von Wochenbestellungen einrechnen (Standard an). */
  projectRenewals?: boolean;
};

export type SubscriptionGoal = {
  subscriptionId: string;
  customerId: string;
  soll: number;
  geliefert: number;
  fest: number;
  erwartet: number;
  price: number;
  taxFree: boolean;
};

function areaMonthQuantity(sub: GoalSubscription, w: GoalWindow): number {
  const weeksInMonth = (w.monthEnd.getTime() - w.monthStart.getTime()) / WEEK_MS;
  return sub.areas.reduce((n, a) => {
    const p = a.period ?? (sub.period === "week" ? "week" : "month");
    return n + (p === "week" ? a.quantity * weeksInMonth : a.quantity);
  }, 0);
}

/** Monatsmenge anteilig ab Start (Start mitten im Monat → nur Resttage). */
function prorateFromStart(quantity: number, startDate: Date | null, w: GoalWindow): number {
  if (!startDate || startDate <= w.monthStart) return quantity;
  if (startDate >= w.monthEnd) return 0;
  const total = w.monthEnd.getTime() - w.monthStart.getTime();
  // Ganze Tage wie effectiveGoal: der Starttag zählt mit.
  const startDay = Math.floor((startDate.getTime() - w.monthStart.getTime()) / DAY_MS) * DAY_MS;
  return (quantity * (total - startDay)) / total;
}

function weekOrdersOpen(sub: GoalSubscription, w: GoalWindow): { fest: number; erwartet: number } {
  const now = w.now.getTime();
  const monthEnd = w.monthEnd.getTime();
  let fest = 0;
  for (const o of sub.orders) {
    if (!isPaid(o.status)) continue;
    const end = o.periodEnd.getTime();
    const start = o.periodStart.getTime();
    if (end <= now || start >= monthEnd) continue;
    const rest = Math.max(0, o.quantity - o.delivered);
    if (rest === 0) continue;
    const from = Math.max(now, start);
    const share = end <= monthEnd ? 1 : Math.max(0, monthEnd - from) / (end - from);
    fest += rest * share;
  }

  let erwartet = 0;
  if (w.projectRenewals !== false && sub.orders.length > 0) {
    const latest = [...sub.orders].sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime())[0];
    if (isPaid(latest.status) && latest.autoRenew && latest.periodEnd.getTime() > now) {
      let cursor = latest.periodEnd.getTime();
      while (cursor < monthEnd) {
        const weekEnd = cursor + WEEK_MS;
        erwartet += (latest.quantity * (Math.min(weekEnd, monthEnd) - cursor)) / WEEK_MS;
        cursor = weekEnd;
      }
    }
  }
  return { fest, erwartet };
}

/** Soll eines Bezugs im laufenden Monat (siehe Zielmodell oben). */
export function subscriptionMonthGoal(sub: GoalSubscription, w: GoalWindow): SubscriptionGoal {
  const geliefert = Math.max(0, sub.deliveredMonth);
  const out = (fest: number, erwartet: number): SubscriptionGoal => ({
    subscriptionId: sub.id,
    customerId: sub.customerId,
    soll: geliefert + fest + erwartet,
    geliefert,
    fest,
    erwartet,
    price: sub.price,
    taxFree: sub.taxFree,
  });

  const lieferbar = sub.active && !sub.dormant && !(sub.startDate && sub.startDate >= w.monthEnd);
  if (!lieferbar) return out(0, 0);

  if (sub.period === "week") {
    const { fest, erwartet } = weekOrdersOpen(sub, w);
    return out(fest, erwartet);
  }

  const test = sub.status === "test" && (sub.testQuantity ?? 0) > 0;
  const areaSum = sub.areas.length ? areaMonthQuantity(sub, w) : 0;
  if (sub.period === "month") {
    const base = sub.goal ?? (areaSum > 0 ? areaSum : test ? sub.testQuantity! : 0);
    // Test-Mengen werden nicht gekürzt (wie bisher bei Airtable-Test-Bezügen).
    const quota = sub.goal == null && areaSum === 0 && test ? base : prorateFromStart(base, sub.startDate, w);
    return out(Math.max(0, quota - geliefert), 0);
  }
  // once (und unbekannte Zeiträume wie einmalig behandeln)
  const total = sub.goal ?? (areaSum > 0 ? areaSum : test ? sub.testQuantity! : 0);
  return out(Math.max(0, total - sub.deliveredBefore - geliefert), 0);
}

export type PoolCustomerGoal = {
  customerId: string;
  goal: number;
  delivered: number;
};

export type SoftwarePoolGoal = {
  goal: number;
  geliefert: number;
  fest: number;
  erwartet: number;
  /** Lead-Preis gewichtet mit dem Soll; null = kein Preis. */
  leadPrice: number | null;
  /** Anteil steuerfreier Leads (nach Soll gewichtet), 0..1. */
  taxFreeShare: number;
  customers: PoolCustomerGoal[];
};

/** Fasst die Soll-Werte der Bezüge eines Pools zusammen. */
export function aggregatePoolGoal(goals: SubscriptionGoal[]): SoftwarePoolGoal {
  let soll = 0;
  let geliefert = 0;
  let fest = 0;
  let erwartet = 0;
  let priceWeighted = 0;
  let taxFreeWeighted = 0;
  const byCustomer = new Map<string, { goal: number; delivered: number }>();
  for (const g of goals) {
    soll += g.soll;
    geliefert += g.geliefert;
    fest += g.fest;
    erwartet += g.erwartet;
    if (g.price > 0) priceWeighted += g.price * g.soll;
    if (g.taxFree) taxFreeWeighted += g.soll;
    const c = byCustomer.get(g.customerId) ?? { goal: 0, delivered: 0 };
    c.goal += g.soll;
    c.delivered += g.geliefert;
    byCustomer.set(g.customerId, c);
  }
  const pricedSoll = goals.filter((g) => g.price > 0).reduce((s, g) => s + g.soll, 0);
  let leadPrice: number | null = null;
  if (pricedSoll > 0) leadPrice = priceWeighted / pricedSoll;
  else {
    const prices = goals.map((g) => g.price).filter((p) => p > 0);
    if (prices.length) leadPrice = prices.reduce((s, p) => s + p, 0) / prices.length;
  }
  const taxFreeShare =
    soll > 0 ? taxFreeWeighted / soll : goals.length ? goals.filter((g) => g.taxFree).length / goals.length : 0;
  return {
    goal: Math.round(soll),
    geliefert,
    fest,
    erwartet,
    leadPrice: leadPrice != null ? Math.round(leadPrice * 100) / 100 : null,
    taxFreeShare,
    customers: [...byCustomer.entries()]
      .map(([customerId, c]) => ({ customerId, goal: Math.round(c.goal), delivered: c.delivered }))
      .filter((c) => c.goal > 0 || c.delivered > 0),
  };
}

// ─── Rückstand je Kunde ──────────────────────────────────────────────

export const CUSTOMER_BACKLOG_THRESHOLD = 0.95;

/**
 * Kunden mit Rückstand, wenn das Pool-Ziel erreicht ist: die Pool-Summe kann
 * voll sein, obwohl einzelne Kunden zu wenig bekommen haben (Verteilung über
 * Filter/Gebiete). Liefert die Kunden unter `threshold` ihres Ziels.
 */
export function customersBehind(
  pool: { goal: number; leadsMtd: number; customers: PoolCustomerGoal[] },
  threshold = CUSTOMER_BACKLOG_THRESHOLD,
): PoolCustomerGoal[] {
  if (pool.goal <= 0 || pool.leadsMtd < pool.goal) return [];
  return pool.customers.filter((c) => c.goal > 0 && c.delivered / c.goal < threshold);
}

// ─── Lieferungs-Pacing (Zielquelle software) ─────────────────────────
//
// Fehler vom 20.11.2026 (PKV Tarifoptimierung): Das Ist zählte alle Leads des
// Produkts im Monat (countPoolLeads, brutto: auch geparkte, verworfene,
// ungültige, Altbestand, andere Abnehmer), das Software-Ziel aber nur die
// Bezüge. Ergebnis: Ist 134 ≥ Ziel 129 → „Ziel erreicht“, obwohl die Kunden
// zusammen erst 34 von 129 bekommen hatten.
//
// Regel seitdem:
//   Ist        = an die Bezüge des Pools im Monat gelieferte Leads (wie „Ziel
//                je Kunde“).
//   offen      = Summe je Kunde von (Ziel − geliefert); ein Kunde gilt mit
//                Toleranz (MEDIA_BUYER_GOAL_TOLERANCE, 2 %, mind. 1 Lead) als
//                erreicht und hat dann nichts mehr offen. Überlieferung eines
//                Kunden gleicht den Rückstand eines anderen NICHT aus.
//   Ziel erreicht / Pausieren nur bei offen = 0 (alle Kunden erreicht).
//   Verwertungsquote = geliefert / eingegangen der letzten 14–30 Tage
//                (eingegangen = countPoolLeads, dieselbe Basis wie der CPL).
//   benötigte eingehende Leads = offen / Verwertungsquote.
//   Für decideBudget/guardLearning (rechnen in eingehenden Leads, CPL je
//   eingehendem Lead) wird das Ziel in eingehende Leads übersetzt:
//     steerLeads = eingegangen MTD, steerGoal = eingegangen MTD + benötigte.
//   Prognose (geliefert) = geliefert + Eingangs-Tempo × Quote × Resttage.
//   Plausibilität: Quote außerhalb [min, max] oder unabhängig gezählte
//   Pool-Lieferung weicht stark von der Summe der Kunden ab → nicht steuern,
//   halten und Push. Eine große Lücke zwischen eingegangen und geliefert ist
//   dagegen normal (Dubletten, Parken, Altbestand) und kein Haltegrund.

export type DeliveryPacingInput = {
  goal: number;
  customers: PoolCustomerGoal[];
  /** Eingegangene Leads im Monat (countPoolLeads). */
  incomingMtd: number;
  /** Eingegangen / geliefert im Quoten-Fenster (14–30 Tage). */
  recentIncoming: number;
  recentDelivered: number;
  /** Unabhängig gezählte Pool-Lieferung im Monat (Plausibilität); null = nicht geprüft. */
  poolDeliveredCheck?: number | null;
  daysElapsed: number;
  daysTotal: number;
  tolerance?: number;
  minYield?: number;
  maxYield?: number;
  /** Mindestmenge eingegangener Leads für eine gemessene Quote. */
  minSample?: number;
  mismatchShare?: number;
  mismatchMin?: number;
};

export type DeliveryPacing = {
  delivered: number;
  goal: number;
  open: number;
  incomingMtd: number;
  allReached: boolean;
  behind: PoolCustomerGoal[];
  yieldRate: number;
  yieldSource: "recent" | "mtd" | "default";
  neededIncoming: number;
  steerLeads: number;
  steerGoal: number;
  projectedDelivered: number;
  plausible: boolean;
  problem: string | null;
};

export function deliveryPacing(p: DeliveryPacingInput): DeliveryPacing {
  const tol = p.tolerance ?? 0.02;
  const minYield = p.minYield ?? 0.1;
  const maxYield = p.maxYield ?? 1.2;
  const minSample = p.minSample ?? 20;
  const mismatchShare = p.mismatchShare ?? 0.25;
  const mismatchMin = p.mismatchMin ?? 10;

  const delivered = p.customers.reduce((s, c) => s + Math.max(0, c.delivered), 0);
  const behind: PoolCustomerGoal[] = [];
  let open = 0;
  const withGoal = p.customers.filter((c) => c.goal > 0);
  if (withGoal.length > 0) {
    for (const c of withGoal) {
      const short = c.goal - c.delivered;
      // Erreicht mit Toleranz: höchstens max(1, 2 % des Ziels) fehlen.
      if (short <= 0 || short < Math.max(1, c.goal * tol)) continue;
      behind.push(c);
      open += short;
    }
  } else if (p.goal > 0) {
    // Ohne Kundenaufteilung (sollte bei software nicht vorkommen): Pool-Summe.
    const short = p.goal - delivered;
    open = short > 0 && short >= Math.max(1, p.goal * tol) ? short : 0;
  }
  open = Math.round(open);

  let yieldRate = 1;
  let yieldSource: DeliveryPacing["yieldSource"] = "default";
  if (p.recentIncoming >= minSample) {
    yieldRate = p.recentDelivered / p.recentIncoming;
    yieldSource = "recent";
  } else if (p.incomingMtd >= minSample) {
    yieldRate = delivered / p.incomingMtd;
    yieldSource = "mtd";
  }

  const problems: string[] = [];
  if (yieldSource !== "default" && (yieldRate < minYield || yieldRate > maxYield)) {
    problems.push(
      `Verwertungsquote ${Math.round(yieldRate * 100)} % unplausibel (erwartet ${Math.round(minYield * 100)}–${Math.round(maxYield * 100)} %)`,
    );
  }
  if (p.poolDeliveredCheck != null) {
    const diff = Math.abs(p.poolDeliveredCheck - delivered);
    if (diff > Math.max(mismatchMin, mismatchShare * Math.max(p.poolDeliveredCheck, delivered))) {
      problems.push(`Pool-Lieferung ${p.poolDeliveredCheck} weicht von der Summe der Kunden ${delivered} ab`);
    }
  }

  const rate = Math.min(maxYield, Math.max(minYield, yieldRate));
  const neededIncoming = open > 0 ? Math.ceil(open / rate) : 0;
  // Bei offen = 0 steerLeads = steerGoal ≥ 1, damit decideBudget pausiert
  // (Ziel 0 hieße dort „kein Ziel, nur Monitoring“).
  const steerGoal = open > 0 ? p.incomingMtd + neededIncoming : Math.max(1, p.incomingMtd);
  const steerLeads = open > 0 ? p.incomingMtd : steerGoal;
  const daysLeft = Math.max(0, p.daysTotal - p.daysElapsed);
  const pace = p.daysElapsed > 0 ? p.incomingMtd / p.daysElapsed : 0;
  const projectedDelivered = Math.round(delivered + pace * rate * daysLeft);

  return {
    delivered,
    goal: p.goal,
    open,
    incomingMtd: p.incomingMtd,
    allReached: p.goal > 0 && open === 0,
    behind,
    yieldRate,
    yieldSource,
    neededIncoming,
    steerLeads,
    steerGoal,
    projectedDelivered,
    plausible: problems.length === 0,
    problem: problems.length ? problems.join("; ") : null,
  };
}

/** Kurztext für Begründungen. */
export function describePacing(pc: DeliveryPacing): string {
  if (pc.open === 0) return `Geliefert ${pc.delivered}/${pc.goal}, alle Kunden erreicht.`;
  const quote = `${Math.round(pc.yieldRate * 100)} %${pc.yieldSource === "default" ? " (angenommen, zu wenig Daten)" : ""}`;
  return `Geliefert ${pc.delivered}/${pc.goal}, offen ${pc.open} (${pc.behind.length} Kunden), eingegangen ${pc.incomingMtd}, Verwertung ${quote}: ~${pc.neededIncoming} eingehende Leads nötig.`;
}

/**
 * Plausibilitätsschutz: Entscheidung halten (nichts schreiben, nicht pausieren).
 */
export function holdForImplausible<T extends StepDecision>(decision: T, problem: string): T {
  return {
    ...decision,
    action: "none",
    setStatus: null,
    targetBudget: null,
    reason: `Zahlen unplausibel (${problem}): Budget gehalten, nicht pausiert. Geplant war: ${decision.reason}`,
  };
}

// ─── Quellenwechsel ──────────────────────────────────────────────────

/**
 * Schonlauf beim Wechsel der Zielquelle mitten im Monat: Hat der letzte echte
 * Lauf dieses Monats mit der anderen Quelle gesteuert und weicht das Ziel ab,
 * gilt in diesem Lauf die Schrittgrenze (±20 %) und es wird nicht pausiert
 * (limitForSourceSwitch). Ab dem nächsten Lauf greifen die normalen Regeln.
 * Ein Lauf ohne gespeicherte Quelle gilt als Airtable (vor der Umstellung).
 */
export function holdForSourceSwitch(p: {
  source: GoalSource;
  goal: number;
  last: { goalSource: string | null; goal: number; at: Date } | null;
  monthStart: Date;
}): { hold: boolean; from: GoalSource | null; prevGoal: number | null } {
  if (!p.last || p.last.at < p.monthStart) return { hold: false, from: null, prevGoal: null };
  const from: GoalSource = p.last.goalSource === "software" ? "software" : "airtable";
  if (from === p.source || p.last.goal === p.goal) return { hold: false, from, prevGoal: p.last.goal };
  return { hold: true, from, prevGoal: p.last.goal };
}

type StepDecision = {
  action: "increase" | "decrease" | "pause" | "activate" | "boost" | "none";
  reason: string;
  targetBudget: number | null;
  setStatus: "ACTIVE" | "PAUSED" | null;
};

/** Begrenzt eine Entscheidung im Wechsel-Lauf: kein Pausieren, höchstens ±step. */
export function limitForSourceSwitch<T extends StepDecision>(p: {
  decision: T;
  currentBudget: number;
  note: string;
  step?: number;
}): { decision: T; changed: boolean } {
  const step = p.step ?? 0.2;
  const d = p.decision;
  if (d.setStatus === "PAUSED") {
    return {
      decision: { ...d, action: "none", setStatus: null, targetBudget: null, reason: `${p.note}: nicht pausiert. Geplant war: ${d.reason}` },
      changed: true,
    };
  }
  if (d.targetBudget == null || p.currentBudget <= 0) return { decision: d, changed: false };
  const lo = p.currentBudget * (1 - step);
  const hi = p.currentBudget * (1 + step);
  if (d.targetBudget >= lo && d.targetBudget <= hi) return { decision: d, changed: false };
  const target = Math.min(hi, Math.max(lo, d.targetBudget));
  return {
    decision: { ...d, targetBudget: target, reason: `${p.note}: Schritt auf ±${Math.round(step * 100)} % begrenzt. ${d.reason}` },
    changed: true,
  };
}
