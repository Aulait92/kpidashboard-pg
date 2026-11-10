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

export type ProductKey = "pkv" | "privatschutz" | "tkv";

export type RateSpec =
  | { kind: "fixed"; amount: number }
  // rate = Abschlussprovision vom Jahresbeitrag (darf 0 sein),
  // trail = laufende Bestandsprovision pro Jahr vom Jahresbeitrag
  | { kind: "percent"; rate: number; defaultPremium: number; trail?: number }
  | { kind: "monthly"; months: number; fallbackAmount: number };

export type ProvisionRule = (RateSpec & { key: ProductKey; product: string }) | { kind: "value" };

/** Kundenspezifische Sätze je Produkt; gelten vor den Standardregeln. */
export type ProvisionOverrides = Partial<Record<ProductKey, RateSpec>>;

/** Standardregeln mit stabilem Schlüssel und Anzeigenamen (für Einstellungen). */
export const PROVISION_PRODUCTS: readonly { key: ProductKey; label: string; match: RegExp; standard: RateSpec }[] = [
  // PKV: nur Makler (8–12 Monatsbeiträge Abschlussprovision, Standard 10). Hat ein
  // Vertreter trotzdem einen PKV-Lead, gilt derselbe Standard.
  { key: "pkv", label: "PKV-Tarifoptimierung", match: /pkv/i, standard: { kind: "monthly", months: 10, fallbackAmount: 2500 } },
  { key: "privatschutz", label: "Privatschutz", match: /privatschutz/i, standard: { kind: "percent", rate: 0.55, defaultPremium: 600 } },
  { key: "tkv", label: "TKV", match: /\btkv\b|tierkranken/i, standard: { kind: "percent", rate: 0.55, defaultPremium: 350 } },
];

/** Produktschlüssel zu einer Lead-Quelle (null = unbekanntes Produkt). */
export function productKeyFor(source: string | null | undefined): ProductKey | null {
  const s = source ?? "";
  return PROVISION_PRODUCTS.find((p) => p.match.test(s))?.key ?? null;
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
      r.rate > 0 && trail > 0
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
  if (r.kind === "percent") return Math.round((v ?? r.defaultPremium) * (r.rate + (r.trail ?? 0)) * 100) / 100;
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
};

export function asVermittlerTyp(v: unknown): VermittlerTyp {
  return v === "makler" ? "makler" : "vertreter";
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
  for (const p of PROVISION_PRODUCTS) out[p.key] = own[p.key] ?? standardRate(p.key, t);
  return out;
}

/** Enthält die Schätzung Bestandsprovision? (für den Hinweis „inkl. Bestand 1. Jahr“) */
export function includesTrail(overrides?: ProvisionOverrides): boolean {
  return Object.values(overrides ?? {}).some((r) => r?.kind === "percent" && (r.trail ?? 0) > 0);
}

/** Produkte, die ein Vermittlertyp überhaupt anbieten kann (PKV nur Makler). */
export function productsForTyp(typ: VermittlerTyp) {
  return PROVISION_PRODUCTS.filter((p) => typ === "makler" || p.key !== "pkv");
}
