// Budget ändern (Kundenbereich → Konto → Werbebudget): reine Rechenregeln für
// Live-Vorschau, Preisstufe und Freigabe. Nutzbar im Browser und auf dem Server.
// Alle Beträge netto in EUR; Werte kommen aus PRICE_LIST, nichts hart codiert.

import { PRICE_LIST } from "@/lib/offer-pricing";

export type BudgetLine = { product: string; dailyBudget: number };

/** Unterhalb gilt die Lead-Garantie nicht (AGB: mindestens 20 € pro Tag und Produkt). */
export const LEAD_GUARANTEE_MIN_DAILY = 20;
export const BUDGET_STEP = 5;
export const BUDGET_MIN_DAILY = 5;
export const BUDGET_MAX_DAILY = 500;

export type Tier = { index: number; maxBudget: number; monthly: number; label: string; from: number };

/** Preisstufe zum Werbebudget pro Monat; null = über PRICE_LIST.individualFrom (individuelles Angebot). */
export function tierFor(monthlyBudget: number): Tier | null {
  const i = PRICE_LIST.tiers.findIndex((t) => monthlyBudget <= t.maxBudget);
  if (i < 0) return null;
  const t = PRICE_LIST.tiers[i];
  return { index: i, maxBudget: t.maxBudget, monthly: t.monthly, label: t.label, from: i === 0 ? 0 : PRICE_LIST.tiers[i - 1].maxBudget };
}

export const monthlyOf = (lines: BudgetLine[]) =>
  Math.round(lines.reduce((s, l) => s + (Number.isFinite(l.dailyBudget) ? Math.max(0, l.dailyBudget) : 0), 0) * PRICE_LIST.daysPerMonth);

/** Listenpreis Betreuung + Software für dieses Budget (wie im Angebot: Stufe + weitere Produkte). */
export function listFeeFor(monthlyBudget: number, productCount: number): number | null {
  const t = tierFor(monthlyBudget);
  return t ? t.monthly + Math.max(0, productCount - 1) * PRICE_LIST.extraProductMonthly : null;
}

export type BudgetContext = {
  /** "software" = Betreuung + Software (Staffel), "service" = Nur Betreuung (fester Preis, keine Staffel). */
  plan: string;
  /** Vereinbarter Monatspreis Betreuung + Software (Customer.retainerMonthly). */
  feeMonthly: number | null;
  billingInterval: string;
  /** Echter Leadpreis des Kunden (letzte 30 Tage) oder Standard aus dem Rechner. */
  cpl: number;
  cplSource: "kunde" | "standard";
};

export type PricingMode =
  /** Paket ohne Staffel (Nur Betreuung): Preis bleibt. */
  | "fixed"
  /** Listenpreis: neuer Preis wird automatisch übernommen. */
  | "list"
  /** Abweichende Konditionen oder Jahreszahler: Budget sofort, Preis prüfen wir. */
  | "individual";

export type BudgetPreview = {
  monthlyFrom: number;
  monthlyTo: number;
  leadsFrom: number;
  leadsTo: number;
  tierFrom: Tier | null;
  tierTo: Tier | null;
  /** Stufenwechsel (nur Paket mit Staffel). */
  tierChange: boolean;
  /** Neues Budget liegt über PRICE_LIST.individualFrom → keine Selbstbedienung. */
  overIndividual: boolean;
  feeFrom: number | null;
  /** Neuer Monatspreis; null = individuell (nicht automatisch). */
  feeTo: number | null;
  pricing: PricingMode;
  /** Produkte unter LEAD_GUARANTEE_MIN_DAILY (ohne Lead-Garantie). */
  belowGuarantee: string[];
  changed: boolean;
};

/** Live-Vorschau für das Formular und dieselbe Rechnung beim Speichern. */
export function previewChange(current: BudgetLine[], next: BudgetLine[], ctx: BudgetContext): BudgetPreview {
  const monthlyFrom = monthlyOf(current);
  const monthlyTo = monthlyOf(next);
  const service = ctx.plan === "service";
  const tierFrom = service ? null : tierFor(monthlyFrom);
  const tierTo = service ? null : tierFor(monthlyTo);
  const overIndividual = !service && monthlyTo > PRICE_LIST.individualFrom;
  const tierChange = !service && !overIndividual && (tierFrom?.index ?? -1) !== (tierTo?.index ?? -1);
  const listFrom = listFeeFor(monthlyFrom, current.length);
  const listTo = listFeeFor(monthlyTo, next.length);
  const pricing: PricingMode = service
    ? "fixed"
    : ctx.feeMonthly == null || listFrom == null || Math.abs(ctx.feeMonthly - listFrom) > 0.5 || ctx.billingInterval === "year"
      ? "individual"
      : "list";
  const feeFrom = ctx.feeMonthly;
  const feeTo = pricing === "fixed" ? ctx.feeMonthly : pricing === "list" ? listTo : null;
  const leads = (m: number) => (ctx.cpl > 0 ? Math.round(m / ctx.cpl) : 0);
  const byProduct = new Map(current.map((l) => [l.product, l.dailyBudget]));
  return {
    monthlyFrom,
    monthlyTo,
    leadsFrom: leads(monthlyFrom),
    leadsTo: leads(monthlyTo),
    tierFrom,
    tierTo,
    tierChange,
    overIndividual,
    feeFrom,
    feeTo,
    pricing,
    belowGuarantee: next.filter((l) => l.dailyBudget < LEAD_GUARANTEE_MIN_DAILY).map((l) => l.product),
    changed: next.some((l) => Math.abs((byProduct.get(l.product) ?? -1) - l.dailyBudget) > 0.001),
  };
}

export type Approval =
  /** Budget sofort übernehmen, kein Preiswechsel. */
  | { kind: "apply"; price: "none" }
  /** Budget sofort übernehmen, Abo-Preis automatisch ab dem nächsten Abrechnungsmonat. */
  | { kind: "apply"; price: "auto" }
  /** Budget sofort übernehmen, Preis prüft der Admin (individuelle Konditionen). */
  | { kind: "apply"; price: "manual"; reason: "individual_terms" | "annual" | "no_offer_price" }
  /** Keine Selbstbedienung: Anfrage an uns (über PRICE_LIST.individualFrom). */
  | { kind: "request"; reason: "individual_budget" };

/**
 * Freigaberegel (Ole, 11.11.2026): Erhöhung und Senkung werden immer sofort übernommen,
 * Ole wird nur informiert. Ausnahmen: über individualFrom → Anfrage; individuelle
 * Konditionen → Budget sofort, Preis nicht automatisch (Admin-Aufgabe „Preis prüfen“).
 */
export function decideApproval(p: BudgetPreview, ctx: Pick<BudgetContext, "billingInterval" | "feeMonthly">): Approval {
  if (p.overIndividual) return { kind: "request", reason: "individual_budget" };
  if (p.pricing === "fixed") return { kind: "apply", price: "none" };
  if (p.pricing === "individual") {
    // Ohne Stufenwechsel bleibt der Preis; mit Stufenwechsel prüfen wir den neuen Preis von Hand
    if (!p.tierChange) return { kind: "apply", price: "none" };
    return {
      kind: "apply",
      price: "manual",
      reason: ctx.billingInterval === "year" ? "annual" : ctx.feeMonthly == null ? "no_offer_price" : "individual_terms",
    };
  }
  if (p.feeTo != null && p.feeFrom != null && Math.abs(p.feeTo - p.feeFrom) > 0.005) return { kind: "apply", price: "auto" };
  return { kind: "apply", price: "none" };
}

/** Pflicht-Bestätigung „neuer Monatspreis zur Kenntnis genommen“: bei Stufenwechsel oder geändertem Preis. */
export const needsAcknowledge = (p: BudgetPreview) =>
  !p.overIndividual && (p.tierChange || (p.feeTo != null && p.feeFrom != null && Math.abs(p.feeTo - p.feeFrom) > 0.005));

const eur0 = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

/** Deutlicher Satz zur Betreuungsstufe für Kunde, Mail und Protokoll. */
export function tierSentence(p: BudgetPreview): string | null {
  if (p.overIndividual) {
    return `Ab ${eur0(PRICE_LIST.individualFrom)} Werbebudget pro Monat erstellen wir Ihnen ein individuelles Angebot. Wir melden uns bei Ihnen.`;
  }
  if (!p.tierChange || !p.tierTo) return null;
  const range = p.tierTo.label;
  const up = (p.tierFrom?.index ?? -1) < p.tierTo.index;
  const price =
    p.pricing === "list" && p.feeTo != null && p.feeFrom != null
      ? `: ${eur0(p.feeTo)} statt ${eur0(p.feeFrom)} netto im Monat, ab dem nächsten Abrechnungsmonat.`
      : p.pricing === "individual"
        ? ". Ihre Konditionen sind individuell, wir bestätigen Ihnen den neuen Preis."
        : ".";
  return `Mit ${eur0(p.monthlyTo)} Werbebudget pro Monat gilt die ${up ? "nächste" : "niedrigere"} Betreuungsstufe (${range})${price}`;
}
