// Preisliste für Angebote (Leadgenerierung + Software). Reine Funktionen,
// nutzbar im Formular (Live-Vorschau), auf der Angebotsseite und im PDF.
// Alle Beträge netto in EUR; USt. wird nur angezeigt.

export const PRICE_LIST = {
  setupNoTerm: 2490,
  setup12m: 990,
  extraProductSetup: 990,
  extraProductMonthly: 350,
  softwareFee: 349,
  /** Paket „Nur Betreuung“ (ohne Software): fester Monatspreis, Pause 0 €. */
  serviceOnlyMonthly: 700,
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
  // ─── Zusätze (Ole, 11.11.2026) ───
  /** Logins inklusive (Inhaber + 2 Berater), nur Paket Betreuung + Software. */
  seatsIncluded: 3,
  /** Jeder weitere Login je Monat (netto). */
  seatMonthly: 49,
  /** Ab so vielen Logins individuell (Preis per Sonderkondition). */
  seatIndividualFrom: 10,
  /** Jährlich im Voraus: so viele Monate geschenkt (nur mit 12 Monaten Laufzeit). */
  annualFreeMonths: 2,
  /** Bestandskunden-Modul je Monat (netto), inkl. WhatsApp-Gebühren bis zum Kontingent. */
  bestandModuleMonthly: 149,
  /** Kampagnen-Nachrichten im Bestandskunden-Modul je Kalendermonat inklusive. */
  bestandIncludedMessages: 500,
  /** WhatsApp-Gebühren von Meta sind im Preis enthalten (keine Weiterberechnung). */
  whatsappIncluded: true,
} as const;

export type OfferTerm = "none" | "12m";
export type OfferPackage = "software" | "service";
export type OfferProduct = { name: string; dailyBudget: number };

export type OfferInput = {
  /** Standard: Betreuung + Software. */
  package?: OfferPackage;
  term: OfferTerm;
  products: OfferProduct[];
  /** Überschreibt den berechneten Setup-Preis (Sonderkondition). */
  setupOverride?: number | null;
  /** Überschreibt die berechnete Monatsgebühr (Sonderkondition / individuell). */
  monthlyOverride?: number | null;
  /** Logins gesamt (Inhaber + Berater); Standard = inklusive Anzahl. */
  seats?: number | null;
  /** Jährlich im Voraus zahlen (nur mit 12 Monaten Laufzeit). */
  annual?: boolean;
  /** Bestandskunden-Modul dazubuchen (nur Betreuung + Software). */
  bestandModule?: boolean;
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
  /** Logins gesamt, davon inklusive, weitere (berechnet). */
  seats: number;
  seatsIncluded: number;
  extraSeats: number;
  /** Monatlich für weitere Logins (0 = keine / im individuellen Preis enthalten). */
  seatsFee: number;
  /** Ab {@link PRICE_LIST.seatIndividualFrom} Logins individuell. */
  seatsIndividual: boolean;
  bestandFee: number;
  /** Monatlich gesamt (Paket + Logins + Modul); null = individuell offen. */
  monthlyTotal: number | null;
  annual: boolean;
  /** Jahresbetrag bei jährlicher Vorauszahlung; null ohne Jahreszahlung. */
  annualTotal: number | null;
  /** Ersparnis durch die Freimonate. */
  annualSavings: number;
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

  const serviceOnly = input.package === "service";
  const tier = serviceOnly ? null : PRICE_LIST.tiers.find((t) => monthlyBudget <= t.maxBudget);
  const individual = !serviceOnly && !tier;
  const base = serviceOnly ? PRICE_LIST.serviceOnlyMonthly : (tier?.monthly ?? null);
  const listMonthly = base == null ? null : base + extraProducts * PRICE_LIST.extraProductMonthly;

  // Logins: nur im Paket mit Software; ab seatIndividualFrom individuell (Preis per Sonderkondition).
  const seatsIncluded = serviceOnly ? 0 : PRICE_LIST.seatsIncluded;
  const seats = serviceOnly ? 0 : Math.max(1, Math.round(Number(input.seats ?? seatsIncluded) || seatsIncluded));
  const seatsIndividual = !serviceOnly && seats >= PRICE_LIST.seatIndividualFrom;
  const extraSeats = serviceOnly ? 0 : Math.max(0, seats - seatsIncluded);
  const seatsFee = seatsIndividual ? 0 : extraSeats * PRICE_LIST.seatMonthly;
  const bestandFee = !serviceOnly && input.bestandModule ? PRICE_LIST.bestandModuleMonthly : 0;
  const listBase = seatsIndividual ? null : listMonthly;

  const setupFee = input.setupOverride != null && input.setupOverride >= 0 ? input.setupOverride : listSetup;
  const monthlyFee =
    input.monthlyOverride != null && input.monthlyOverride >= 0 ? input.monthlyOverride : listBase;
  const monthlyTotal = monthlyFee == null ? null : round2(monthlyFee + seatsFee + bestandFee);
  const annual = !!input.annual && input.term === "12m";
  const annualTotal = annual && monthlyTotal != null ? round2(monthlyTotal * (12 - PRICE_LIST.annualFreeMonths)) : null;

  return {
    monthlyBudget,
    tierLabel: serviceOnly
      ? "Nur Betreuung (ohne Software)"
      : tier
        ? tier.label
        : `ab ${PRICE_LIST.individualFrom.toLocaleString("de-DE")} € (individuell)`,
    individual: individual || seatsIndividual,
    baseSetup,
    extraProducts,
    listSetup,
    listMonthly: listBase,
    setupFee: round2(setupFee),
    monthlyFee: monthlyFee == null ? null : round2(monthlyFee),
    softwareFee: serviceOnly ? 0 : PRICE_LIST.softwareFee,
    seats,
    seatsIncluded,
    extraSeats,
    seatsFee: round2(seatsFee),
    seatsIndividual,
    bestandFee,
    monthlyTotal,
    annual,
    annualTotal,
    annualSavings: annualTotal != null && monthlyTotal != null ? round2(monthlyTotal * 12 - annualTotal) : 0,
  };
}

/** Gespeicherte Zusätze eines Angebots (Snapshot) → Beträge für Anzeige und Abrechnung. */
export type OfferAddOnsInput = {
  monthlyFee: number;
  seats: number | null;
  seatsIncluded: number | null;
  seatMonthly: number | null;
  bestandMonthly: number | null;
  annualPrepay: boolean;
  annualFreeMonths: number | null;
};

export type OfferAddOns = {
  /** Platz-Abrechnung vereinbart (Neu-Angebote mit Software). */
  hasSeats: boolean;
  seats: number;
  seatsIncluded: number;
  extraSeats: number;
  seatMonthly: number;
  seatsFee: number;
  bestandFee: number;
  monthlyTotal: number;
  annual: boolean;
  freeMonths: number;
  annualTotal: number | null;
  annualSavings: number;
};

export function offerAddOns(o: OfferAddOnsInput): OfferAddOns {
  const hasSeats = o.seats != null && o.seatsIncluded != null;
  const seatsIncluded = o.seatsIncluded ?? 0;
  const seats = o.seats ?? 0;
  const seatMonthly = o.seatMonthly ?? 0;
  const extraSeats = hasSeats ? Math.max(0, seats - seatsIncluded) : 0;
  const seatsFee = round2(extraSeats * seatMonthly);
  const bestandFee = o.bestandMonthly ?? 0;
  const monthlyTotal = round2(o.monthlyFee + seatsFee + bestandFee);
  const freeMonths = o.annualPrepay ? (o.annualFreeMonths ?? PRICE_LIST.annualFreeMonths) : 0;
  const annualTotal = o.annualPrepay ? round2(monthlyTotal * (12 - freeMonths)) : null;
  return {
    hasSeats,
    seats,
    seatsIncluded,
    extraSeats,
    seatMonthly,
    seatsFee,
    bestandFee,
    monthlyTotal,
    annual: o.annualPrepay,
    freeMonths,
    annualTotal,
    annualSavings: annualTotal != null ? round2(monthlyTotal * 12 - annualTotal) : 0,
  };
}

/** Faktor Monatspreis → Jahrespreis bei Vorauszahlung (z. B. 10). */
export const annualMultiplier = (freeMonths: number = PRICE_LIST.annualFreeMonths) => 12 - freeMonths;

export const withVat = (net: number) => round2(net * (1 + PRICE_LIST.vatRate));
export const vatOf = (net: number) => round2(net * PRICE_LIST.vatRate);

export const eur = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

export const TERM_LABEL: Record<OfferTerm, string> = {
  none: "Ohne Vertragslaufzeit (monatlich kündbar)",
  "12m": "12 Monate Laufzeit",
};

export const PACKAGE_LABEL: Record<OfferPackage, string> = {
  software: "Betreuung + Software",
  service: "Nur Betreuung",
};

/** Startdatum-Vorschlag: der 1. des Folgemonats (YYYY-MM-DD). */
export function defaultStartDate(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return d.toISOString().slice(0, 10);
}
