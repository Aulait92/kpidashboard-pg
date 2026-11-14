// Preisliste für Angebote (Leadgenerierung + Software). Reine Funktionen,
// nutzbar im Formular (Live-Vorschau), auf der Angebotsseite und im PDF.
// Alle Beträge netto in EUR; USt. wird nur angezeigt.

export const PRICE_LIST = {
  setupNoTerm: 2490,
  /** Mindestlaufzeit 3 Monate (Ole, 11.11.2026). */
  setup3m: 1990,
  setup12m: 990,
  extraProductSetup: 990,
  extraProductMonthly: 350,
  /** Einrichtung, wenn ein Bestandskunde ein weiteres Produkt selbst bucht (Ole, 12.11.: entfällt). */
  extraProductSetupSelfService: 0,
  softwareFee: 349,
  /** Paket „Nur Betreuung“ (ohne Software): fester Monatspreis, Pause 0 €. */
  serviceOnlyMonthly: 700,
  vatRate: 0.19,
  /** Monatliche Betreuung + Software nach Gesamt-Werbebudget pro Monat. */
  tiers: [
    { maxBudget: 3000, monthly: 1000, label: "bis 3.000 €" },
    { maxBudget: 6000, monthly: 1400, label: "3.000–6.000 €" },
    { maxBudget: 10000, monthly: 1800, label: "6.000–10.000 €" },
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

export type OfferTerm = "none" | "3m" | "12m";

/** Mindestlaufzeit in Monaten je Laufzeit-Option (0 = monatlich kündbar). */
export const TERM_MONTHS: Record<OfferTerm, number> = { none: 0, "3m": 3, "12m": 12 };

/** Unbekannte/alte Werte → „none“. */
export const normalizeTerm = (t: unknown): OfferTerm => (t === "12m" || t === "3m" ? t : "none");

/** Listen-Setup je Laufzeit (ohne weitere Produkte). */
export const setupForTerm = (t: OfferTerm): number =>
  t === "12m" ? PRICE_LIST.setup12m : t === "3m" ? PRICE_LIST.setup3m : PRICE_LIST.setupNoTerm;
/** Vertreter oder Makler: bestimmt die Garantien (Break-even bzw. Vertrags-Garantie). */
export type OfferVermittler = "vertreter" | "makler";
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
  /** Jährlich im Voraus zahlen (nur mit 12 Monaten Laufzeit). */
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
    annualTotal,
    annualSavings: annualTotal != null && monthlyTotal != null ? round2(monthlyTotal * 12 - annualTotal) : 0,
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
  const empfehlungFee = o.empfehlungMonthly ?? 0;
  const monthlyTotal = round2(o.monthlyFee + seatsFee + bestandFee + empfehlungFee);
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
    bestandActive: o.bestandMonthly != null,
    empfehlungFee,
    empfehlungActive: o.empfehlungMonthly != null,
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
  "3m": "3 Monate Laufzeit",
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

export const TERM_OPTIONS: readonly OfferTerm[] = ["12m", "3m", "none"];

/** Gespeicherter Stand eines Angebots, soweit für die Kundenwahl nötig. */
export type OfferChoiceSnapshot = {
  term: string;
  productCount: number;
  setupFee: number;
  /** Vorgabe des Admins (YYYY-MM-DD) oder null. */
  startIso: string | null;
  annualPrepay: boolean;
  annualFreeMonths: number | null;
  choosesTerm: boolean;
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
  input: { term?: string | null; startDate?: string | null },
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
      if (!(TERM_OPTIONS as readonly string[]).includes(wantedTerm)) return { ok: false, error: "Bitte eine gültige Laufzeit wählen." };
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

  const annualPrepay = snap.annualPrepay && term === "12m";
  return {
    ok: true,
    term,
    setupFee: Math.round(setupFee * 100) / 100,
    setupListFee,
    startIso,
    annualPrepay,
    annualFreeMonths: annualPrepay ? (snap.annualFreeMonths ?? PRICE_LIST.annualFreeMonths) : null,
  };
}

/** Zusatzpakete Bestandskunden-Modul als Satz: „+500 Nachrichten für 99 €, +2.000 für 349 € (netto, einmalig, gültig 3 Monate)“. */
export function bestandPacksText(): string {
  const parts = PRICE_LIST.bestandPacks.map((p, i) => `+${p.messages.toLocaleString("de-DE")}${i === 0 ? " Nachrichten" : ""} für ${eur(p.price)}`);
  return `${parts.join(", ")} (netto, einmalig, gültig ${PRICE_LIST.bestandPackMonths} Monate)`;
}
