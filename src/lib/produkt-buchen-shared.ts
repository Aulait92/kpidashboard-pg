// Weiteres Produkt selbst buchen (Kundenbereich → Konto → Produkte): Katalog und
// Rechenregeln für Live-Vorschau und Speichern. Nutzbar im Browser und auf dem Server.
// Preise kommen aus PRICE_LIST (Einrichtung je weiterem Produkt, Monatspreis je weiterem
// Produkt, Betreuungsstufen), die Stufenlogik aus „Budget ändern“ (budget-shared.ts).

import { PRICE_LIST } from "@/lib/offer-pricing";
import { monthlyOf, previewChange, tierSentence, type BudgetContext, type BudgetLine, type BudgetPreview } from "@/lib/budget-shared";

export type CatalogItem = {
  key: string;
  /** Produktname wie im Werbebudget (CustomerBudget.product) und im Angebot. */
  name: string;
  /** Ein Satz Nutzen für den Kunden. */
  benefit: string;
  /** „Bewährt“ (echte Ergebnisse) oder „Testprodukt“. */
  proven: boolean;
  /** Buchbar im Kundenbereich. */
  enabled: boolean;
  sort: number;
  /** Erkennt das Produkt in vorhandenen Budget-/Angebotsnamen (nur im Code). */
  match: string;
  /** Produkt in der Rechner-Konfiguration (Leadpreis, Mindestleads). */
  rechnerKey: string | null;
};

/** Standardkatalog (Ole, 12.11.2026): buchbar Katze (bewährt), Hund, Pferd, Privatschutz, Sterbegeld,
 *  Kindersparplan (Test); Unfall, Zahn- und Krankenhauszusatz nur auf Anfrage. */
export const DEFAULT_CATALOG: CatalogItem[] = [
  {
    key: "tkv-katze",
    name: "Katzenversicherung (TKV)",
    benefit: "Unser bewährtestes Produkt: viele Anfragen zu niedrigem Leadpreis, mit Lead-Garantie.",
    proven: true,
    enabled: true,
    sort: 10,
    match: "katze|\\btkv\\b|tierkranken",
    rechnerKey: "tkv",
  },
  {
    key: "tkv-hund",
    name: "Hundekrankenversicherung",
    benefit: "Hundehalter, die ihren Hund gegen hohe Tierarztkosten absichern möchten.",
    proven: false,
    enabled: true,
    sort: 20,
    match: "hund",
    rechnerKey: null,
  },
  {
    key: "tkv-pferd",
    name: "Pferdeversicherung",
    benefit: "Pferdehalter, die OP- und Krankheitskosten ihres Pferdes absichern möchten.",
    proven: false,
    enabled: true,
    sort: 25,
    match: "pferd",
    rechnerKey: null,
  },
  {
    key: "privatschutz",
    name: "Privatschutz",
    benefit: "Haftpflicht, Hausrat und Rechtsschutz in einem Gespräch – ideal für Cross-Selling.",
    proven: false,
    enabled: true,
    sort: 30,
    match: "privatschutz",
    rechnerKey: "privatschutz",
  },
  {
    key: "sterbegeld",
    name: "Sterbegeldversicherung",
    benefit: "Menschen, die ihre Angehörigen bei den Bestattungskosten entlasten möchten.",
    proven: false,
    enabled: true,
    sort: 35,
    match: "sterbegeld",
    rechnerKey: null,
  },
  {
    key: "kindersparplan",
    name: "Kindersparplan",
    benefit: "Eltern und Großeltern, die früh für die Zukunft ihrer Kinder vorsorgen möchten.",
    proven: false,
    enabled: true,
    sort: 38,
    match: "kinderspar|sparplan",
    rechnerKey: null,
  },
  {
    key: "unfall",
    name: "Unfallversicherung",
    benefit: "Menschen, die sich und ihre Familie gegen die Folgen eines Unfalls absichern möchten.",
    proven: false,
    enabled: false,
    sort: 40,
    match: "unfall",
    rechnerKey: null,
  },
  {
    key: "zahnzusatz",
    name: "Zahnzusatz",
    benefit: "Interessenten für Zahnersatz und Zahnbehandlung – ein guter Einstieg in die Krankenzusatz.",
    proven: false,
    enabled: false,
    sort: 50,
    match: "zahn",
    rechnerKey: null,
  },
  {
    key: "krankenhauszusatz",
    name: "Krankenhauszusatz",
    benefit: "Chefarzt und Einzelzimmer: Anfragen für die stationäre Zusatzversicherung.",
    proven: false,
    enabled: false,
    sort: 60,
    match: "krankenhaus",
    rechnerKey: null,
  },
];

export const findCatalogItem = (catalog: CatalogItem[], key: string) => catalog.find((c) => c.key === key) ?? null;

/** Gehört ein vorhandener Budget-/Angebotsname zu diesem Katalog-Produkt? */
export function matchesCatalog(item: Pick<CatalogItem, "match" | "name">, productName: string): boolean {
  const n = productName.trim().toLowerCase();
  if (!n) return false;
  if (n === item.name.trim().toLowerCase()) return true;
  try {
    return new RegExp(item.match, "i").test(n);
  } catch {
    return false;
  }
}

/** Garantien gelten nur für Garantie-Produkte (aktuell Katzenversicherung); Regel wie isGuaranteeProduct in lib/garantien.ts. */
export const hasGuarantee = (name: string) => /katze|\btkv\b|tierkranken/i.test(name);

export type BookingPricing = "list" | "individual";

export type BookingPreview = BudgetPreview & {
  setupFee: number;
  /** Aufschlag pro Monat für das weitere Produkt (netto, Listenpreis). */
  extraMonthly: number;
  bookingPricing: BookingPricing;
  /** Grund, warum der Preis von Hand kommt. */
  manualReason: "individual_terms" | "annual" | "no_offer_price" | "service_plan" | null;
  leadsNew: number | null;
  guarantee: boolean;
};

/**
 * Vorschau für ein weiteres Produkt: Gesamtbudget, Betreuungsstufe und Monatspreis wie bei
 * „Budget ändern“ (Stufe + weitere Produkte), dazu die einmalige Einrichtung.
 * Abweichende Konditionen, Jahreszahler oder „Nur Betreuung“ → Preis von Hand (Aufgabe).
 */
export function previewBooking(current: BudgetLine[], add: BudgetLine, ctx: BudgetContext, cplNew: number | null): BookingPreview {
  const next = [...current, add];
  const base = previewChange(current, next, { ...ctx, plan: ctx.plan === "service" ? "software" : ctx.plan });
  const manualReason: BookingPreview["manualReason"] =
    ctx.plan === "service"
      ? "service_plan"
      : base.pricing === "individual"
        ? ctx.billingInterval === "year"
          ? "annual"
          : ctx.feeMonthly == null
            ? "no_offer_price"
            : "individual_terms"
        : null;
  const bookingPricing: BookingPricing = manualReason ? "individual" : "list";
  return {
    ...base,
    // Ohne Listenpreis kein automatischer neuer Preis
    feeTo: bookingPricing === "list" ? base.feeTo : null,
    pricing: bookingPricing === "list" ? "list" : "individual",
    setupFee: PRICE_LIST.extraProductSetupSelfService,
    extraMonthly: PRICE_LIST.extraProductMonthly,
    bookingPricing,
    manualReason,
    leadsNew: cplNew && cplNew > 0 ? Math.round((add.dailyBudget * PRICE_LIST.daysPerMonth) / cplNew) : null,
    guarantee: hasGuarantee(add.product),
    changed: true,
  };
}

export const MANUAL_REASON_LABEL: Record<NonNullable<BookingPreview["manualReason"]>, string> = {
  individual_terms: "abweichender Preis",
  annual: "Jahreszahler",
  no_offer_price: "kein Listenpreis hinterlegt",
  service_plan: "Paket Nur Betreuung",
};

const eur0 = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

/** Satz zur Betreuungsstufe (wie bei „Budget ändern“) bzw. zum individuellen Preis. */
export function bookingSentence(p: BookingPreview): string | null {
  if (p.overIndividual) return tierSentence(p);
  if (p.bookingPricing === "individual") {
    return `Ihre Konditionen sind individuell. Wir bestätigen Ihnen den neuen Monatspreis für ${eur0(p.monthlyTo)} Werbebudget pro Monat gesondert.`;
  }
  return tierSentence(p);
}

export const monthlyBudgetOf = monthlyOf;

export const STATUS_LABEL: Record<string, string> = {
  requested: "Anfrage offen",
  setup: "In Einrichtung",
  live: "Läuft",
  rejected: "Abgelehnt",
  ended: "Beendet",
};
