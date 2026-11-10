// Geschätzte Provision des Vertreters je Abschluss (Standard laut Ole, 10.11.2026).
// Produkt = Lead.source (enthält-Vergleich, Groß/klein egal). Lead.closeValue
// bedeutet bei Prozent-Produkten den Jahresnettobeitrag, bei unbekannten
// Produkten wie bisher den frei eingegebenen Wert des Abschlusses. Bei
// Monats-Produkten (PKV) ist closeValue der Monatsbeitrag.
//
// | Produkt              | Standard                                   |
// |----------------------|--------------------------------------------|
// | PKV-Tarifoptimierung | 9 × Monatsbeitrag (ohne Angabe 2.500 €)     |
// | Privatschutz         | 55 % × Jahresbeitrag (Standard 600 €)       |
// | TKV                  | 55 % × Jahresbeitrag (Standard 350 €)       |
// | sonstige             | eingegebener Wert (rückwärtskompatibel)     |
//
// Kundenspezifische Sätze (später in den Einstellungen des Vertreters) werden
// als `overrides` je Produktschlüssel übergeben und gelten vor dem Standard.

export type ProductKey = "pkv" | "privatschutz" | "tkv";

export type RateSpec =
  | { kind: "fixed"; amount: number }
  | { kind: "percent"; rate: number; defaultPremium: number }
  | { kind: "monthly"; months: number; fallbackAmount: number };

export type ProvisionRule = (RateSpec & { key: ProductKey; product: string }) | { kind: "value" };

/** Kundenspezifische Sätze je Produkt; gelten vor den Standardregeln. */
export type ProvisionOverrides = Partial<Record<ProductKey, RateSpec>>;

/** Standardregeln mit stabilem Schlüssel und Anzeigenamen (für Einstellungen). */
export const PROVISION_PRODUCTS: readonly { key: ProductKey; label: string; match: RegExp; standard: RateSpec }[] = [
  // PKV: 9 Monatsbeiträge vorläufig (Ole bestätigt noch)
  { key: "pkv", label: "PKV-Tarifoptimierung", match: /pkv/i, standard: { kind: "monthly", months: 9, fallbackAmount: 2500 } },
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
    const rate = Math.round(r.rate * 1000) / 10;
    return {
      label: "Jahresbeitrag netto (optional)",
      placeholder: `z. B. ${r.defaultPremium.toLocaleString("de-DE")}`,
      hint: `Daraus schätzen wir deine Provision (${rate.toLocaleString("de-DE")} %). Ohne Angabe rechnen wir mit ${r.defaultPremium.toLocaleString("de-DE")} €.`,
    };
  }
  return { label: "Wert des Abschlusses (optional)", hint: "Fließt als Provision in deine Zahlen.", placeholder: "z. B. 1.200" };
}

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
  if (r.kind === "percent") return Math.round((v ?? r.defaultPremium) * r.rate * 100) / 100;
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
  if (r.kind === "percent") return `${v ? `Beitrag ${eur(v)} · ` : ""}Provision ≈ ${eur(estimatedProvision(source, v, overrides) ?? 0)}`;
  return v ? `Provision ${eur(v)}` : null;
}
