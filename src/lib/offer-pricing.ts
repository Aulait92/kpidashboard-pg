// Preisliste für Angebote (Leadgenerierung + Software). Reine Funktionen,
// nutzbar im Formular (Live-Vorschau), auf der Angebotsseite und im PDF.
// Alle Beträge netto in EUR; USt. wird nur angezeigt.

export const PRICE_LIST = {
  setupNoTerm: 2490,
  setup12m: 990,
  extraProductSetup: 990,
  extraProductMonthly: 350,
  softwareFee: 349,
  vatRate: 0.19,
  /** Monatliche Betreuung + Software nach Gesamt-Werbebudget pro Monat. */
  tiers: [
    { maxBudget: 3000, monthly: 1000, label: "bis 3.000 €" },
    { maxBudget: 6000, monthly: 1400, label: "3.000 – 6.000 €" },
    { maxBudget: 10000, monthly: 1800, label: "6.000 – 10.000 €" },
  ],
  /** Ab hier gibt es kein Listenpreis mehr → individuell. */
  individualFrom: 10000,
  daysPerMonth: 30.4,
} as const;

export type OfferTerm = "none" | "12m";
export type OfferProduct = { name: string; dailyBudget: number };

export type OfferInput = {
  term: OfferTerm;
  products: OfferProduct[];
  /** Überschreibt den berechneten Setup-Preis (Sonderkondition). */
  setupOverride?: number | null;
  /** Überschreibt die berechnete Monatsgebühr (Sonderkondition / individuell). */
  monthlyOverride?: number | null;
};

export type OfferPrice = {
  monthlyBudget: number;
  tierLabel: string;
  individual: boolean;
  baseSetup: number;
  extraProducts: number;
  listSetup: number;
  listMonthly: number | null;
  setupFee: number;
  monthlyFee: number | null;
  softwareFee: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function monthlyBudgetOf(products: OfferProduct[]): number {
  const daily = products.reduce((s, p) => s + (Number.isFinite(p.dailyBudget) ? Math.max(0, p.dailyBudget) : 0), 0);
  return Math.round(daily * PRICE_LIST.daysPerMonth);
}

export function computeOfferPrice(input: OfferInput): OfferPrice {
  const products = input.products.filter((p) => p.name.trim());
  const monthlyBudget = monthlyBudgetOf(products);
  const extraProducts = Math.max(0, products.length - 1);
  const baseSetup = input.term === "12m" ? PRICE_LIST.setup12m : PRICE_LIST.setupNoTerm;
  const listSetup = baseSetup + extraProducts * PRICE_LIST.extraProductSetup;

  const tier = PRICE_LIST.tiers.find((t) => monthlyBudget <= t.maxBudget);
  const individual = !tier;
  const listMonthly = tier ? tier.monthly + extraProducts * PRICE_LIST.extraProductMonthly : null;

  const setupFee = input.setupOverride != null && input.setupOverride >= 0 ? input.setupOverride : listSetup;
  const monthlyFee =
    input.monthlyOverride != null && input.monthlyOverride >= 0 ? input.monthlyOverride : listMonthly;

  return {
    monthlyBudget,
    tierLabel: tier ? tier.label : `ab ${PRICE_LIST.individualFrom.toLocaleString("de-DE")} € (individuell)`,
    individual,
    baseSetup,
    extraProducts,
    listSetup,
    listMonthly,
    setupFee: round2(setupFee),
    monthlyFee: monthlyFee == null ? null : round2(monthlyFee),
    softwareFee: PRICE_LIST.softwareFee,
  };
}

export const withVat = (net: number) => round2(net * (1 + PRICE_LIST.vatRate));
export const vatOf = (net: number) => round2(net * PRICE_LIST.vatRate);

export const eur = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

export const TERM_LABEL: Record<OfferTerm, string> = {
  none: "Ohne Vertragslaufzeit (monatlich kündbar)",
  "12m": "12 Monate Laufzeit",
};
