// Break-even-Rechner (/rechner) – reine Rechenlogik, Konfiguration und
// URL-Zustand. Keine Datenbank hier (siehe rechner-server.ts), damit die
// gleiche Logik im Browser (live) und in Tests läuft.
//
// Formeln (je Monat, Erwartungswerte, nicht gerundet):
//   Leads        = Budget/Tag × 30,4 ÷ Kosten pro Lead
//   Kunden       = Leads × Anteil Leads, die Kunde werden
//   Verträge     = Kunden × Verträge pro Kunde (TKV: mehrere Katzen)
//   Provision    = Verträge × Provision je Vertrag
//     Prozent:     Beitrag/Jahr × (Abschluss-% + Bestand-% 1. Jahr)
//     Monate:      Monatsbeitrag × Monatsbeiträge
//     Staffel:     höchste erreichte Stufe (nach Verträgen/Monat) gilt für alle Verträge
//   Termine      nur zur Info (Leads × Termin-Quote), nicht Teil der Rechnung
//   Kosten       = (Werbebudget + Betreuung + weitere Berater) × (1,19 bei „inkl. USt.“)
//     Betreuung:   Monatspreis nach Budget-Staffel (offer-pricing.ts)
//     Jahreszahlung (nur 12 Monate): Betreuung + Berater × 10/12
//   Überschuss   = Provision − Kosten
//   Break-even   = kleinste Zahl Verträge n mit n × Provision(n) ≥ Kosten
//   Setup        = Setup-Preis (990 € mit 12 Monaten, 2.490 € ohne) × USt.
//   Jahr 1       = 12 × Überschuss − Setup
// Makler-Modus (Abschluss 0 %, Bestand > 0 %): Bestandssicht mit Storno über
// Kampagne + Nachlauf, siehe berechneBestand() und docs/rechner.md.
// Provision ist umsatzsteuerfrei (Versicherungsvermittlung), Kosten tragen bei
// Vertretern meist 19 % USt., weil sie keine Vorsteuer abziehen können.
//
// Kosten pro Lead: konservativ. Echte Daten ersetzen den Erfahrungswert nur,
// wenn sie HÖHER liegen – der Erfahrungswert enthält bewusst einen Puffer
// (TKV: real zuletzt ca. 2 €, gerechnet mit 6 €; Ole, 11.11.).

import { computeOfferPrice, PRICE_LIST } from "@/lib/offer-pricing";
import { standardRate, type ProductKey, type VermittlerTyp } from "@/lib/provision";

export const DAYS_PER_MONTH = PRICE_LIST.daysPerMonth;
export const VAT = 0.19;
export const BUDGET_MIN = 20;
export const BUDGET_MAX = 150;

// Berater-Plätze und Jahreszahlung – aus der Preisliste des Angebots.
export const SEATS_INCLUDED = PRICE_LIST.seatsIncluded;
export const SEAT_MONTHLY = PRICE_LIST.seatMonthly;
export const ANNUAL_PAID_MONTHS = 12 - PRICE_LIST.annualFreeMonths;

// ─── Konfiguration (Admin → Einstellungen → Rechner) ─────────────────────

export type ProvisionKind = "percent" | "monthly";

export type RechnerProduct = {
  /** stabiler Schlüssel für Links (a–z, 0–9, -) */
  key: string;
  name: string;
  active: boolean;
  /** nur für Makler (z. B. PKV-Tarifoptimierung) */
  maklerOnly: boolean;
  /** Text in Lead-Quelle bzw. Kosten-Produkt (enthält-Vergleich) für echte Kosten pro Lead */
  match: string;
  /** Standard-Provision aus „Meine Provisionen“ (provision.ts); null = eigene Werte unten */
  provisionKey: ProductKey | null;
  kind: ProvisionKind;
  /** eigene Standards, wenn provisionKey null (Anteile, 0,55 = 55 %) */
  vertreterRate: number;
  vertreterTrail: number;
  maklerRate: number;
  maklerTrail: number;
  months: number;
  /** Erfahrungswert Kosten pro Lead (€), mit Puffer */
  cpl: number;
  /** Hinweis zum Erfahrungswert, z. B. „real zuletzt ca. 2 €“ */
  cplNote: string;
  /** true = nie echte Daten nehmen, immer den Erfahrungswert */
  cplOverride: boolean;
  /** Kosten pro Lead im Makler-Modus (€); null = wie cpl. TKV: 4 € (reales Ergebnis, Ole 11.11.) */
  cplMakler: number | null;
  /** Hinweis zum Makler-Wert, z. B. „reales Ergebnis“ */
  cplMaklerNote: string;
  /** Anteil Leads, die Kunde werden (0–1) */
  customerRate: number;
  /** Verträge je Kunde (≥ 1) */
  contractsPerCustomer: number;
  /** nur zur Info: Anteil Leads mit Termin (0–1, 0 = ausblenden) */
  terminRate: number;
  /** Ø Beitrag: Jahresbeitrag (Prozent) bzw. Monatsbeitrag (Monate) */
  premium: number;
  /** Lead-Garantie: Mindest-Leads in 30 Tagen (null = keine Garantie für dieses Produkt) */
  minLeads30: number | null;
};

export type Guarantee = { enabled: boolean; title: string; text: string };

/**
 * Feste Eckwerte der Garantien laut AGB „Garantien“ (gemeinsam für Rechner,
 * Angebot und die automatische Prüfung in lib/garantien.ts). Mindest-Leads je
 * Produkt (minLeads30) und Mindestbudget (guarantees.leads.minBudgetPerDay)
 * stehen in der Rechner-Konfiguration.
 */
export const GARANTIE_FRISTEN = {
  /** Lead-Garantie: aktive Tage ab Kampagnenstart */
  leadTage: 30,
  /** Break-even-Garantie: aktive Tage ab Kampagnenstart */
  breakEvenTage: 90,
  /** Mindestquote wahrgenommene Termine bzw. Leads mit Ergebnis */
  quote: 0.8,
  /** Break-even: längstens so viele Monate ohne Betreuungsgebühr */
  maxFreiMonate: 6,
} as const;

/** Vertrags-Garantie (Makler): Mindestzahl Verträge nach den 90 aktiven Tagen. */
export const VERTRAGS_GARANTIE_MIN_VERTRAEGE = 15;

export type RechnerConfig = {
  products: RechnerProduct[];
  headline: string;
  intro: string;
  footer: string;
  contactUrl: string;
  contactLabel: string;
  guarantees: {
    productSwap: Guarantee;
    leads: Guarantee & { minBudgetPerDay: number };
    breakEven: Guarantee;
  };
  /** Link „Details in unseren AGB“ unter den Garantien (eigene Seite oder https). */
  termsUrl: string;
};

/**
 * Startwerte (Ole, 11.11.): Fokus TKV Katze, einziges aktives Produkt.
 * TKV aus echten Ergebnissen: 9 % der Leads werden Kunden, 12 % Verträge je Lead
 * (≈ 1,33 Verträge pro Kunde). Privatschutz/PKV angelegt, aber inaktiv – Werte
 * dort sind Annahmen.
 */
export const DEFAULT_PRODUCTS: RechnerProduct[] = [
  {
    key: "tkv", name: "Katzenversicherung (TKV)", active: true, maklerOnly: false, match: "tkv",
    provisionKey: "tkv", kind: "percent", vertreterRate: 0.55, vertreterTrail: 0, maklerRate: 0, maklerTrail: 0.225, months: 0,
    cpl: 6, cplNote: "mit Sicherheitspuffer gerechnet, real zuletzt ca. 2 €", cplOverride: false,
    cplMakler: 4, cplMaklerNote: "reales Ergebnis",
    customerRate: 0.09, contractsPerCustomer: 4 / 3, terminRate: 0, premium: 350, minLeads30: 100,
  },
  {
    key: "privatschutz", name: "Privatschutz", active: false, maklerOnly: false, match: "privatschutz",
    provisionKey: "privatschutz", kind: "percent", vertreterRate: 0.55, vertreterTrail: 0, maklerRate: 0, maklerTrail: 0.225, months: 0,
    cpl: 12, cplNote: "Annahme", cplOverride: false, cplMakler: null, cplMaklerNote: "",
    customerRate: 0.1, contractsPerCustomer: 1, terminRate: 0.3, premium: 600, minLeads30: null,
  },
  {
    key: "pkv", name: "PKV-Tarifoptimierung", active: false, maklerOnly: true, match: "pkv",
    provisionKey: "pkv", kind: "monthly", vertreterRate: 0, vertreterTrail: 0, maklerRate: 0, maklerTrail: 0, months: 10,
    cpl: 25, cplNote: "Annahme", cplOverride: false, cplMakler: null, cplMaklerNote: "",
    customerRate: 0.075, contractsPerCustomer: 1, terminRate: 0.25, premium: 250, minLeads30: null,
  },
];


export const DEFAULT_CONFIG: RechnerConfig = {
  products: DEFAULT_PRODUCTS,
  headline: "Rechnet sich das für Sie?",
  intro: "Geben Sie Ihr Werbebudget und Ihre Provision ein – der Rechner zeigt, ab wann Sie Geld verdienen.",
  footer: "Beispielrechnung auf Basis Ihrer Eingaben und unserer Erfahrungswerte, keine Zusage.",
  contactUrl: "mailto:ole.kannapinn@performancegrowth.de?subject=Termin%20zum%20Rechner",
  contactLabel: "Termin vereinbaren",
  guarantees: {
    productSwap: {
      enabled: false,
      title: "Produktwechsel-Garantie",
      text: "Läuft ein Produkt für Sie nicht profitabel, richten wir ein weiteres Produkt Ihrer Wahl kostenlos ein.",
    },
    // Freigegeben von Ole am 11.11.: Lead- und Break-even-Garantie standardmäßig an.
    leads: {
      enabled: true,
      title: "Lead-Garantie",
      text: "Bei mindestens 20 € Werbebudget pro Tag bekommen Sie in den ersten 30 Tagen nach Kampagnenstart mindestens 100 Leads – sonst sind Betreuung und Software im Folgemonat kostenlos.",
      minBudgetPerDay: 20,
    },
    breakEven: {
      enabled: true,
      title: "Break-even-Garantie",
      text: "Liegt Ihre Provision nach 90 Tagen unter Ihren Kosten für Werbung und Betreuung, betreuen wir Sie ohne Betreuungsgebühr weiter – auf Wunsch mit einem anderen Produkt –, bis es sich rechnet (längstens 6 Monate). Voraussetzung: mindestens 20 € Budget pro Tag, mindestens 80 % der gebuchten Termine wahrgenommen und Ergebnisse in der App eingetragen.",
    },
  },
  termsUrl: "/rechtliches/agb",
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const str = (v: unknown, max: number, fallback: string) => (typeof v === "string" ? v.trim().slice(0, max) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
function numIn(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Konfiguration prüfen; fehlende/ungültige Felder → Standard, Fehlertexte für das Formular. */
export function parseRechnerConfig(raw: unknown): { config: RechnerConfig; errors: string[] } {
  const errors: string[] = [];
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CONFIG;
  const products: RechnerProduct[] = [];
  const keys = new Set<string>();
  const list = Array.isArray(r.products) ? r.products : d.products;
  for (const [i, p0] of list.entries()) {
    if (!p0 || typeof p0 !== "object") continue;
    const p = p0 as Record<string, unknown>;
    const label = typeof p.name === "string" && p.name.trim() ? p.name.trim() : `Produkt ${i + 1}`;
    const key = typeof p.key === "string" ? p.key.trim().toLowerCase() : "";
    if (!/^[a-z0-9-]{2,30}$/.test(key)) { errors.push(`${label}: Schlüssel nur a–z, 0–9 und „-“ (2–30 Zeichen)`); continue; }
    if (keys.has(key)) { errors.push(`${label}: Schlüssel „${key}“ doppelt`); continue; }
    keys.add(key);
    const base = d.products.find((x) => x.key === key);
    const pk = p.provisionKey === "tkv" || p.provisionKey === "privatschutz" || p.provisionKey === "pkv" ? p.provisionKey : null;
    const kind: ProvisionKind = pk === "pkv" || (pk == null && p.kind === "monthly") ? "monthly" : "percent";
    const get = (k: string, min: number, max: number, fb: number, what: string) => {
      const v = numIn(p[k], min, max);
      if (v == null && p[k] !== undefined && p[k] !== null && p[k] !== "") errors.push(`${label}: ${what}`);
      return v ?? fb;
    };
    const minLeads = p.minLeads30 === null || p.minLeads30 === "" || p.minLeads30 === undefined ? null : numIn(p.minLeads30, 0, 100_000);
    products.push({
      key,
      name: label.slice(0, 80),
      active: bool(p.active, base?.active ?? true),
      maklerOnly: bool(p.maklerOnly, base?.maklerOnly ?? false),
      match: str(p.match, 60, key) || key,
      provisionKey: pk,
      kind,
      vertreterRate: get("vertreterRate", 0, 1, 0.5, "Abschlussprovision Vertreter 0–100 %"),
      vertreterTrail: get("vertreterTrail", 0, 1, 0, "Bestandsprovision Vertreter 0–100 %"),
      maklerRate: get("maklerRate", 0, 1, 0, "Abschlussprovision Makler 0–100 %"),
      maklerTrail: get("maklerTrail", 0, 1, 0.225, "Bestandsprovision Makler 0–100 %"),
      months: get("months", 0, 24, 10, "Monatsbeiträge 0–24"),
      cpl: get("cpl", 0.5, 1000, base?.cpl ?? 10, "Kosten pro Lead 0,50–1.000 €"),
      cplNote: str(p.cplNote, 120, base?.cplNote ?? ""),
      cplOverride: bool(p.cplOverride, false),
      // fehlt das Feld (ältere gespeicherte Konfiguration) → Standard des Produkts; leer = wie cpl
      cplMakler: p.cplMakler === undefined ? (base?.cplMakler ?? null) : p.cplMakler === null || p.cplMakler === "" ? null : get("cplMakler", 0.5, 1000, base?.cplMakler ?? 4, "Kosten pro Lead Makler 0,50–1.000 €"),
      cplMaklerNote: str(p.cplMaklerNote, 120, base?.cplMaklerNote ?? ""),
      customerRate: get("customerRate", 0, 1, base?.customerRate ?? 0.1, "Anteil Leads, die Kunde werden, 0–100 %"),
      contractsPerCustomer: get("contractsPerCustomer", 1, 10, base?.contractsPerCustomer ?? 1, "Verträge pro Kunde 1–10"),
      terminRate: get("terminRate", 0, 1, base?.terminRate ?? 0, "Termin-Quote 0–100 %"),
      premium: get("premium", 1, 100_000, base?.premium ?? 500, "Beitrag ab 1 €"),
      minLeads30: minLeads != null ? Math.round(minLeads) : null,
    });
  }
  if (!products.some((p) => p.active)) errors.push("Mindestens ein Produkt muss aktiv sein.");
  const g = (r.guarantees && typeof r.guarantees === "object" ? r.guarantees : {}) as Record<string, Record<string, unknown> | undefined>;
  const guarantee = (k: "productSwap" | "leads" | "breakEven"): Guarantee => ({
    enabled: bool(g[k]?.enabled, d.guarantees[k].enabled),
    title: str(g[k]?.title, 80, d.guarantees[k].title) || d.guarantees[k].title,
    text: str(g[k]?.text, 800, d.guarantees[k].text) || d.guarantees[k].text,
  });
  const contactUrl = str(r.contactUrl, 400, d.contactUrl) || d.contactUrl;
  const urlOk = /^(https:\/\/|mailto:|tel:)/i.test(contactUrl);
  if (!urlOk) errors.push("Kontakt-Link muss mit https://, mailto: oder tel: beginnen.");
  const termsUrl = str(r.termsUrl, 400, d.termsUrl) || d.termsUrl;
  const termsOk = /^(https:\/\/|\/(?!\/))/i.test(termsUrl);
  if (!termsOk) errors.push("AGB-Link muss mit / (eigene Seite) oder https:// beginnen.");
  return {
    config: {
      products: products.some((p) => p.active) ? products : d.products,
      headline: str(r.headline, 120, d.headline) || d.headline,
      intro: str(r.intro, 400, d.intro),
      footer: str(r.footer, 600, d.footer) || d.footer,
      contactUrl: urlOk ? contactUrl : d.contactUrl,
      contactLabel: str(r.contactLabel, 40, d.contactLabel) || d.contactLabel,
      guarantees: {
        productSwap: guarantee("productSwap"),
        leads: { ...guarantee("leads"), minBudgetPerDay: numIn(g.leads?.minBudgetPerDay, 0, 1000) ?? d.guarantees.leads.minBudgetPerDay },
        breakEven: guarantee("breakEven"),
      },
      termsUrl: termsOk ? termsUrl : d.termsUrl,
    },
    errors,
  };
}

/** Produkte, die ein Vermittlertyp im Rechner wählen kann. */
export function productsFor(config: RechnerConfig, typ: VermittlerTyp): RechnerProduct[] {
  return config.products.filter((p) => p.active && (typ === "makler" || !p.maklerOnly));
}

// ─── Eingaben (URL-Zustand) ──────────────────────────────────────────────

export type StaffelStufe = { ab: number; wert: number };

export type RechnerInput = {
  produkt: string;
  typ: VermittlerTyp;
  /** Werbebudget € pro Tag */
  budget: number;
  /** Prozent-Produkte: Abschluss- und Bestandsprovision (Anteile) */
  rate: number;
  trail: number;
  /** Monats-Produkte: Monatsbeiträge */
  months: number;
  /** Ø Jahres- bzw. Monatsbeitrag */
  beitrag: number;
  /** bis 3 Stufen: ab n Verträgen/Monat gilt `wert` (Anteil bzw. Monatsbeiträge) */
  staffel: StaffelStufe[];
  customerRate: number;
  contractsPerCustomer: number;
  /** nur Info */
  terminRate: number;
  laufzeit: "12m" | "none";
  jaehrlich: boolean;
  berater: number;
  ust: boolean;
  /** Bestandssicht: Storno pro Jahr (Anteil, 0,1 = 10 %) */
  storno: number;
  /** Bestandssicht: Kampagnendauer in Monaten */
  kampagne: Kampagne;
  /** Bestandssicht: Jahre nach Kampagnenende, bis zu denen Courtage gezählt wird */
  horizont: Horizont;
};

export const KAMPAGNE_OPTIONEN = [6, 12, 24] as const;
export const HORIZONT_OPTIONEN = [3, 5, 10] as const;
export type Kampagne = (typeof KAMPAGNE_OPTIONEN)[number];
export type Horizont = (typeof HORIZONT_OPTIONEN)[number];
export const STORNO_STANDARD = 0.1;
export const STORNO_MIN = 0.01;
export const STORNO_MAX = 0.5;
const KAMPAGNE_STANDARD: Kampagne = 12;
/** Standardbudget €/Tag ohne budget-Parameter. Makler: höheres Budget statt niedrigerem Preis (Ole, 11.11.). */
export const BUDGET_STANDARD: Record<VermittlerTyp, number> = { vertreter: 30, makler: 40 };
/** Vergleich „Kosten je Vertrag“ im Makler-Modus (€/Tag). */
export const BUDGET_VERGLEICH = [40, 60, 95] as const;
const HORIZONT_STANDARD: Horizont = 5;

/** Standard-Provision eines Rechner-Produkts für einen Vermittlertyp. */
export function defaultProvision(p: RechnerProduct, typ: VermittlerTyp): { rate: number; trail: number; months: number } {
  if (p.provisionKey) {
    const s = standardRate(p.provisionKey, typ);
    if (s.kind === "percent") return { rate: s.rate, trail: s.trail ?? 0, months: 0 };
    if (s.kind === "monthly") return { rate: 0, trail: 0, months: s.months };
  }
  if (p.kind === "monthly") return { rate: 0, trail: 0, months: p.months };
  return typ === "makler" ? { rate: p.maklerRate, trail: p.maklerTrail, months: 0 } : { rate: p.vertreterRate, trail: p.vertreterTrail, months: 0 };
}

/** Startwerte eines Produkts (Provision je Typ, Beitrag, Quoten). */
export function defaultInput(p: RechnerProduct, typ: VermittlerTyp, base?: Partial<RechnerInput>): RechnerInput {
  return {
    produkt: p.key,
    typ,
    budget: base?.budget ?? BUDGET_STANDARD[typ],
    ...defaultProvision(p, typ),
    beitrag: p.premium,
    staffel: [],
    customerRate: p.customerRate,
    contractsPerCustomer: p.contractsPerCustomer,
    terminRate: p.terminRate,
    laufzeit: base?.laufzeit ?? "12m",
    jaehrlich: base?.jaehrlich ?? false,
    berater: base?.berater ?? 1,
    ust: base?.ust ?? true,
    storno: base?.storno ?? STORNO_STANDARD,
    kampagne: base?.kampagne ?? KAMPAGNE_STANDARD,
    horizont: base?.horizont ?? HORIZONT_STANDARD,
  };
}

const pct = (n: number) => Math.round(n * 1000) / 10; // 0,555 → 55,5
type Params = Record<string, string | string[] | undefined>;
const one = (q: Params, k: string) => {
  const v = q[k];
  return Array.isArray(v) ? v[0] : v;
};

/** Eingaben aus URL-Parametern; fehlende Werte = Standard des Produkts. */
export function inputFromParams(config: RechnerConfig, q: Params): RechnerInput {
  const typ: VermittlerTyp = one(q, "typ") === "makler" ? "makler" : "vertreter";
  const list = productsFor(config, typ);
  const p = list.find((x) => x.key === one(q, "produkt")) ?? list[0] ?? config.products[0];
  const d = defaultInput(p, typ);
  // fb ist bereits in der internen Einheit (Anteil, nicht %); nur URL-Werte werden skaliert.
  const n = (k: string, min: number, max: number, fb: number, scale = 1) => {
    const v = numIn(one(q, k), min, max);
    return v == null ? fb : v / scale;
  };
  const staffel: StaffelStufe[] = [];
  for (const i of [1, 2, 3]) {
    const ab = numIn(one(q, `s${i}a`), 1, 10_000);
    const w = numIn(one(q, `s${i}w`), 0, p.kind === "monthly" ? 24 : 100);
    if (ab != null && w != null) staffel.push({ ab: Math.round(ab), wert: p.kind === "monthly" ? w : w / 100 });
  }
  const laufzeit = one(q, "lz") === "0" ? "none" : "12m";
  const km = Number(one(q, "km"));
  const hz = Number(one(q, "hz"));
  return {
    produkt: p.key,
    typ,
    budget: clamp(Math.round(n("budget", 1, 10_000, d.budget)), BUDGET_MIN, BUDGET_MAX),
    rate: n("ap", 0, 100, d.rate, 100),
    trail: n("bp", 0, 100, d.trail, 100),
    months: n("mb", 0, 24, d.months),
    beitrag: n("beitrag", 1, 100_000, d.beitrag),
    staffel: staffel.sort((a, b) => a.ab - b.ab),
    customerRate: n("kq", 0, 100, d.customerRate, 100),
    contractsPerCustomer: n("vk", 1, 10, d.contractsPerCustomer),
    terminRate: n("tq", 0, 100, d.terminRate, 100),
    laufzeit,
    jaehrlich: laufzeit === "12m" && one(q, "jv") === "1",
    berater: Math.round(n("ber", 1, 99, d.berater)),
    ust: one(q, "ust") !== "0",
    storno: n("st", STORNO_MIN * 100, STORNO_MAX * 100, d.storno, 100),
    kampagne: KAMPAGNE_OPTIONEN.find((k) => k === km) ?? d.kampagne,
    horizont: HORIZONT_OPTIONEN.find((h) => h === hz) ?? d.horizont,
  };
}

/** Eingaben als URL-Parameter (nur Abweichungen vom Standard, plus Produkt/Typ/Budget). */
export function inputToParams(config: RechnerConfig, i: RechnerInput): URLSearchParams {
  const p = config.products.find((x) => x.key === i.produkt) ?? config.products[0];
  const d = defaultInput(p, i.typ);
  const q = new URLSearchParams();
  q.set("produkt", i.produkt);
  q.set("typ", i.typ);
  q.set("budget", String(i.budget));
  const diff = (a: number, b: number) => Math.abs(a - b) > 1e-9;
  if (p.kind === "monthly") {
    if (diff(i.months, d.months)) q.set("mb", String(i.months));
  } else {
    if (diff(i.rate, d.rate)) q.set("ap", String(pct(i.rate)));
    if (diff(i.trail, d.trail)) q.set("bp", String(pct(i.trail)));
  }
  if (diff(i.beitrag, d.beitrag)) q.set("beitrag", String(i.beitrag));
  i.staffel.slice(0, 3).forEach((s, k) => {
    q.set(`s${k + 1}a`, String(s.ab));
    q.set(`s${k + 1}w`, String(p.kind === "monthly" ? s.wert : pct(s.wert)));
  });
  if (diff(i.customerRate, d.customerRate)) q.set("kq", String(pct(i.customerRate)));
  if (diff(i.contractsPerCustomer, d.contractsPerCustomer)) q.set("vk", String(Math.round(i.contractsPerCustomer * 100) / 100));
  if (diff(i.terminRate, d.terminRate)) q.set("tq", String(pct(i.terminRate)));
  if (i.laufzeit === "none") q.set("lz", "0");
  if (i.jaehrlich && i.laufzeit === "12m") q.set("jv", "1");
  if (i.berater !== 1) q.set("ber", String(i.berater));
  if (!i.ust) q.set("ust", "0");
  if (diff(i.storno, d.storno)) q.set("st", String(pct(i.storno)));
  if (i.kampagne !== d.kampagne) q.set("km", String(i.kampagne));
  if (i.horizont !== d.horizont) q.set("hz", String(i.horizont));
  return q;
}

// ─── Kosten pro Lead ─────────────────────────────────────────────────────

export type CplData = { cpl: number; leads: number } | null;
export type CplInfo = {
  cpl: number;
  source: "daten" | "erfahrungswert";
  note: string;
  /** Wert für den Makler-Modus (nur gesetzt, wenn das Produkt einen eigenen Makler-Wert hat) */
  makler?: CplInfo;
};

/**
 * Konservativ: echte Daten nur, wenn höher als der Erfahrungswert (Puffer bleibt).
 * Makler-Modus: Basis ist cplMakler (z. B. 4 € reales Ergebnis), gleiche Regel.
 */
export function resolveCpl(p: RechnerProduct, data: CplData): CplInfo {
  const base = resolveCplFor(p, p.cpl, p.cplNote, data);
  return p.cplMakler != null ? { ...base, makler: resolveCplFor(p, p.cplMakler, p.cplMaklerNote, data) } : base;
}

function resolveCplFor(p: RechnerProduct, wert: number, hinweis: string, data: CplData): CplInfo {
  const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
  if (!p.cplOverride && data && data.cpl > wert) {
    return { cpl: data.cpl, source: "daten", note: `aus ${data.leads.toLocaleString("de-DE")} Leads der letzten 6 Monate` };
  }
  const real = !p.cplOverride && data ? `real zuletzt ca. ${eur(data.cpl)}` : null;
  const note = hinweis ? (real && /real zuletzt/i.test(hinweis) ? `mit Sicherheitspuffer gerechnet, ${real}` : hinweis) : real ? `mit Sicherheitspuffer gerechnet, ${real}` : "Erfahrungswert";
  return { cpl: wert, source: "erfahrungswert", note };
}

// ─── Rechnung ────────────────────────────────────────────────────────────

/** Provision je Vertrag bei n Verträgen im Monat (Staffel: höchste erreichte Stufe gilt für alle). */
export function provisionPerVertrag(kind: ProvisionKind, i: RechnerInput, vertraege: number): number {
  const stufe = [...i.staffel].sort((a, b) => b.ab - a.ab).find((s) => vertraege >= s.ab);
  if (kind === "monthly") return i.beitrag * (stufe ? stufe.wert : i.months);
  return i.beitrag * ((stufe ? stufe.wert : i.rate) + i.trail);
}

export type RechnerResult = {
  leads: number;
  kunden: number;
  vertraege: number;
  /** nur Info (0 = ausgeblendet) */
  termine: number;
  provisionJeVertrag: number;
  provision: number;
  beitragsvolumen: number;
  werbebudget: number;
  betreuung: number;
  berater: number;
  /** Kosten pro Monat (inkl. USt., wenn gewählt) */
  kosten: number;
  setup: number;
  ueberschuss: number;
  /** null = mit keiner Zahl Verträge erreichbar (Provision 0) */
  breakEvenVertraege: number | null;
  breakEvenAnteilLeads: number | null;
  /** Monate bis das Setup verdient ist (null = Überschuss ≤ 0) */
  setupMonate: number | null;
  jahr1: number;
  proEuro: number;
  individuell: boolean;
  /** kumulierter Überschuss nach Monat 0 (nur Setup) bis 12 */
  kumuliert: number[];
  /** erster Monat mit kumuliertem Überschuss ≥ 0 (null = nicht im ersten Jahr) */
  breakEvenMonat: number | null;
};

export function berechne(p: RechnerProduct, i: RechnerInput, cpl: number): RechnerResult {
  const vat = i.ust ? 1 + VAT : 1;
  const werbebudget = i.budget * DAYS_PER_MONTH;
  const leads = cpl > 0 ? werbebudget / cpl : 0;
  const kunden = leads * i.customerRate;
  const vertraege = kunden * i.contractsPerCustomer;
  const provisionJeVertrag = provisionPerVertrag(p.kind, i, vertraege);
  const provision = vertraege * provisionJeVertrag;

  const price = computeOfferPrice({ package: "software", term: i.laufzeit, products: [{ name: p.name, dailyBudget: i.budget }] });
  const individuell = price.listMonthly == null;
  const monthlyBase = price.listMonthly ?? PRICE_LIST.tiers[PRICE_LIST.tiers.length - 1].monthly;
  const annual = i.jaehrlich && i.laufzeit === "12m" ? ANNUAL_PAID_MONTHS / 12 : 1;
  const betreuung = monthlyBase * annual;
  const berater = Math.max(0, i.berater - SEATS_INCLUDED) * SEAT_MONTHLY * annual;
  const kosten = (werbebudget + betreuung + berater) * vat;
  const setup = price.listSetup * vat;
  const ueberschuss = provision - kosten;

  let breakEvenVertraege: number | null = null;
  for (let n = 1; n <= 10_000; n++) {
    if (n * provisionPerVertrag(p.kind, i, n) >= kosten) { breakEvenVertraege = n; break; }
  }
  const kumuliert = Array.from({ length: 13 }, (_, m) => m * ueberschuss - setup);
  const bm = kumuliert.findIndex((v, m) => m > 0 && v >= 0);
  return {
    leads,
    kunden,
    vertraege,
    termine: leads * i.terminRate,
    provisionJeVertrag,
    provision,
    beitragsvolumen: p.kind === "monthly" ? vertraege * i.beitrag * 12 : vertraege * i.beitrag,
    werbebudget,
    betreuung,
    berater,
    kosten,
    setup,
    ueberschuss,
    breakEvenVertraege,
    breakEvenAnteilLeads: breakEvenVertraege != null && leads > 0 ? breakEvenVertraege / leads : null,
    setupMonate: ueberschuss > 0 ? setup / ueberschuss : null,
    jahr1: 12 * ueberschuss - setup,
    proEuro: kosten > 0 ? provision / kosten : 0,
    individuell,
    kumuliert,
    breakEvenMonat: bm > 0 ? bm : null,
  };
}

// ─── Bestandssicht (Makler, Bestandsprovision) ───────────────────────────

/**
 * Makler-Modus: reine Bestandscourtage ohne Abschlussprovision (z. B. TKV
 * Makler 0 % + 22,5 % p. a.). Dann zeigt der Rechner die Bestandssicht statt
 * „Überschuss pro Monat“; Vertreter behalten die bisherige Ansicht.
 */
export function maklerModus(p: RechnerProduct, i: RechnerInput): boolean {
  return p.kind === "percent" && i.trail > 0 && i.rate === 0 && i.staffel.every((s) => s.wert === 0);
}

export type BestandResult = {
  /** Monate Kampagne + Nachlauf (Horizont × 12) */
  monate: number;
  kampagne: number;
  horizont: number;
  /** monatliche Bleibequote (1 − Storno)^(1/12) */
  bleibeMonat: number;
  /** Faustformel: Jahresbeitrag × Bestand-% ÷ Storno (+ Abschluss im Mischfall), nicht abgezinst */
  lebenszeitJeVertrag: number;
  /** laufende Kosten eines Kampagnenmonats ÷ Verträge im Monat (ohne Setup) */
  kostenJeVertrag: number | null;
  vertraegeNachKampagne: number;
  /** Bestandscourtage pro Jahr aus dem Bestand am Kampagnenende */
  courtageJahrNachKampagne: number;
  courtageKampagne: number;
  courtageNachlauf: number;
  gesamtCourtage: number;
  /** Setup + alle Kosten bis Kampagnenende (Betreuung mindestens Vertragslaufzeit) */
  gesamtKosten: number;
  /** gesamtCourtage ÷ gesamtKosten */
  faktor: number;
  ergebnis: number;
  /** erster Kampagnenmonat, in dem die Courtage des Monats die Kosten des Monats deckt (null = nicht innerhalb der Kampagne) */
  laufendGedecktMonat: number | null;
  /** erster Monat mit kumulierter Courtage ≥ kumulierten Kosten (inkl. Nachlauf; null = nicht im Horizont) */
  breakEvenMonat: number | null;
  /** Index = Monat 0 (nur Setup) … monate */
  bestand: number[];
  courtageMonat: number[];
  kostenMonat: number[];
  kumCourtage: number[];
  kumKosten: number[];
};

/**
 * Bestandsrechnung über Kampagne + Nachlauf, je Monat m:
 *   Bestand(m)  = Bestand(m−1) × (1 − Storno)^(1/12) + neue Verträge (nur während der Kampagne)
 *   Courtage(m) = Bestand(m) × Jahresbeitrag × Bestand-% ÷ 12 + neue Verträge × Jahresbeitrag × Abschluss-%
 *   Kosten(m)   = Werbung (nur Kampagne) + Betreuung/Berater (Kampagne, mind. 12 Monate bei Laufzeit) × USt.
 * Setup in Monat 0. Nach der Kampagne keine Kosten mehr, der Bestand zahlt weiter.
 * Nicht abgezinst. null für Produkte ohne Bestandsprovision.
 */
export function berechneBestand(p: RechnerProduct, i: RechnerInput, r: RechnerResult): BestandResult | null {
  if (p.kind !== "percent" || i.trail <= 0) return null;
  const vat = i.ust ? 1 + VAT : 1;
  const storno = clamp(i.storno, STORNO_MIN, STORNO_MAX);
  const bleibe = Math.pow(1 - storno, 1 / 12);
  const kampagne = i.kampagne;
  const monate = kampagne + i.horizont * 12;
  const betreuungMonate = i.laufzeit === "12m" ? Math.max(kampagne, 12) : kampagne;
  const neu = r.vertraege;
  // Abschluss-% (Staffel wie in berechne), Bestand-% läuft separat über den Bestand
  const abschluss = provisionPerVertrag(p.kind, i, neu) - i.beitrag * i.trail;
  const trailMonat = (i.beitrag * i.trail) / 12;

  const bestand = [0], courtageMonat = [0], kostenMonat = [r.setup], kumCourtage = [0], kumKosten = [r.setup];
  let n = 0;
  let laufendGedecktMonat: number | null = null;
  let breakEvenMonat: number | null = null;
  for (let m = 1; m <= monate; m++) {
    const inKampagne = m <= kampagne;
    const zugang = inKampagne ? neu : 0;
    n = n * bleibe + zugang;
    const c = n * trailMonat + zugang * abschluss;
    const k = ((inKampagne ? r.werbebudget : 0) + (m <= betreuungMonate ? r.betreuung + r.berater : 0)) * vat;
    bestand.push(n);
    courtageMonat.push(c);
    kostenMonat.push(k);
    kumCourtage.push(kumCourtage[m - 1] + c);
    kumKosten.push(kumKosten[m - 1] + k);
    if (inKampagne && laufendGedecktMonat == null && k > 0 && c >= k) laufendGedecktMonat = m;
    if (breakEvenMonat == null && kumCourtage[m] >= kumKosten[m]) breakEvenMonat = m;
  }
  const courtageKampagne = kumCourtage[kampagne];
  const gesamtCourtage = kumCourtage[monate];
  const gesamtKosten = kumKosten[monate];
  const vertraegeNachKampagne = bestand[kampagne];
  return {
    monate,
    kampagne,
    horizont: i.horizont,
    bleibeMonat: bleibe,
    lebenszeitJeVertrag: (i.beitrag * i.trail) / storno + Math.max(0, abschluss),
    kostenJeVertrag: neu > 0 ? r.kosten / neu : null,
    vertraegeNachKampagne,
    courtageJahrNachKampagne: vertraegeNachKampagne * i.beitrag * i.trail,
    courtageKampagne,
    courtageNachlauf: gesamtCourtage - courtageKampagne,
    gesamtCourtage,
    gesamtKosten,
    faktor: gesamtKosten > 0 ? gesamtCourtage / gesamtKosten : 0,
    ergebnis: gesamtCourtage - gesamtKosten,
    laufendGedecktMonat,
    breakEvenMonat,
    bestand,
    courtageMonat,
    kostenMonat,
    kumCourtage,
    kumKosten,
  };
}

export type BudgetVergleichZeile = {
  budget: number;
  /** laufende Kosten im Monat (Werbung + Betreuung/Software + Berater, USt. wie gewählt) */
  kostenMonat: number;
  vertraegeMonat: number;
  kostenJeVertrag: number | null;
  /** Betreuung im Monat netto (Budget-Staffel) */
  betreuung: number;
  /** Bestandscourtage pro Jahr nach 12 Monaten Kampagne */
  courtageJahrNach12: number;
};

/**
 * Gleiche Eingaben, anderes Tagesbudget: Kosten je Vertrag und Courtage/Jahr nach
 * 12 Monaten. Betreuung ist bis zur ersten Budget-Stufe gleich – mehr Budget
 * verteilt sie auf mehr Verträge.
 */
export function budgetVergleich(p: RechnerProduct, i: RechnerInput, cpl: number, budgets: readonly number[] = BUDGET_VERGLEICH): BudgetVergleichZeile[] {
  return budgets.map((budget) => {
    const x: RechnerInput = { ...i, budget, kampagne: 12 };
    const r = berechne(p, x, cpl);
    const b = berechneBestand(p, x, r);
    return {
      budget,
      kostenMonat: r.kosten,
      vertraegeMonat: r.vertraege,
      kostenJeVertrag: r.vertraege > 0 ? r.kosten / r.vertraege : null,
      betreuung: r.betreuung,
      courtageJahrNach12: b ? b.courtageJahrNachKampagne : 0,
    };
  });
}

/** Lead-Garantie für ein Produkt (null = nicht anzeigen). */
export function leadGuaranteeFor(config: RechnerConfig, p: RechnerProduct, budget: number): { minLeads: number; minBudget: number; erfuellt: boolean } | null {
  const g = config.guarantees.leads;
  if (!g.enabled || p.minLeads30 == null) return null;
  return { minLeads: p.minLeads30, minBudget: g.minBudgetPerDay, erfuellt: budget >= g.minBudgetPerDay };
}
