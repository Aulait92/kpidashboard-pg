// Preisliste für Angebote (Leadgenerierung + Software). Reine Funktionen,
// nutzbar im Formular (Live-Vorschau), auf der Angebotsseite und im PDF.
// Alle Beträge netto in EUR; USt. wird nur angezeigt.

export const PRICE_LIST = {
  setupNoTerm: 2490,
  /** Mindestlaufzeit 3 Monate (Ole, 11.11.2026). */
  setup3m: 1990,
  /** Mindestlaufzeit 6 Monate (Ole, 18.11.2026). */
  setup6m: 1490,
  setup12m: 990,
  /** Jedes weitere Produkt: keine Einrichtung mehr, nur der Monatsbetrag (Ole, 15.11.2026; vorher 990 €). */
  extraProductSetup: 0,
  extraProductMonthly: 350,
  /** Einrichtung, wenn ein Bestandskunde ein weiteres Produkt selbst bucht (Ole, 12.11.: entfällt). */
  extraProductSetupSelfService: 0,
  softwareFee: 349,
  /** Paket „Nur Betreuung“ (ohne Software): fester Monatspreis, Pause 0 €. */
  serviceOnlyMonthly: 700,
  vatRate: 0.19,
  /**
   * Monatliche Betreuung + Software nach Gesamt-Werbebudget pro Monat. Seit 18.11.2026 (Ole) 990/1.390/1.790 €,
   * vorher 1.000/1.400/1.800 € ({@link LISTENPREISE_ALT}).
   */
  tiers: [
    { maxBudget: 3000, monthly: 990, label: "bis 3.000 €" },
    { maxBudget: 6000, monthly: 1390, label: "3.000–6.000 €" },
    { maxBudget: 10000, monthly: 1790, label: "6.000–10.000 €" },
  ],
  /** Ab hier gibt es kein Listenpreis mehr → individuell. */
  individualFrom: 10000,
  daysPerMonth: 30,
  // ─── Zusätze (Ole, 11.11.2026) ───
  /** Aktive Verkäufer inklusive (bekommen Leads; Mitglieder ohne Leads kostenlos, lib/seats.ts), nur Paket Betreuung + Software. */
  seatsIncluded: 3,
  /** Jeder weitere aktive Verkäufer je Monat (netto). */
  seatMonthly: 49,
  /** Ab so vielen aktiven Verkäufern individuell (Preis per Sonderkondition). */
  seatIndividualFrom: 10,
  /** Jährlich im Voraus: so viele Monate geschenkt (nur mit 12 Monaten Laufzeit). */
  annualFreeMonths: 2,
  /** 6 Monate im Voraus: so viele Monate geschenkt (nur mit 6 Monaten Laufzeit, Ole 18.11.2026). */
  halfYearFreeMonths: 1,
  /** Bestandskunden-Modul je Monat (netto), inkl. WhatsApp-Gebühren bis zum Kontingent. */
  bestandModuleMonthly: 149,
  /** Kampagnen-Nachrichten im Bestandskunden-Modul je Kalendermonat inklusive. */
  bestandIncludedMessages: 500,
  /** Kampagnen-E-Mails im Bestandskunden-Modul je Kalendermonat inklusive (eigenes Kontingent, ohne Aufpreis; Ole 14.11.2026). */
  bestandIncludedEmails: 2000,
  /**
   * Zusatzpakete Kampagnen-Nachrichten (Ole, 14.11.2026): netto, Einmalposten im laufenden Monat,
   * sofort freigeschaltet, gültig bestandPackMonths Monate. Verbrauch: erst Monatskontingent, dann ältestes Paket.
   */
  bestandPacks: [
    { messages: 500, price: 99 },
    { messages: 2000, price: 349 },
  ],
  bestandPackMonths: 3,
  /** Ab so vielen zusätzlichen Nachrichten im Monat individuell (Anfrage, Aufgabe für uns). */
  bestandPackIndividualFrom: 5000,
  /** Modul „Empfehlungen & Bewertungen“ je Monat (netto), Ole 12.11.2026. */
  empfehlungModuleMonthly: 59,
  /** Testphase bei Selbstbuchung: so viele Tage kostenlos, danach automatisch kostenpflichtig. */
  empfehlungTrialDays: 30,
  /** WhatsApp-Gebühren von Meta sind im Preis enthalten (keine Weiterberechnung). */
  whatsappIncluded: true,
} as const;

export type PreisStufe = { maxBudget: number; monthly: number; label: string };

/**
 * Listenpreise Betreuung + Software bis 18.11.2026 (1.000/1.400/1.800 €). Gelten weiter für angenommene Angebote und
 * laufende Kunden (die behalten ihren Preis); offene Angebote zum alten Listenpreis wurden per Migration
 * 20261118999500_listenpreise_990 auf den neuen Listenpreis gesetzt.
 */
export const LISTENPREISE_ALT: readonly PreisStufe[] = [
  { maxBudget: 3000, monthly: 1000, label: "bis 3.000 €" },
  { maxBudget: 6000, monthly: 1400, label: "3.000–6.000 €" },
  { maxBudget: 10000, monthly: 1800, label: "6.000–10.000 €" },
];

/** Listenpreis Betreuung + Software für Budget und Produktanzahl nach einer Staffel (Stufe + weitere Produkte); null = individuell. */
export function listenMonatspreis(monthlyBudget: number, productCount: number, tiers: readonly PreisStufe[] = PRICE_LIST.tiers): number | null {
  const t = tiers.find((x) => monthlyBudget <= x.maxBudget);
  return t ? t.monthly + Math.max(0, productCount - 1) * PRICE_LIST.extraProductMonthly : null;
}

export type OfferTerm = "none" | "3m" | "6m" | "12m";

/** Mindestlaufzeit in Monaten je Laufzeit-Option (0 = monatlich kündbar). */
export const TERM_MONTHS: Record<OfferTerm, number> = { none: 0, "3m": 3, "6m": 6, "12m": 12 };

/** Unbekannte/alte Werte → „none“. */
export const normalizeTerm = (t: unknown): OfferTerm => (t === "12m" || t === "6m" || t === "3m" ? t : "none");

/** Listen-Setup je Laufzeit (ohne weitere Produkte). */
export const setupForTerm = (t: OfferTerm): number =>
  t === "12m" ? PRICE_LIST.setup12m : t === "6m" ? PRICE_LIST.setup6m : t === "3m" ? PRICE_LIST.setup3m : PRICE_LIST.setupNoTerm;

// ─── Vorauszahlung (Ole, 18.11.2026): eine Logik für 6 und 12 Monate ─────────
// Mit 6 Monaten Laufzeit: 6 Monate im Voraus, 1 Monat geschenkt (5 Monatsbeträge). Mit 12 Monaten: jährlich im
// Voraus, 2 Monate geschenkt (10 Monatsbeträge). Gespeichert wird beides wie bisher in Offer.annualPrepay/annualFreeMonths
// (Name historisch); der Zeitraum folgt aus der Laufzeit. Am Kunden: billingInterval "halfyear" bzw. "year".

export type PrepayTerm = "6m" | "12m";
export const VORAUSZAHLUNG: Record<PrepayTerm, { months: number; freeMonths: number }> = {
  "6m": { months: 6, freeMonths: PRICE_LIST.halfYearFreeMonths },
  "12m": { months: 12, freeMonths: PRICE_LIST.annualFreeMonths },
};
/** Vorauszahlung gibt es nur mit 6 oder 12 Monaten Laufzeit. */
export const prepayPossible = (t: unknown): t is PrepayTerm => t === "6m" || t === "12m";
/** Monate je Vorauszahlungszeitraum (Altdaten ohne 6 Monate: 12). */
export const prepayMonthsFor = (t: unknown): number => (t === "6m" ? 6 : 12);
/** Geschenkte Monate je Zeitraum nach Laufzeit (Altdaten: 2). */
export const prepayFreeMonthsFor = (t: unknown): number => (t === "6m" ? VORAUSZAHLUNG["6m"].freeMonths : VORAUSZAHLUNG["12m"].freeMonths);

/**
 * Beträge einer Vorauszahlung: Betrag = (Monate − Freimonate) × Monatspreis inkl. Zusätze, Ersparnis = Freimonate ×
 * Monatspreis. `freeMonths` = gespeicherter Wert des Angebots (null = Standard der Laufzeit).
 */
export function vorauszahlungBetraege(
  monthlyTotal: number,
  term: unknown,
  freeMonths: number | null = null,
): { total: number; savings: number; freeMonths: number; months: number; paidMonths: number } {
  const months = prepayMonthsFor(term);
  const free = freeMonths ?? prepayFreeMonthsFor(term);
  const total = round2(monthlyTotal * (months - free));
  return { total, savings: round2(monthlyTotal * months - total), freeMonths: free, months, paidMonths: months - free };
}

/** Zahlrhythmus am Kunden (Customer.billingInterval). */
export type Zahlrhythmus = "month" | "halfyear" | "year";
export const normalizeRhythmus = (v: unknown): Zahlrhythmus => (v === "year" || v === "halfyear" ? v : "month");
/** Im Voraus bezahlt (6 oder 12 Monate): keine Gutschrift für Pausen, Nachlässe von Hand usw. */
export const isPrepaid = (interval: unknown): boolean => interval === "year" || interval === "halfyear";
export const RHYTHMUS_MONATE: Record<Zahlrhythmus, number> = { month: 1, halfyear: 6, year: 12 };
export const RHYTHMUS_LABEL: Record<Zahlrhythmus, string> = { month: "Monatlich", halfyear: "6 Monate im Voraus", year: "Jährlich im Voraus" };
/** Rhythmus aus Laufzeit und Vorauszahlung (6 Monate → halbjährlich, sonst jährlich). */
export const rhythmusFuer = (term: unknown, prepay: boolean): Zahlrhythmus => (!prepay ? "month" : term === "6m" ? "halfyear" : "year");
/** Monatsbeträge je Abbuchung: monatlich 1, halbjährlich 6 − Freimonate, jährlich 12 − Freimonate. */
export function rhythmusFaktor(r: unknown, freeMonths?: number | null): number {
  const n = normalizeRhythmus(r);
  if (n === "month") return 1;
  const term = n === "halfyear" ? "6m" : "12m";
  return prepayMonthsFor(term) - (freeMonths ?? prepayFreeMonthsFor(term));
}
/** Anteil je Monat (z. B. MRR): jährlich 10/12, halbjährlich 5/6, monatlich 1. */
export const rhythmusMonatsAnteil = (r: unknown, freeMonths?: number | null): number => rhythmusFaktor(r, freeMonths) / RHYTHMUS_MONATE[normalizeRhythmus(r)];
/** Stripe-Intervall je Rhythmus: halbjährlich = Monat × 6. */
export function stripeRecurring(r: unknown): { interval: "month" | "year"; interval_count?: number } {
  const n = normalizeRhythmus(r);
  return n === "year" ? { interval: "year" } : n === "halfyear" ? { interval: "month", interval_count: 6 } : { interval: "month" };
}
/** Rhythmus eines Stripe-Preises (recurring). */
export function rhythmusAusStripe(rec: { interval?: string | null; interval_count?: number | null } | null | undefined): Zahlrhythmus {
  if (rec?.interval === "year") return "year";
  if (rec?.interval === "month" && rec.interval_count === 6) return "halfyear";
  return "month";
}
/** Vertreter oder Makler: bestimmt die Garantien (Break-even bzw. Vertrags-Garantie). */
/** Mehrfachvertreter rechnet wie Vertreter (Preise, Break-even-Garantie), Status geht in die Erstinformation. */
export type OfferVermittler = "vertreter" | "mehrfachvertreter" | "makler";
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
  /** Aktive Verkäufer gesamt (bekommen Leads); Standard = inklusive Anzahl. */
  seats?: number | null;
  /** Vorauszahlung (nur mit 6 oder 12 Monaten Laufzeit; Name historisch). */
  annual?: boolean;
  /** Bestandskunden-Modul dazubuchen (nur Betreuung + Software). */
  bestandModule?: boolean;
  /** Modul „Empfehlungen & Bewertungen“ dazubuchen (nur Betreuung + Software). */
  empfehlungModule?: boolean;
  /**
   * Empfehlungsrabatt auf die Einrichtung (netto). Gilt für jede Laufzeit, nie unter 0.
   * Nicht mit „Setup abweichend“ addieren: es gilt der günstigere Betrag.
   */
  setupDiscount?: number | null;
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
  /** Tatsächlich abgezogener Empfehlungsrabatt (0 = keiner bzw. Sonderkondition günstiger). */
  setupDiscount: number;
  monthlyFee: number | null;
  softwareFee: number;
  /** Aktive Verkäufer gesamt, davon inklusive, weitere (berechnet). */
  seats: number;
  seatsIncluded: number;
  extraSeats: number;
  /** Monatlich für weitere aktive Verkäufer (0 = keine / im individuellen Preis enthalten). */
  seatsFee: number;
  /** Ab {@link PRICE_LIST.seatIndividualFrom} aktiven Verkäufern individuell. */
  seatsIndividual: boolean;
  bestandFee: number;
  /** Modul Teil des Angebots. */
  bestandActive: boolean;
  empfehlungFee: number;
  empfehlungActive: boolean;
  /** Monatlich gesamt (Paket + weitere Verkäufer + Module); null = individuell offen. */
  monthlyTotal: number | null;
  annual: boolean;
  /** Betrag je Vorauszahlungszeitraum (6 bzw. 12 Monate); null ohne Vorauszahlung. */
  annualTotal: number | null;
  /** Ersparnis durch die Freimonate. */
  annualSavings: number;
  /** Monate je Vorauszahlungszeitraum (6 oder 12) und geschenkte Monate; 0 ohne Vorauszahlung. */
  prepayMonths: number;
  prepayFreeMonths: number;
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
  const baseSetup = setupForTerm(normalizeTerm(input.term));
  const listSetup = baseSetup + extraProducts * PRICE_LIST.extraProductSetup;

  const serviceOnly = input.package === "service";
  const tier = serviceOnly ? null : PRICE_LIST.tiers.find((t) => monthlyBudget <= t.maxBudget);
  const individual = !serviceOnly && !tier;
  const base = serviceOnly ? PRICE_LIST.serviceOnlyMonthly : (tier?.monthly ?? null);
  const listMonthly = base == null ? null : base + extraProducts * PRICE_LIST.extraProductMonthly;

  // Aktive Verkäufer: nur im Paket mit Software; ab seatIndividualFrom individuell (Preis per Sonderkondition).
  const seatsIncluded = serviceOnly ? 0 : PRICE_LIST.seatsIncluded;
  const seats = serviceOnly ? 0 : Math.max(1, Math.round(Number(input.seats ?? seatsIncluded) || seatsIncluded));
  const seatsIndividual = !serviceOnly && seats >= PRICE_LIST.seatIndividualFrom;
  const extraSeats = serviceOnly ? 0 : Math.max(0, seats - seatsIncluded);
  const seatsFee = seatsIndividual ? 0 : extraSeats * PRICE_LIST.seatMonthly;
  const bestandActive = !serviceOnly && !!input.bestandModule;
  const bestandFee = bestandActive ? PRICE_LIST.bestandModuleMonthly : 0;
  const empfehlungActive = !serviceOnly && !!input.empfehlungModule;
  const empfehlungFee = empfehlungActive ? PRICE_LIST.empfehlungModuleMonthly : 0;
  const listBase = seatsIndividual ? null : listMonthly;

  const setup = applySetupDiscount(listSetup, input.setupOverride, input.setupDiscount);
  const setupFee = setup.fee;
  const monthlyFee =
    input.monthlyOverride != null && input.monthlyOverride >= 0 ? input.monthlyOverride : listBase;
  const monthlyTotal = monthlyFee == null ? null : round2(monthlyFee + seatsFee + bestandFee + empfehlungFee);
  // Vorauszahlung: 6 Monate (1 geschenkt) bzw. 12 Monate (2 geschenkt), gleiche Rechnung
  const annual = !!input.annual && prepayPossible(input.term);
  const prepay = annual && monthlyTotal != null ? vorauszahlungBetraege(monthlyTotal, input.term) : null;

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
    setupDiscount: setup.discount,
    monthlyFee: monthlyFee == null ? null : round2(monthlyFee),
    softwareFee: serviceOnly ? 0 : PRICE_LIST.softwareFee,
    seats,
    seatsIncluded,
    extraSeats,
    seatsFee: round2(seatsFee),
    seatsIndividual,
    bestandFee,
    bestandActive,
    empfehlungFee,
    empfehlungActive,
    monthlyTotal,
    annual,
    annualTotal: prepay?.total ?? null,
    annualSavings: prepay?.savings ?? 0,
    prepayMonths: annual ? prepayMonthsFor(input.term) : 0,
    prepayFreeMonths: annual ? prepayFreeMonthsFor(input.term) : 0,
  };
}

/**
 * Einrichtung nach Sonderkondition und Empfehlungsrabatt: Rabatt = Listenpreis minus Betrag,
 * nie unter 0. Ist „Setup abweichend“ günstiger, gilt dieser (kein Rabatt obendrauf).
 */
export function applySetupDiscount(
  listSetup: number,
  override: number | null | undefined,
  discount: number | null | undefined,
): { fee: number; discount: number } {
  const manual = override != null && Number.isFinite(override) && override >= 0 ? round2(override) : null;
  const want = discount != null && Number.isFinite(discount) && discount > 0 ? round2(discount) : 0;
  if (want <= 0) return { fee: manual ?? listSetup, discount: 0 };
  const discounted = round2(Math.max(0, listSetup - want));
  if (manual != null && manual <= discounted) return { fee: manual, discount: 0 };
  return { fee: discounted, discount: round2(listSetup - discounted) };
}

/** Rabattzeile eines gespeicherten Angebots (Listenpreis und abgezogener Betrag) oder null. */
export function offerSetupDiscount(o: { setupFee: unknown; setupListFee?: unknown; setupDiscount?: unknown }): { list: number; discount: number } | null {
  if (o.setupListFee == null || o.setupDiscount == null) return null;
  const list = Number(o.setupListFee);
  const discount = round2(list - Number(o.setupFee));
  return discount > 0.005 ? { list, discount } : null;
}

/** Gespeicherte Zusätze eines Angebots (Snapshot) → Beträge für Anzeige und Abrechnung. */
export type OfferAddOnsInput = {
  monthlyFee: number;
  seats: number | null;
  seatsIncluded: number | null;
  seatMonthly: number | null;
  bestandMonthly: number | null;
  /** Fehlt bei Alt-Angeboten (vor 12.11.2026) = nicht gebucht. */
  empfehlungMonthly?: number | null;
  annualPrepay: boolean;
  annualFreeMonths: number | null;
  /** Laufzeit des Angebots: bestimmt den Vorauszahlungszeitraum (6m → 6 Monate, sonst 12). */
  term?: string | null;
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
  /** Modul vereinbart (bestandMonthly gesetzt; 0 € = Sonderkondition ohne Aufpreis). */
  bestandActive: boolean;
  empfehlungFee: number;
  empfehlungActive: boolean;
  monthlyTotal: number;
  annual: boolean;
  freeMonths: number;
  /** Betrag je Vorauszahlungszeitraum; null ohne Vorauszahlung. */
  annualTotal: number | null;
  annualSavings: number;
  /** Monate je Vorauszahlungszeitraum (6 oder 12; ohne Vorauszahlung der Zeitraum der Laufzeit). */
  prepayMonths: number;
};

export function offerAddOns(o: OfferAddOnsInput): OfferAddOns {
  const hasSeats = o.seats != null && o.seatsIncluded != null;
  const seatsIncluded = o.seatsIncluded ?? 0;
  const seats = o.seats ?? 0;
  const seatMonthly = o.seatMonthly ?? 0;
  const extraSeats = hasSeats ? Math.max(0, seats - seatsIncluded) : 0;
  const seatsFee = round2(extraSeats * seatMonthly);
  const bestandFee = o.bestandMonthly ?? 0;
  const empfehlungFee = o.empfehlungMonthly ?? 0;
  const monthlyTotal = round2(o.monthlyFee + seatsFee + bestandFee + empfehlungFee);
  const prepay = o.annualPrepay ? vorauszahlungBetraege(monthlyTotal, o.term, o.annualFreeMonths) : null;
  const freeMonths = prepay?.freeMonths ?? 0;
  const annualTotal = prepay?.total ?? null;
  return {
    hasSeats,
    seats,
    seatsIncluded,
    extraSeats,
    seatMonthly,
    seatsFee,
    bestandFee,
    bestandActive: o.bestandMonthly != null,
    empfehlungFee,
    empfehlungActive: o.empfehlungMonthly != null,
    monthlyTotal,
    annual: o.annualPrepay,
    freeMonths,
    annualTotal,
    annualSavings: prepay?.savings ?? 0,
    prepayMonths: prepayMonthsFor(o.term),
  };
}

/** Faktor Monatspreis → Jahrespreis bei Vorauszahlung (z. B. 10). */
export const annualMultiplier = (freeMonths: number = PRICE_LIST.annualFreeMonths) => 12 - freeMonths;

/**
 * Beträge der Jahreszahlung zur Wahl (Ole, 18.11.2026): Jahresbetrag = (12 − Freimonate) × Monatspreis inkl. Zusätze,
 * Ersparnis = Freimonate × Monatspreis. Gleiche Rechnung wie {@link offerAddOns} bei vereinbarter Jahreszahlung.
 */
export function jahreswahlBetraege(monthlyTotal: number, freeMonths: number | null = PRICE_LIST.annualFreeMonths): { annualTotal: number; savings: number; freeMonths: number } {
  const v = vorauszahlungBetraege(monthlyTotal, "12m", freeMonths);
  return { annualTotal: v.total, savings: v.savings, freeMonths: v.freeMonths };
}

export const withVat = (net: number) => round2(net * (1 + PRICE_LIST.vatRate));
export const vatOf = (net: number) => round2(net * PRICE_LIST.vatRate);

/** Nachkommastellen für Beträge im Angebot: ganze Euro ohne „,00“, sonst mit Cent (Ole, 18.11.2026). */
export const centStellen = (n: number): 0 | 2 => (Math.round(Math.abs(n) * 100) % 100 === 0 ? 0 : 2);

/** Betrag für Angebot, PDF, Annahme und Präsentation: „990 €“, „1.234,50 €“. */
export const eur = (n: number) => {
  const d = centStellen(n);
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
};

/** Wie {@link eur}, mit normalem Leerzeichen vor „€“ (Folien und Fließtext in HTML). */
export const eurText = (n: number) => {
  const d = centStellen(n);
  return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)} €`;
};

export const TERM_LABEL: Record<OfferTerm, string> = {
  none: "Ohne Vertragslaufzeit (monatlich kündbar)",
  "3m": "3 Monate Laufzeit",
  "6m": "6 Monate Laufzeit",
  "12m": "12 Monate Laufzeit",
};

/** Kurzformen: „12 Monate“, „ohne Laufzeit“ usw. */
export const TERM_SHORT: Record<OfferTerm, string> = { "12m": "12 Monate", "6m": "6 Monate", "3m": "3 Monate", none: "ohne Laufzeit" };

export const PACKAGE_LABEL: Record<OfferPackage, string> = {
  software: "Betreuung + Software",
  service: "Nur Betreuung",
};

/** Startdatum-Vorschlag: der 1. des Folgemonats (YYYY-MM-DD). */
export function defaultStartDate(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return d.toISOString().slice(0, 10);
}

// ─── Wahl des Kunden auf der Angebotsseite (Laufzeit, Startdatum) ───
// Reine Funktionen: Live-Anzeige auf der Angebotsseite und verbindliche Prüfung
// bei der Annahme (dort zählt nur die serverseitige Berechnung).

/** Frühester Start: so viele Tage ab heute (die Einrichtung braucht Zeit). */
export const START_MIN_DAYS = 7;
/** Spätester Start: so viele Tage ab heute. */
export const START_MAX_DAYS = 90;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Heutiges Datum in Berlin als YYYY-MM-DD. */
export function berlinTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** YYYY-MM-DD + Tage (kalendarisch, ohne Zeitzonen-Effekte). */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Gültiges Kalenderdatum im Format YYYY-MM-DD? */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !ISO_DATE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Erlaubter Bereich für das Startdatum: heute + {@link START_MIN_DAYS} bis heute + {@link START_MAX_DAYS}.
 * Hat der Admin bewusst einen früheren Start (ab heute) vorgegeben, bleibt dieser wählbar.
 * `preset` = Vorschlag (Vorgabe aus dem Angebot, in den Bereich geschoben).
 */
export function startDateBounds(todayIso: string, presetIso: string | null): { min: string; max: string; preset: string } {
  let min = addDaysIso(todayIso, START_MIN_DAYS);
  const max = addDaysIso(todayIso, START_MAX_DAYS);
  const valid = presetIso != null && isIsoDate(presetIso);
  if (valid && presetIso >= todayIso && presetIso < min) min = presetIso;
  const wanted = valid ? presetIso : defaultStartDate(new Date(`${todayIso}T12:00:00Z`));
  const preset = wanted < min ? min : wanted > max ? max : wanted;
  return { min, max, preset };
}

/** Listen-Setup je Laufzeit inkl. weiterer Produkte, optional nach Empfehlungsrabatt (nie unter 0). */
export function setupForChoice(term: OfferTerm, productCount: number, discount: number | null = null): number {
  const list = setupForTerm(term) + Math.max(0, productCount - 1) * PRICE_LIST.extraProductSetup;
  return applySetupDiscount(list, null, discount).fee;
}

export const TERM_OPTIONS: readonly OfferTerm[] = ["12m", "6m", "3m", "none"];

/**
 * 6 Monate gibt es zur Wahl erst für Angebote ab diesem Zeitpunkt (Einführung 18.11.2026, 14 Uhr Berlin; Livegang am Abend).
 * Ältere offene Angebote mit Laufzeitwahl bleiben wie verschickt (12 Monate, 3 Monate, ohne Laufzeit).
 */
export const TERM_6M_AB = new Date("2026-11-18T13:00:00Z");
/**
 * 6 Monate bietet Ole nur an, wenn jemand ausdrücklich danach fragt (Ole, 18.11.2026): Zur Wahl steht sie nur, wenn
 * das Angebot selbst auf 6 Monate steht, sonst nie (auch nicht in Präsentation und Rechner).
 */
export const termOptionsFor = (createdAt: Date | null | undefined, term?: OfferTerm | string | null): readonly OfferTerm[] =>
  term === "6m" && (!createdAt || createdAt.getTime() >= TERM_6M_AB.getTime()) ? TERM_OPTIONS : TERM_OPTIONS.filter((t) => t !== "6m");

/** Gespeicherter Stand eines Angebots, soweit für die Kundenwahl nötig. */
export type OfferChoiceSnapshot = {
  term: string;
  productCount: number;
  setupFee: number;
  /** Vorgabe des Admins (YYYY-MM-DD) oder null. */
  startIso: string | null;
  annualPrepay: boolean;
  annualFreeMonths: number | null;
  /** Vorauszahlung angeboten: Kunde wählt monatlich oder im Voraus (nur mit 6 oder 12 Monaten); annualPrepay = Vorauswahl. */
  annualChoice?: boolean;
  choosesTerm: boolean;
  /** Wählbare Laufzeiten (Standard alle; Altangebote ohne 6 Monate, {@link termOptionsFor}). */
  termOptions?: readonly OfferTerm[];
  choosesStart: boolean;
  /** Vereinbarter Empfehlungsrabatt (netto) und Listenpreis vor Rabatt; fehlt = keiner. */
  setupDiscount?: number | null;
  setupListFee?: number | null;
};

export type OfferChoiceResult =
  | {
      ok: true;
      term: OfferTerm;
      setupFee: number;
      /** Listenpreis vor Empfehlungsrabatt (null = kein Rabatt vereinbart). */
      setupListFee: number | null;
      startIso: string | null;
      annualPrepay: boolean;
      annualFreeMonths: number | null;
    }
  | { ok: false; error: string };

/**
 * Prüft die Wahl des Kunden und berechnet die verbindlichen Werte neu.
 * Nicht freigegebene Felder müssen der Vorgabe entsprechen (oder fehlen).
 */
export function resolveOfferChoice(
  snap: OfferChoiceSnapshot,
  input: { term?: string | null; startDate?: string | null; annual?: boolean | null },
  todayIso: string,
): OfferChoiceResult {
  const fixedTerm = normalizeTerm(snap.term);
  let term: OfferTerm = fixedTerm;
  let setupFee = snap.setupFee;
  const hasDiscount = snap.setupDiscount != null && snap.setupDiscount > 0;
  let setupListFee = hasDiscount ? (snap.setupListFee ?? null) : null;
  const wantedTerm = input.term?.trim() || null;
  if (snap.choosesTerm) {
    if (wantedTerm != null) {
      if (!((snap.termOptions ?? TERM_OPTIONS) as readonly string[]).includes(wantedTerm)) return { ok: false, error: "Bitte eine gültige Laufzeit wählen." };
      term = wantedTerm as OfferTerm;
    }
    // Empfehlungsrabatt gilt für jede Laufzeit
    setupFee = setupForChoice(term, snap.productCount, hasDiscount ? snap.setupDiscount : null);
    if (hasDiscount) setupListFee = setupForChoice(term, snap.productCount);
  } else if (wantedTerm != null && wantedTerm !== fixedTerm) {
    return { ok: false, error: "Die Laufzeit ist in diesem Angebot fest vereinbart." };
  }

  let startIso = snap.startIso;
  const wantedStart = input.startDate?.trim() || null;
  if (snap.choosesStart) {
    const b = startDateBounds(todayIso, snap.startIso);
    if (wantedStart == null) {
      startIso = b.preset;
    } else {
      if (!isIsoDate(wantedStart)) return { ok: false, error: "Bitte ein gültiges Startdatum wählen." };
      if (wantedStart < b.min || wantedStart > b.max) {
        return { ok: false, error: "Das Startdatum liegt außerhalb des möglichen Zeitraums. Bitte ein Datum aus dem Kalender wählen." };
      }
      startIso = wantedStart;
    }
  } else if (wantedStart != null && wantedStart !== snap.startIso) {
    return { ok: false, error: "Das Startdatum ist in diesem Angebot fest vereinbart." };
  }

  // Zahlweise: mit „Vorauszahlung anbieten“ wählt der Kunde (ohne Angabe gilt die Vorauswahl), sonst wie vereinbart.
  // Vorauszahlung gibt es mit 6 Monaten (6 Monate im Voraus) und 12 Monaten (jährlich). Alte Angebote mit fest
  // vereinbarter Jahreszahlung bleiben dabei: nur mit 12 Monaten.
  let annualPrepay = snap.annualPrepay && term === "12m";
  if (snap.annualChoice) {
    annualPrepay = prepayPossible(term) && (input.annual ?? snap.annualPrepay) === true;
  } else if (input.annual != null && input.annual !== annualPrepay) {
    return { ok: false, error: "Die Zahlweise ist in diesem Angebot fest vereinbart." };
  }
  return {
    ok: true,
    term,
    setupFee: Math.round(setupFee * 100) / 100,
    setupListFee,
    startIso,
    annualPrepay,
    // Geschenkte Monate je Laufzeit: gespeicherter Wert gilt für die Laufzeit des Angebots, sonst Standard der Wahl
    annualFreeMonths: annualPrepay ? (term === fixedTerm && snap.annualFreeMonths != null ? snap.annualFreeMonths : prepayFreeMonthsFor(term)) : null,
  };
}

// ─── Preisumstellung 18.11.2026: 1.000/1.400/1.800 € → 990/1.390/1.790 € ─────────────────────────────────────
// Offene Angebote (Entwurf/verschickt, nicht angenommen) zum alten Listenpreis bekommen den neuen Listenpreis
// (Migration 20261118999500_listenpreise_990, gleiche Regel in SQL). Sonderkonditionen (Monatspreis abweichend von
// der alten Staffel), angenommene Angebote, Testangebote, „Nur Betreuung“ und individuelle Preise bleiben, wie sie sind.

export type ListenpreisUmstellungInput = {
  status: string;
  acceptedAt: Date | null;
  isTest: boolean;
  package: string;
  products: unknown;
  monthlyFee: unknown;
  seats: number | null;
};

/** Alter und neuer Monatspreis, wenn das Angebot offen ist und noch den alten Listenpreis hat; sonst null. */
export function listenpreisUmstellung(o: ListenpreisUmstellungInput): { alt: number; neu: number } | null {
  if (!(o.status === "draft" || o.status === "sent") || o.acceptedAt || o.isTest || o.package === "service") return null;
  if (o.seats != null && o.seats >= PRICE_LIST.seatIndividualFrom) return null;
  const products = (Array.isArray(o.products) ? o.products : []).flatMap((p) => {
    const r = (p ?? {}) as { name?: unknown; dailyBudget?: unknown };
    return typeof r.name === "string" && r.name.trim() ? [{ name: r.name, dailyBudget: typeof r.dailyBudget === "number" ? r.dailyBudget : 0 }] : [];
  });
  if (!products.length) return null;
  const budget = monthlyBudgetOf(products);
  const alt = listenMonatspreis(budget, products.length, LISTENPREISE_ALT);
  const neu = listenMonatspreis(budget, products.length);
  if (alt == null || neu == null || alt === neu || Math.abs(Number(o.monthlyFee) - alt) > 0.005) return null;
  return { alt, neu };
}

/** Zusatzpakete Bestandskunden-Modul als Satz: „+500 Nachrichten für 99 €, +2.000 für 349 € (netto, einmalig, gültig 3 Monate)“. */
export function bestandPacksText(): string {
  const parts = PRICE_LIST.bestandPacks.map((p, i) => `+${p.messages.toLocaleString("de-DE")}${i === 0 ? " Nachrichten" : ""} für ${eur(p.price)}`);
  return `${parts.join(", ")} (netto, einmalig, gültig ${PRICE_LIST.bestandPackMonths} Monate)`;
}

/**
 * Vollständige Preisstaffel als Satz für das Angebot (Rechtsprüfung 16.11.2026): Die AGB verweisen auf die
 * „Preisstaffel laut Angebot“. Damit die Stufe bei dauerhaft höherem Budget vorher erkennbar ist (§ 307 Abs. 1
 * Satz 2, § 305c Abs. 1 BGB), steht die ganze Staffel im Angebot, nicht nur die aktuelle Stufe. Ohne Gedankenstriche.
 */
const stufenBereich = (from: number, maxBudget: number) => {
  const de = (n: number) => n.toLocaleString("de-DE");
  return from === 0 ? `bis ${de(maxBudget)} €` : `über ${de(from)} bis ${de(maxBudget)} €`;
};

/** Preisstufe zum Werbebudget im Wortlaut der Staffel: „bis 3.000 €“, „über 3.000 bis 6.000 €“; null = individuell. */
export function preisstufeBereich(monthlyBudget: number, tiers: readonly PreisStufe[] = PRICE_LIST.tiers): string | null {
  const i = tiers.findIndex((t) => monthlyBudget <= t.maxBudget);
  return i < 0 ? null : stufenBereich(i === 0 ? 0 : tiers[i - 1].maxBudget, tiers[i].maxBudget);
}

/**
 * Staffel, nach der ein vereinbarter Monatspreis der Listenpreis ist: aktuelle Staffel, alte Staffel (bis 18.11.2026,
 * angenommene Altangebote) oder null (Sonderkondition bzw. individuell).
 */
export function staffelDesPreises(monthlyBudget: number, productCount: number, monthlyFee: number): readonly PreisStufe[] | null {
  for (const tiers of [PRICE_LIST.tiers, LISTENPREISE_ALT]) {
    const list = listenMonatspreis(monthlyBudget, productCount, tiers);
    if (list != null && Math.abs(list - monthlyFee) < 0.01) return tiers;
  }
  return null;
}

/**
 * Satz unter dem Werbebudget (Angebotsseite, PDF, Präsentation): welche Preisstufe für Betreuung und Software gilt,
 * bzw. der vereinbarte Preis bei Sonderkondition. null für „Nur Betreuung“ (Preis hängt nicht vom Budget ab).
 */
export function betreuungsSatz(o: { package?: string | null; monthlyBudget: number; productCount: number; monthlyFee: number }): string | null {
  if (o.package === "service") return null;
  const tiers = staffelDesPreises(o.monthlyBudget, o.productCount, o.monthlyFee);
  const bereich = tiers ? preisstufeBereich(o.monthlyBudget, tiers) : null;
  if (!bereich) return `Für Betreuung und Software gilt Ihr vereinbarter Preis: ${eur(o.monthlyFee)} netto im Monat.`;
  const extra = Math.max(0, o.productCount - 1);
  const weitere = extra ? `, inklusive ${extra} × ${eur(PRICE_LIST.extraProductMonthly)} für ${extra === 1 ? "ein weiteres Produkt" : "weitere Produkte"}` : "";
  return `Damit gilt für Betreuung und Software die Preisstufe ${bereich} Werbebudget im Monat: ${eur(o.monthlyFee)} netto im Monat${weitere}.`;
}

export function tierStaffelText(tiers: readonly PreisStufe[] = PRICE_LIST.tiers): string {
  const de = (n: number) => n.toLocaleString("de-DE");
  let from = 0;
  const parts = tiers.map((t) => {
    const range = stufenBereich(from, t.maxBudget);
    from = t.maxBudget;
    return `${range}: ${eur(t.monthly)}`;
  });
  return `Preisstaffel nach Werbebudget im Monat (netto): ${parts.join("; ")}; über ${de(PRICE_LIST.individualFrom)} € individuelles Angebot. Ändern Sie Ihr Budget dauerhaft, gilt die passende Stufe ab dem folgenden Abrechnungsmonat; Sie sehen sie vorher im Kundenbereich.`;
}

// ─── Abschlussbonus (Ole, 16.11.2026) ───────────────────────────────────────
// Nachlass auf die Einrichtung, wenn der Vermittler am selben Tag annimmt UND die Einrichtung bezahlt (bzw. die
// Lastschrift erteilt). Start bleibt frei wählbar. Die Frist ist echt: danach gilt automatisch der normale Preis.

/** Standardbetrag für neue Angebote (netto). */
export const ABSCHLUSSBONUS_STANDARD = 300;

/** 23:59:59 Uhr (Berlin) des Tages von `d`. */
export function berlinTagesende(d: Date): Date {
  const iso = berlinTodayIso(d);
  // Mitternacht des Folgetags in Berlin minus 1 Sekunde; Offset per Rückrechnung ermitteln (Sommer-/Winterzeit)
  const next = addDaysIso(iso, 1);
  const guess = new Date(`${next}T00:00:00Z`);
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(guess));
  return new Date(guess.getTime() - h * 3600_000 - 1000);
}

/** 23:59:59 Uhr (Berlin) eines Kalendertags YYYY-MM-DD. */
export function berlinTagesendeIso(iso: string): Date {
  return berlinTagesende(new Date(`${iso}T12:00:00Z`));
}

/** Vorschlag für die Frist: morgen 23:59 Uhr (Berlin), wie auf der Präsentationsfolie (Ole, 16.11.2026). */
export function abschlussBonusStandardTag(now: Date = new Date()): string {
  return addDaysIso(berlinTodayIso(now), 1);
}

export type AbschlussBonusQuelle = {
  abschlussBonus?: unknown;
  abschlussBonusBis?: Date | null;
  sentAt?: Date | null;
  createdAt: Date;
  setupFee: unknown;
  /** „Später zahlen“ erlaubt: dann reicht die Annahme bis zur Frist, gezahlt werden darf danach (Ole, 16.11.2026). */
  allowPayLater?: boolean | null;
  acceptedAt?: Date | null;
};

/** Frist des Bonus: gesetzte Frist, sonst Versandtag (bzw. Erstellungstag) 23:59 Uhr Berlin; null ohne Bonus. */
export function abschlussBonusFrist(o: AbschlussBonusQuelle): Date | null {
  if (o.abschlussBonus == null || !(Number(o.abschlussBonus) > 0)) return null;
  return o.abschlussBonusBis ?? berlinTagesende(o.sentAt ?? o.createdAt);
}

/** Bei „später zahlen“: Annahme bis zur Frist sichert den Bonus, auch wenn die Zahlung danach kommt. */
export function abschlussBonusGesichert(o: AbschlussBonusQuelle): boolean {
  const bis = abschlussBonusFrist(o);
  return !!(bis && o.allowPayLater && o.acceptedAt && o.acceptedAt.getTime() <= bis.getTime());
}

/**
 * Bonus, der jetzt noch gilt (höchstens die Einrichtung selbst); null, wenn keiner oder abgelaufen.
 * Ohne „später zahlen“ zählt die Zahlung bis zur Frist, mit „später zahlen“ die Annahme (gesichert = true).
 */
export function abschlussBonusJetzt(o: AbschlussBonusQuelle, now: Date = new Date()): { betrag: number; bis: Date; gesichert: boolean } | null {
  const bis = abschlussBonusFrist(o);
  if (!bis) return null;
  const gesichert = abschlussBonusGesichert(o);
  if (!gesichert && now.getTime() > bis.getTime()) return null;
  const betrag = Math.min(round2(Number(o.abschlussBonus)), round2(Number(o.setupFee)));
  return betrag > 0.005 ? { betrag, bis, gesichert } : null;
}
