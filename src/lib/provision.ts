// Geschätzte Provision des Vertreters je Abschluss (Standard laut Ole, 10.11.2026).
// Produkt = Lead.source (enthält-Vergleich, Groß/klein egal). Lead.closeValue
// bedeutet bei Prozent-Produkten den Jahresnettobeitrag, bei unbekannten
// Produkten wie bisher den frei eingegebenen Wert des Abschlusses. Bei
// Monats-Produkten (PKV) ist closeValue der Monatsbeitrag.
//
// | Produkt              | Standard                                   |
// |----------------------|--------------------------------------------|
// | PKV-Tarifoptimierung | 10 × Monatsbeitrag (ohne Angabe 2.500 €)    |
// | Privatschutz         | 55 % × Jahresbeitrag (Standard 600 €)       |
// | TKV                  | 55 % × Jahresbeitrag (Standard 350 €)       |
// | sonstige             | eingegebener Wert (rückwärtskompatibel)     |
//
// Makler (Ole, 10.11.): bei Sach (Privatschutz, TKV) keine Abschlussprovision,
// sondern laufende Bestandsprovision 20–25 % p. a. (Standard 22,5 %).
// PKV-Tarifoptimierung bieten nur Makler an (8–12 Monatsbeiträge, Standard 10).
// Geschätzte Provision eines Abschlusses = Abschlussprovision + Bestandsprovision
// des ersten Jahres.
//
// Eigene Sätze des Kunden (Kundenbereich → Konto → Meine Provisionen) liegen in
// Customer.provisionRates; effectiveRates() setzt Typ-Standard + eigene Sätze
// zusammen, das Ergebnis wird als `overrides` übergeben.

// Cross-Selling (Ole, 14.11.2026): Sätze je Sparte. Katze/Hund/Pferd rechnen mit dem TKV-Satz,
// Privatschutz/Haftpflicht mit dem Privatschutz-Satz, PKV wie bisher. Die übrigen Sparten haben
// vorläufig den Sach-Standard (Vertreter 55 % Abschluss + 10 % Bestand ab dem 2. Jahr, Makler
// 22,5 % Bestand) und keinen Standardbeitrag; änderbar in „Konto → Meine Provisionen“.
export type ProductKey =
  | "pkv"
  | "privatschutz"
  | "tkv"
  | "unfall"
  | "hausrat"
  | "wohngebaeude"
  | "rechtsschutz"
  | "kindersparplan"
  | "kfz"
  | "leben_bu"
  | "sonstiges";

export type RateSpec =
  | { kind: "fixed"; amount: number }
  // rate = Abschlussprovision vom Jahresbeitrag (darf 0 sein),
  // trail = laufende Bestandsprovision pro Jahr vom Jahresbeitrag
  | { kind: "percent"; rate: number; defaultPremium: number; trail?: number; trailFromYear2?: boolean }
  | { kind: "monthly"; months: number; fallbackAmount: number };

export type ProvisionRule = (RateSpec & { key: ProductKey; product: string }) | { kind: "value" };

/** Kundenspezifische Sätze je Produkt; gelten vor den Standardregeln. */
export type ProvisionOverrides = Partial<Record<ProductKey, RateSpec>>;

/** Standardregeln mit stabilem Schlüssel und Anzeigenamen (für Einstellungen). */
export const PROVISION_PRODUCTS: readonly { key: ProductKey; label: string; match: RegExp; standard: RateSpec }[] = [
  // PKV: nur Makler (8–12 Monatsbeiträge Abschlussprovision, Standard 10). Hat ein
  // Vertreter trotzdem einen PKV-Lead, gilt derselbe Standard.
  { key: "pkv", label: "PKV-Tarifoptimierung", match: /pkv/i, standard: { kind: "monthly", months: 10, fallbackAmount: 2500 } },
  // Vertreter: 10 % Bestandsprovision, gezahlt ab dem 2. Jahr (Ole, 13.11.2026 – wie im Rechner)
  { key: "privatschutz", label: "Privatschutz", match: /privatschutz/i, standard: { kind: "percent", rate: 0.55, trail: 0.1, trailFromYear2: true, defaultPremium: 600 } },
  { key: "tkv", label: "TKV", match: /\btkv\b|tierkranken/i, standard: { kind: "percent", rate: 0.55, trail: 0.1, trailFromYear2: true, defaultPremium: 350 } },
  // Weitere Sparten (Cross-Selling): vorläufig Sach-Standard, ohne Standardbeitrag (Ole fragen)
  { key: "unfall", label: "Unfall", match: /unfall/i, standard: sachStandard() },
  { key: "hausrat", label: "Hausrat", match: /hausrat/i, standard: sachStandard() },
  { key: "wohngebaeude", label: "Wohngebäude", match: /geb(ä|a)ude/i, standard: sachStandard() },
  { key: "rechtsschutz", label: "Rechtsschutz", match: /rechtsschutz/i, standard: sachStandard() },
  { key: "kindersparplan", label: "Kindersparplan", match: /sparplan/i, standard: sachStandard() },
  { key: "kfz", label: "KFZ", match: /\bkfz\b|kraftfahrt|\bauto/i, standard: sachStandard() },
  { key: "leben_bu", label: "Leben/BU", match: /leben|\bbu\b|berufsunf/i, standard: sachStandard() },
  { key: "sonstiges", label: "Sonstiges", match: /^$/, standard: sachStandard() },
];

/** Sach-Standard für Sparten ohne eigenen Satz (Vertreter); Makler siehe MAKLER_STANDARD. */
function sachStandard(): RateSpec {
  return { kind: "percent", rate: 0.55, trail: 0.1, trailFromYear2: true, defaultPremium: 0 };
}

// ─── Sparten (Verträge je Lead, Cross-Selling) ─────────────────────────────

export type SparteKey =
  | "katze"
  | "hund"
  | "pferd"
  | "privatschutz"
  | "unfall"
  | "hausrat"
  | "wohngebaeude"
  | "rechtsschutz"
  | "kindersparplan"
  | "kfz"
  | "leben_bu"
  | "pkv"
  | "sonstiges";

export type Sparte = {
  key: SparteKey;
  label: string;
  /** Satz aus „Meine Provisionen“, mit dem die Sparte rechnet. */
  rateKey: ProductKey;
  /** Sparte im Bestand (ExistingContract.line, wie lib/bestand/rows.normalizeLine). */
  bestandLine: string;
  /** Naheliegende weitere Sparten (Hinweis „Weiteres Produkt anbieten?“). */
  related: SparteKey[];
};

/** Auswahl beim Eintragen eines Abschlusses (Reihenfolge = Anzeige). */
export const SPARTEN: readonly Sparte[] = [
  { key: "katze", label: "Katze", rateKey: "tkv", bestandLine: "Tier", related: ["privatschutz", "unfall"] },
  { key: "hund", label: "Hund", rateKey: "tkv", bestandLine: "Tier", related: ["privatschutz", "unfall"] },
  { key: "pferd", label: "Pferd", rateKey: "tkv", bestandLine: "Tier", related: ["privatschutz", "unfall"] },
  { key: "privatschutz", label: "Privatschutz/Haftpflicht", rateKey: "privatschutz", bestandLine: "Haftpflicht", related: ["hausrat", "unfall", "rechtsschutz"] },
  { key: "unfall", label: "Unfall", rateKey: "unfall", bestandLine: "Unfall", related: ["privatschutz", "leben_bu"] },
  { key: "hausrat", label: "Hausrat", rateKey: "hausrat", bestandLine: "Hausrat", related: ["privatschutz", "wohngebaeude"] },
  { key: "wohngebaeude", label: "Wohngebäude", rateKey: "wohngebaeude", bestandLine: "Wohngebäude", related: ["hausrat", "privatschutz"] },
  { key: "rechtsschutz", label: "Rechtsschutz", rateKey: "rechtsschutz", bestandLine: "Rechtsschutz", related: ["privatschutz", "unfall"] },
  { key: "kindersparplan", label: "Kindersparplan", rateKey: "kindersparplan", bestandLine: "Vorsorge", related: ["unfall", "privatschutz"] },
  { key: "kfz", label: "KFZ", rateKey: "kfz", bestandLine: "KFZ", related: ["rechtsschutz", "privatschutz"] },
  { key: "leben_bu", label: "Leben/BU", rateKey: "leben_bu", bestandLine: "Vorsorge", related: ["unfall", "privatschutz"] },
  { key: "pkv", label: "PKV", rateKey: "pkv", bestandLine: "Kranken", related: ["leben_bu", "unfall"] },
  { key: "sonstiges", label: "Sonstiges", rateKey: "sonstiges", bestandLine: "Sonstiges", related: ["privatschutz", "unfall"] },
];

const SPARTE_RULES: [RegExp, SparteKey][] = [
  [/pkv/i, "pkv"],
  [/privatschutz|haftpflicht|\bphv\b/i, "privatschutz"],
  [/katze/i, "katze"],
  [/hund/i, "hund"],
  [/pferd/i, "pferd"],
  [/\btkv\b|tierkranken|tierversicherung/i, "katze"],
  [/unfall/i, "unfall"],
  [/hausrat/i, "hausrat"],
  [/geb(ä|a)ude/i, "wohngebaeude"],
  [/rechtsschutz/i, "rechtsschutz"],
  [/sparplan/i, "kindersparplan"],
  [/\bkfz\b|kraftfahrt|\bauto/i, "kfz"],
  [/leben|\bbu\b|berufsunf/i, "leben_bu"],
];

/** Sparte zu einer Lead-Quelle bzw. einem Produktnamen (null = unbekannt, z. B. „Empfehlung“). Gleiche Regeln wie die Migration 20261118530000. */
export function sparteForSource(source: string | null | undefined): SparteKey | null {
  const s = (source ?? "").trim();
  if (!s) return null;
  return SPARTE_RULES.find(([re]) => re.test(s))?.[1] ?? null;
}

export function asSparte(v: unknown): SparteKey {
  return SPARTEN.some((x) => x.key === v) ? (v as SparteKey) : "sonstiges";
}

export function sparteInfo(key: string | null | undefined): Sparte {
  return SPARTEN.find((x) => x.key === key) ?? SPARTEN.find((x) => x.key === "sonstiges")!;
}

export const sparteLabel = (key: string | null | undefined) => sparteInfo(key).label;

/** Produktschlüssel zu einer Lead-Quelle (null = unbekanntes Produkt). */
export function productKeyFor(source: string | null | undefined): ProductKey | null {
  const sp = sparteForSource(source);
  return sp ? sparteInfo(sp).rateKey : null;
}

export function ruleFor(source: string | null | undefined, overrides?: ProvisionOverrides): ProvisionRule {
  const key = productKeyFor(source);
  if (!key) return { kind: "value" };
  const p = PROVISION_PRODUCTS.find((x) => x.key === key)!;
  return { ...(overrides?.[key] ?? p.standard), key, product: p.label };
}

/** Eingabefeld beim Abschluss – null = ausblenden (Abschluss direkt speichern). */
export function closeValueField(
  source: string | null | undefined,
  overrides?: ProvisionOverrides,
): { label: string; hint: string; placeholder: string } | null {
  const r = ruleFor(source, overrides);
  if (r.kind === "fixed") return null;
  if (r.kind === "monthly") {
    return {
      label: "Monatsbeitrag netto (optional)",
      placeholder: "z. B. 300",
      hint: `Daraus schätzen wir deine Provision (${r.months.toLocaleString("de-DE")} Monatsbeiträge). Ohne Angabe rechnen wir mit ${r.fallbackAmount.toLocaleString("de-DE")} €.`,
    };
  }
  if (r.kind === "percent") {
    const fallback = `Ohne Angabe rechnen wir mit ${r.defaultPremium.toLocaleString("de-DE")} €.`;
    const trail = r.trail ?? 0;
    const what =
      r.trailFromYear2 && trail > 0
        ? `deine Provision (${pctText(r.rate)} Abschluss; ab dem 2. Jahr ${pctText(trail)} Bestand pro Jahr)`
        : r.rate > 0 && trail > 0
        ? `deine Provision (${pctText(r.rate)} Abschluss + ${pctText(trail)} Bestand im 1. Jahr)`
        : trail > 0
          ? `deine Bestandsprovision (${pctText(trail)} pro Jahr)`
          : `deine Provision (${pctText(r.rate)})`;
    return {
      label: "Jahresbeitrag netto (optional)",
      placeholder: `z. B. ${r.defaultPremium.toLocaleString("de-DE")}`,
      hint: `Daraus schätzen wir ${what}. ${fallback}`,
    };
  }
  return { label: "Wert des Abschlusses (optional)", hint: "Fließt als Provision in deine Zahlen.", placeholder: "z. B. 1.200" };
}

const pctText = (r: number) => `${(Math.round(r * 1000) / 10).toLocaleString("de-DE")} %`;

function asNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Geschätzte Provision eines Abschlusses (null = nichts bekannt). */
export function estimatedProvision(
  source: string | null | undefined,
  closeValue: unknown,
  overrides?: ProvisionOverrides,
): number | null {
  const r = ruleFor(source, overrides);
  const v = asNumber(closeValue);
  if (r.kind === "fixed") return r.amount;
  if (r.kind === "monthly") return v ? Math.round(v * r.months * 100) / 100 : r.fallbackAmount;
  // Provision im 1. Jahr: Abschluss + Bestand, außer der Bestand kommt erst ab dem 2. Jahr (Vertreter)
  if (r.kind === "percent") return Math.round((v ?? r.defaultPremium) * (r.rate + (r.trailFromYear2 ? 0 : (r.trail ?? 0))) * 100) / 100;
  return v;
}

/** Summe der geschätzten Provision über abgeschlossene Leads. */
export function sumProvision(
  rows: { source?: string | null; closeValue: unknown }[],
  overrides?: ProvisionOverrides,
): number {
  return rows.reduce((n, r) => n + (estimatedProvision(r.source, r.closeValue, overrides) ?? 0), 0);
}

/** Kurzer Text für Karten: was hinter dem Wert steckt. */
export function closeValueLabel(
  source: string | null | undefined,
  closeValue: unknown,
  overrides?: ProvisionOverrides,
): string | null {
  const r = ruleFor(source, overrides);
  const v = asNumber(closeValue);
  const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  if (r.kind === "fixed") return `Provision ≈ ${eur(r.amount)}`;
  if (r.kind === "monthly") return `${v ? `Beitrag ${eur(v)}/Monat · ` : ""}Provision ≈ ${eur(estimatedProvision(source, v, overrides) ?? 0)}`;
  if (r.kind === "percent") {
    const prefix = v ? `Beitrag ${eur(v)} · ` : "";
    // Nur Bestand (Makler): jährlicher Betrag statt Einmal-Provision
    if (r.rate === 0 && (r.trail ?? 0) > 0) return `${prefix}Bestand ≈ ${eur(estimatedProvision(source, v, overrides) ?? 0)}/Jahr`;
    return `${prefix}Provision ≈ ${eur(estimatedProvision(source, v, overrides) ?? 0)}`;
  }
  return v ? `Provision ${eur(v)}` : null;
}

// ─── Vertreter / Makler und eigene Sätze ─────────────────────────────────

export type VermittlerTyp = "vertreter" | "makler";

export const VERMITTLER_TYPEN: readonly { key: VermittlerTyp; label: string }[] = [
  { key: "vertreter", label: "Vertreter (Ausschließlichkeit)" },
  { key: "makler", label: "Makler" },
];

/** Makler: Sach ohne Abschlussprovision, 22,5 % Bestand p. a.; PKV = Produkt-Standard. */
const MAKLER_STANDARD: ProvisionOverrides = {
  privatschutz: { kind: "percent", rate: 0, trail: 0.225, defaultPremium: 600 },
  tkv: { kind: "percent", rate: 0, trail: 0.225, defaultPremium: 350 },
  // Weitere Sparten: vorläufig Sach-Standard für Makler (Ole fragen)
  unfall: { kind: "percent", rate: 0, trail: 0.225, defaultPremium: 0 },
  hausrat: { kind: "percent", rate: 0, trail: 0.225, defaultPremium: 0 },
  wohngebaeude: { kind: "percent", rate: 0, trail: 0.225, defaultPremium: 0 },
  rechtsschutz: { kind: "percent", rate: 0, trail: 0.225, defaultPremium: 0 },
  kindersparplan: { kind: "percent", rate: 0, trail: 0.225, defaultPremium: 0 },
  kfz: { kind: "percent", rate: 0, trail: 0.225, defaultPremium: 0 },
  leben_bu: { kind: "percent", rate: 0, trail: 0.225, defaultPremium: 0 },
  sonstiges: { kind: "percent", rate: 0, trail: 0.225, defaultPremium: 0 },
};

export function asVermittlerTyp(v: unknown): VermittlerTyp {
  return v === "makler" ? "makler" : "vertreter";
}

/**
 * Hinweis im Einrichtungsschritt „Provisionen prüfen“. Ist der Typ aus dem angenommenen Angebot
 * bekannt, wird nicht mehr danach gefragt – nur die vorausgefüllten Sätze prüfen.
 */
export function provisionSetupHint(typ: VermittlerTyp, known: boolean): string {
  if (!known) {
    return "Damit die App Ihre Provision je Abschluss richtig schätzt: kurz angeben, ob Sie als Vertreter oder Makler arbeiten, und die Sätze prüfen. Vorausgefüllt mit üblichen Werten.";
  }
  return typ === "makler"
    ? "Sie arbeiten als Makler – Ihre Sätze sind mit üblichen Werten für Makler vorausgefüllt (bei Sach z. B. 22,5 % Bestandscourtage pro Jahr statt Abschlussprovision). Kurz prüfen und bei Bedarf anpassen, damit die App Ihre Courtage je Abschluss richtig schätzt."
    : "Sie arbeiten als Vertreter – Ihre Sätze sind mit üblichen Abschlussprovisionen vorausgefüllt (z. B. 55 % vom Jahresbeitrag bei Tierkranken und Privatschutz). Kurz prüfen und bei Bedarf anpassen, damit die App Ihre Provision je Abschluss richtig schätzt.";
}

/** Standard-Satz eines Produkts je Vermittlertyp. */
export function standardRate(key: ProductKey, typ: VermittlerTyp): RateSpec {
  return (typ === "makler" ? MAKLER_STANDARD[key] : undefined) ?? PROVISION_PRODUCTS.find((p) => p.key === key)!.standard;
}

const num = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/**
 * Eigene Sätze prüfen (Daten aus Formular oder Customer.provisionRates).
 * Prozentwerte als Anteil (0,55 = 55 %). Ungültige Einträge → Fehlertext.
 */
export function parseCustomRates(raw: unknown): { rates: ProvisionOverrides; errors: string[] } {
  const rates: ProvisionOverrides = {};
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") return { rates, errors };
  for (const p of PROVISION_PRODUCTS) {
    const r = (raw as Record<string, unknown>)[p.key];
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (o.kind === "monthly") {
      const months = num(o.months, 0, 24);
      const fallbackAmount = num(o.fallbackAmount, 0, 1_000_000);
      if (months == null) errors.push(`${p.label}: Monatsbeiträge zwischen 0 und 24`);
      if (fallbackAmount == null) errors.push(`${p.label}: Betrag ohne Beitragsangabe ab 0 €`);
      if (months != null && fallbackAmount != null) rates[p.key] = { kind: "monthly", months, fallbackAmount };
    } else if (o.kind === "percent") {
      const rate = num(o.rate, 0, 1);
      const trail = o.trail == null || o.trail === "" ? 0 : num(o.trail, 0, 1);
      const defaultPremium = num(o.defaultPremium, 0, 1_000_000);
      if (rate == null) errors.push(`${p.label}: Abschlussprovision zwischen 0 und 100 %`);
      if (trail == null) errors.push(`${p.label}: Bestandsprovision zwischen 0 und 100 %`);
      if (defaultPremium == null) errors.push(`${p.label}: typischer Jahresbeitrag ab 0 €`);
      if (rate != null && trail != null && defaultPremium != null) rates[p.key] = { kind: "percent", rate, trail, defaultPremium };
    } else if (o.kind === "fixed") {
      const amount = num(o.amount, 0, 1_000_000);
      if (amount == null) errors.push(`${p.label}: fester Betrag ab 0 €`);
      else rates[p.key] = { kind: "fixed", amount };
    }
  }
  return { rates, errors };
}

/** Wirksame Sätze eines Kunden: Standard je Typ, eigene Sätze darüber. */
export function effectiveRates(typ: unknown, custom?: unknown): ProvisionOverrides {
  const t = asVermittlerTyp(typ);
  const own = parseCustomRates(custom).rates;
  const out: ProvisionOverrides = {};
  for (const p of PROVISION_PRODUCTS) {
    const spec = own[p.key] ?? standardRate(p.key, t);
    // Vertreter bekommen Bestandsprovision erst ab dem 2. Jahr (auch bei eigenen Sätzen)
    out[p.key] = spec.kind === "percent" && t === "vertreter" && (spec.trail ?? 0) > 0 ? { ...spec, trailFromYear2: true } : spec;
  }
  return out;
}

/** Enthält die Schätzung Bestandsprovision? (für den Hinweis „inkl. Bestand 1. Jahr“) */
export function includesTrail(overrides?: ProvisionOverrides): boolean {
  return Object.values(overrides ?? {}).some((r) => r?.kind === "percent" && (r.trail ?? 0) > 0 && !r.trailFromYear2);
}

/** Produkte, die ein Vermittlertyp überhaupt anbieten kann (PKV nur Makler). */
export function productsForTyp(typ: VermittlerTyp) {
  return PROVISION_PRODUCTS.filter((p) => typ === "makler" || p.key !== "pkv");
}

// ─── Provision je Vertrag (Cross-Selling, Bestandsprovision) ───────────────
// Reine Funktionen ohne Datenbank, wiederverwendbar (Zahlen, Berichte, Kampagnen-Statistik).
// Ein Vertrag rechnet mit dem Satz seiner Sparte (SPARTEN → rateKey) aus den wirksamen Sätzen
// des Kunden (effectiveRates bzw. loadCustomerProvision().rates).

/** Storno je Jahr für Bestandsprovision in der Zukunft (wie in der Präsentation). */
export const STORNO_PRO_JAHR = 0.1;
/** Zeitraum der Bestandshochrechnung „in 5 Jahren“. */
export const BESTAND_JAHRE = 5;

export type ContractLike = {
  sparte: string;
  /** Jahresbeitrag netto (PKV: Monatsbeitrag); null = nicht eingetragen. */
  premium: unknown;
  /** Fester Provisionswert (Altbestand ohne Beitrag); gilt nur ohne Beitrag. */
  provisionValue?: unknown;
  /** aktiv | storniert (storniert = 0). */
  status?: string | null;
};

export type ContractProvision = {
  sparte: SparteKey;
  rateKey: ProductKey;
  /** Beitrag, mit dem gerechnet wurde (eingetragen oder Standard), null bei festem Wert. */
  premiumUsed: number | null;
  /** Kein Beitrag eingetragen (Tipp „Abschlüsse vollständig eintragen“). */
  premiumMissing: boolean;
  /** Einmalige Abschlussprovision. */
  abschluss: number;
  /** Laufende Bestandsprovision pro Jahr. */
  trailPerYear: number;
  /** Bestand erst ab dem 2. Jahr (Vertreter). */
  trailFromYear2: boolean;
  /** Im 1. Jahr verdient: Abschluss + (Makler) Bestand 1. Jahr. Basis für Gewinn und „Courtage 1. Jahr“. */
  firstYear: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Geschätzte Provision eines Vertrags mit dem Satz seiner Sparte. */
export function contractProvision(c: ContractLike, rates?: ProvisionOverrides): ContractProvision {
  const sparte = asSparte(c.sparte);
  const rateKey = sparteInfo(sparte).rateKey;
  const spec: RateSpec = rates?.[rateKey] ?? PROVISION_PRODUCTS.find((p) => p.key === rateKey)!.standard;
  const premium = asNumber(c.premium);
  const zero: ContractProvision = { sparte, rateKey, premiumUsed: null, premiumMissing: premium == null, abschluss: 0, trailPerYear: 0, trailFromYear2: false, firstYear: 0 };
  if (c.status === "storniert") return zero;
  const fixedValue = asNumber(c.provisionValue);
  if (premium == null && fixedValue != null) return { ...zero, abschluss: r2(fixedValue), firstYear: r2(fixedValue) };
  if (spec.kind === "fixed") return { ...zero, abschluss: spec.amount, firstYear: spec.amount };
  if (spec.kind === "monthly") {
    const a = premium ? r2(premium * spec.months) : spec.fallbackAmount;
    return { ...zero, premiumUsed: premium, abschluss: a, firstYear: a };
  }
  const p = premium ?? spec.defaultPremium;
  const abschluss = r2(p * spec.rate);
  const trailPerYear = r2(p * (spec.trail ?? 0));
  const fromYear2 = !!spec.trailFromYear2 && trailPerYear > 0;
  return { ...zero, premiumUsed: p, abschluss, trailPerYear, trailFromYear2: fromYear2, firstYear: r2(abschluss + (fromYear2 ? 0 : trailPerYear)) };
}

/** Eingabefeld „Beitrag“ für eine Sparte (Monatsbeitrag bei PKV). */
export function premiumFieldForSparte(sparte: string, rates?: ProvisionOverrides): { label: string; hint: string; placeholder: string; monthly: boolean } {
  const info = sparteInfo(sparte);
  const spec = rates?.[info.rateKey] ?? PROVISION_PRODUCTS.find((p) => p.key === info.rateKey)!.standard;
  if (spec.kind === "monthly") {
    return { label: "Monatsbeitrag netto", placeholder: "z. B. 300", monthly: true, hint: `Provision: ${spec.months.toLocaleString("de-DE")} Monatsbeiträge.` };
  }
  if (spec.kind === "percent") {
    const trail = spec.trail ?? 0;
    const parts = [
      spec.rate > 0 ? `${pctText(spec.rate)} Abschluss` : null,
      trail > 0 ? `${pctText(trail)} Bestand pro Jahr${spec.trailFromYear2 ? " ab dem 2. Jahr" : ""}` : null,
    ].filter(Boolean);
    return {
      label: "Jahresbeitrag netto",
      placeholder: spec.defaultPremium > 0 ? `z. B. ${spec.defaultPremium.toLocaleString("de-DE")}` : "z. B. 400",
      monthly: false,
      hint: parts.length ? `Satz für ${info.label}: ${parts.join(", ")}.` : "",
    };
  }
  return { label: "Jahresbeitrag netto", placeholder: "z. B. 400", monthly: false, hint: "" };
}

/** Bezahlter Anteil eines Jahres [age, age+1] bei Bestand ab Jahr 1 bzw. 2 (age in Jahren seit Abschluss). */
function payingShare(ageStart: number, fromYear2: boolean): number {
  const from = Math.max(ageStart, fromYear2 ? 1 : 0, 0);
  return Math.min(1, Math.max(0, ageStart + 1 - from));
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export type TrailContract = { trailPerYear: number; trailFromYear2: boolean; signedAt: Date };

/**
 * Bestandsprovision eines Vertrags in den nächsten `years` Jahren ab `now` (je Jahr ein Betrag),
 * mit Storno pro Jahr. Vertreter (trailFromYear2): erst ab dem ersten Jahrestag.
 */
export function trailNextYears(c: TrailContract, now: Date, years = BESTAND_JAHRE, storno = STORNO_PRO_JAHR): number[] {
  const age0 = (now.getTime() - c.signedAt.getTime()) / YEAR_MS;
  const out: number[] = [];
  for (let j = 0; j < years; j++) {
    const a = age0 + j;
    const share = payingShare(a, c.trailFromYear2);
    const survive = Math.pow(1 - storno, Math.max(0, a + 0.5));
    out.push(c.trailPerYear * share * survive);
  }
  return out;
}

/** Summe der Bestandsprovision aller Verträge in den nächsten 5 Jahren („in 5 Jahren: Y €“). */
export function bestandInYears(contracts: TrailContract[], now: Date, years = BESTAND_JAHRE, storno = STORNO_PRO_JAHR): number {
  return r2(contracts.reduce((s, c) => s + trailNextYears(c, now, years, storno).reduce((a, b) => a + b, 0), 0));
}

/**
 * „So wächst dein Bestand“: Bestandsprovision je Jahr über `years` Jahre, wenn im aktuellen Tempo
 * weiter abgeschlossen wird (newPerMonth Verträge mit je avgTrail Bestand pro Jahr), Storno pro Jahr.
 * Gleiche Logik wie die Bestandsfolie der Präsentation.
 */
export function bestandGrowth(input: {
  existing: TrailContract[];
  newPerMonth: number;
  avgTrail: number;
  fromYear2: boolean;
  now: Date;
  years?: number;
  storno?: number;
}): { year: number; existing: number; added: number; total: number }[] {
  const years = input.years ?? BESTAND_JAHRE;
  const storno = input.storno ?? STORNO_PRO_JAHR;
  const base = new Array<number>(years).fill(0);
  for (const c of input.existing) trailNextYears(c, input.now, years, storno).forEach((v, j) => (base[j] += v));
  const added = new Array<number>(years).fill(0);
  if (input.newPerMonth > 0 && input.avgTrail > 0) {
    for (let m = 0; m < years * 12; m++) {
      const signedAt = new Date(input.now.getTime() + ((m + 0.5) / 12) * YEAR_MS);
      trailNextYears({ trailPerYear: input.avgTrail * input.newPerMonth, trailFromYear2: input.fromYear2, signedAt }, input.now, years, storno).forEach((v, j) => (added[j] += v));
    }
  }
  return base.map((b, j) => ({ year: j + 1, existing: Math.round(b), added: Math.round(added[j]), total: Math.round(b + added[j]) }));
}
