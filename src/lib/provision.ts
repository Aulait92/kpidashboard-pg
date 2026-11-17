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
// Privatschutz/Haftpflicht mit dem Privatschutz-Satz.
//
// Rechenarten je Sparte (Ole, 14.11.2026, „lebenprodukte werden anders berechnet“). Alle Standardwerte
// sind Erfahrungswerte und in „Konto → Meine Provisionen“ änderbar:
//
// | Rechenart      | Sparten                                   | Grundlage                                        |
// |----------------|-------------------------------------------|--------------------------------------------------|
// | percent        | Sach (TKV, Privatschutz, Hausrat, …), KFZ | % vom Jahresbeitrag (+ laufender Bestand)        |
// | beitragssumme  | Leben/Rente, BU, Kindersparplan,          | ‰ der Beitragssumme (Monatsbeitrag × 12 × Jahre) |
// |                | Risikoleben, Grundfähigkeit, Basisrente,  |                                                  |
// |                | Sterbegeld (Ole, 17.11.2026)              |                                                  |
// |                |                                           | + 1,5 % Bestand vom Jahresbeitrag ab dem 1. Jahr |
// | monthly        | PKV-Neugeschäft                           | Monatsbeiträge, höchstens 9,9 (§ 50 VAG)         |
// | monthly        | Kranken-Zusatz (Zahn, Krankenhaus/ambulant,| Monatsbeiträge + Bestand % vom Jahresbeitrag     |
// |                | Pflege, Krankentagegeld)                  | (Ole, 17.11.2026)                                |
// | honorar        | PKV-Tarifoptimierung (§ 204 VVG)          | Ersparnis × Monate oder fester Betrag (vom Kunden)|
//
// Bei beitragssumme ist LeadContract.premium der Jahresbeitrag (Eingabe als Monatsbeitrag × 12), bei
// PKV der Monatsbeitrag, bei der Tarifoptimierung die monatliche Ersparnis des Kunden.
export type ProductKey =
  | "pkv"
  | "pkv_tarif"
  | "privatschutz"
  | "tkv"
  | "unfall"
  | "hausrat"
  | "wohngebaeude"
  | "rechtsschutz"
  | "kindersparplan"
  | "kfz"
  | "leben_bu"
  | "bu"
  | "risikoleben"
  | "grundfaehigkeit"
  | "basisrente"
  | "sterbegeld"
  | "zahnzusatz"
  | "krankenzusatz"
  | "pflegezusatz"
  | "krankentagegeld"
  | "sonstiges";

/** Eigene Stornoquote pro Jahr für dieses Produkt (Anteil, 0,1 = 10 %); ohne Angabe gilt die allgemeine. */
type WithStorno = { storno?: number };

export type RateSpec = (
  | { kind: "fixed"; amount: number }
  // rate = Abschlussprovision vom Jahresbeitrag (darf 0 sein),
  // trail = laufende Bestandsprovision pro Jahr vom Jahresbeitrag
  | { kind: "percent"; rate: number; defaultPremium: number; trail?: number; trailFromYear2?: boolean }
  // Monatsbeiträge (PKV-Neugeschäft; Kranken-Zusatz mit trail = Bestand pro Jahr vom Jahresbeitrag und
  // defaultMonthly = typischer Monatsbeitrag, wenn keiner eingetragen ist; ohne defaultMonthly gilt fallbackAmount)
  | { kind: "monthly"; months: number; fallbackAmount: number; trail?: number; defaultMonthly?: number }
  // Leben/BU/Rente/Kindersparplan: promille = Abschlussprovision in ‰ der Beitragssumme, trail = Bestand
  // pro Jahr vom Jahresbeitrag (ab dem 1. Jahr), haftungMonate = Stornohaftungszeit
  | {
      kind: "beitragssumme";
      promille: number;
      trail: number;
      defaultMonthly: number;
      defaultYears: number;
      /** Laufzeit bis zu diesem Alter, wenn das Alter des Kunden bekannt ist (BU: 67). */
      defaultEndAge?: number | null;
      haftungMonate: number;
    }
  // PKV-Tarifoptimierung: Honorar vom Kunden = Ersparnis × Monate oder fester Betrag (> 0), kein Bestand
  | { kind: "honorar"; months: number; fixedAmount?: number | null; defaultSavings: number }
) &
  WithStorno;

export type RateKind = RateSpec["kind"];

export type ProvisionRule = (RateSpec & { key: ProductKey; product: string }) | { kind: "value" };

/** Kundenspezifische Sätze je Produkt; gelten vor den Standardregeln. */
export type ProvisionOverrides = Partial<Record<ProductKey, RateSpec>>;

/** § 50 VAG: Abschlussprovision PKV höchstens 3,3 % der Bruttobeitragssumme über 25 Jahre = 9,9 Monatsbeiträge. */
export const PKV_MAX_MONTHS = 9.9;
/** Stornohaftungszeit Leben/BU in Monaten (Standard). */
export const HAFTUNG_MONATE = 60;

const sach = (defaultPremium: number): RateSpec => ({ kind: "percent", rate: 0.55, trail: 0.1, trailFromYear2: true, defaultPremium });
/** Kranken-Zusatz: Monatsbeiträge + Bestand vom Jahresbeitrag (Ole, 17.11.2026). */
const kranken = (defaultMonthly: number, months = 6, trail = 0.02): RateSpec => ({ kind: "monthly", months, fallbackAmount: Math.round(defaultMonthly * months), trail, defaultMonthly });
const leben = (defaultMonthly: number, defaultYears: number, defaultEndAge: number | null = null): RateSpec => ({
  kind: "beitragssumme",
  promille: 25,
  trail: 0.015,
  defaultMonthly,
  defaultYears,
  ...(defaultEndAge ? { defaultEndAge } : {}),
  haftungMonate: HAFTUNG_MONATE,
});

/** Standardregeln mit stabilem Schlüssel und Anzeigenamen (für Einstellungen). */
export const PROVISION_PRODUCTS: readonly { key: ProductKey; label: string; match: RegExp; standard: RateSpec }[] = [
  // PKV-Neugeschäft: Monatsbeiträge (Standard 9, höchstens 9,9 nach § 50 VAG)
  { key: "pkv", label: "PKV-Neugeschäft", match: /pkv|neugesch/i, standard: { kind: "monthly", months: 9, fallbackAmount: 2500 } },
  // PKV-Tarifoptimierung nach § 204 VVG: Honorar vom Kunden (Ersparnis × 6 Monate), kein Bestand
  { key: "pkv_tarif", label: "PKV-Tarifoptimierung (§ 204 VVG)", match: /tarif-?optim|204/i, standard: { kind: "honorar", months: 6, defaultSavings: 100 } },
  // Vertreter: 10 % Bestandsprovision, gezahlt ab dem 2. Jahr (Ole, 13.11.2026 – wie im Rechner)
  { key: "privatschutz", label: "Privatschutz", match: /privatschutz/i, standard: sach(600) },
  { key: "tkv", label: "TKV", match: /\btkv\b|tierkranken/i, standard: sach(350) },
  // Weitere Sach-Sparten: Sach-Standard mit typischem Jahresbeitrag (0 € ist nicht zulässig)
  { key: "unfall", label: "Unfall", match: /unfall/i, standard: sach(180) },
  { key: "hausrat", label: "Hausrat", match: /hausrat/i, standard: sach(120) },
  { key: "wohngebaeude", label: "Wohngebäude", match: /geb(ä|a)ude/i, standard: sach(500) },
  { key: "rechtsschutz", label: "Rechtsschutz", match: /rechtsschutz/i, standard: sach(300) },
  // KFZ: keine Abschlussprovision, 5 % laufend vom Jahresbeitrag ab dem 1. Jahr
  { key: "kfz", label: "KFZ", match: /\bkfz\b|kraftfahrt|\bauto/i, standard: { kind: "percent", rate: 0, trail: 0.05, defaultPremium: 600 } },
  // Leben, Rente, BU, Kindersparplan: ‰ der Beitragssumme
  { key: "leben_bu", label: "Leben/Rente", match: /leben|rente/i, standard: leben(100, 30) },
  { key: "bu", label: "BU", match: /\bbu\b|berufsunf/i, standard: leben(80, 30, 67) },
  { key: "kindersparplan", label: "Kindersparplan", match: /sparplan/i, standard: leben(50, 18) },
  // Weitere Produkte (Ole, 17.11.2026: „hier fehlen noch Produkte“)
  { key: "risikoleben", label: "Risikoleben", match: /risiko-?leben/i, standard: leben(20, 20) },
  { key: "grundfaehigkeit", label: "Grundfähigkeit", match: /grundf(ä|a)hig/i, standard: leben(50, 30, 67) },
  { key: "basisrente", label: "Basisrente (Rürup)", match: /basis-?rente|r(ü|u)rup/i, standard: leben(100, 30) },
  { key: "sterbegeld", label: "Sterbegeld", match: /sterbegeld/i, standard: leben(30, 20) },
  { key: "zahnzusatz", label: "Zahnzusatz", match: /zahn/i, standard: kranken(30) },
  { key: "krankenzusatz", label: "Krankenzusatz (Krankenhaus, ambulant)", match: /krankenhaus|station(ä|a)r|ambulant|krankenzusatz/i, standard: kranken(30) },
  { key: "pflegezusatz", label: "Pflegezusatz", match: /pflege/i, standard: kranken(40) },
  { key: "krankentagegeld", label: "Krankentagegeld", match: /krankentagegeld/i, standard: kranken(30) },
  { key: "sonstiges", label: "Sonstiges", match: /^$/, standard: sach(300) },
];

/** Rechenart je Produkt (fest; eigene Sätze ändern nur die Werte). */
export function rateKindFor(key: ProductKey): RateKind {
  return PROVISION_PRODUCTS.find((p) => p.key === key)!.standard.kind;
}

/** Zulässige Rechenarten eines Produkts (fester Betrag nur bei Beitrags-Produkten, Altbestand). */
function allowedKinds(key: ProductKey): RateKind[] {
  const k = rateKindFor(key);
  return k === "percent" || k === "monthly" ? [k, "fixed"] : [k];
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
  | "bu"
  | "pkv"
  | "pkv_tarif"
  | "risikoleben"
  | "grundfaehigkeit"
  | "basisrente"
  | "sterbegeld"
  | "zahnzusatz"
  | "krankenzusatz"
  | "pflegezusatz"
  | "krankentagegeld"
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
  { key: "leben_bu", label: "Leben/Rente", rateKey: "leben_bu", bestandLine: "Vorsorge", related: ["bu", "unfall"] },
  { key: "bu", label: "BU", rateKey: "bu", bestandLine: "BU", related: ["leben_bu", "unfall"] },
  { key: "pkv", label: "PKV-Neugeschäft", rateKey: "pkv", bestandLine: "Kranken", related: ["bu", "unfall"] },
  { key: "pkv_tarif", label: "PKV-Tarifoptimierung (§ 204 VVG)", rateKey: "pkv_tarif", bestandLine: "Kranken", related: ["bu", "unfall"] },
  { key: "risikoleben", label: "Risikoleben", rateKey: "risikoleben", bestandLine: "Vorsorge", related: ["bu", "unfall"] },
  { key: "grundfaehigkeit", label: "Grundfähigkeit", rateKey: "grundfaehigkeit", bestandLine: "BU", related: ["risikoleben", "unfall"] },
  { key: "basisrente", label: "Basisrente (Rürup)", rateKey: "basisrente", bestandLine: "Vorsorge", related: ["bu", "risikoleben"] },
  { key: "sterbegeld", label: "Sterbegeld", rateKey: "sterbegeld", bestandLine: "Vorsorge", related: ["unfall", "pflegezusatz"] },
  { key: "zahnzusatz", label: "Zahnzusatz", rateKey: "zahnzusatz", bestandLine: "Kranken", related: ["krankenzusatz", "unfall"] },
  { key: "krankenzusatz", label: "Krankenzusatz (Krankenhaus, ambulant)", rateKey: "krankenzusatz", bestandLine: "Kranken", related: ["zahnzusatz", "pflegezusatz"] },
  { key: "pflegezusatz", label: "Pflegezusatz", rateKey: "pflegezusatz", bestandLine: "Kranken", related: ["krankenzusatz", "unfall"] },
  { key: "krankentagegeld", label: "Krankentagegeld", rateKey: "krankentagegeld", bestandLine: "Kranken", related: ["bu", "krankenzusatz"] },
  { key: "sonstiges", label: "Sonstiges", rateKey: "sonstiges", bestandLine: "Sonstiges", related: ["privatschutz", "unfall"] },
];

/** Sparten-Auswahl beim Eintragen: ohne PKV-Neugeschäft (nicht im Angebot), außer ein älterer Vertrag hat sie schon. */
export function spartenAuswahl(current?: string | null): readonly Sparte[] {
  return SPARTEN.filter((s) => s.key !== "pkv" || s.key === current);
}

// Tarifoptimierung zuerst: Lead.source „Wechsel“ (intern) bzw. „PKV-Wechsel“ heißt nach außen
// „PKV-Tarifoptimierung“ (lib/products.displayProduct). „Neugeschäft“ ist das PKV-Neugeschäft.
const SPARTE_RULES: [RegExp, SparteKey][] = [
  [/tarif-?optim|§\s*204|^\s*(pkv[\s-]*)?wechsel/i, "pkv_tarif"],
  // Kranken-Zusatz vor „PKV“ (z. B. „PKV Zahnzusatz“) und vor „Pflege“ im Wort „Krankenpflege“ (Ole, 17.11.2026)
  [/zahn/i, "zahnzusatz"],
  [/krankentagegeld/i, "krankentagegeld"],
  [/pflege-?(zusatz|tagegeld|monatsgeld|rente|versicherung)|pflegebahr/i, "pflegezusatz"],
  [/krankenhaus|station(ä|a)r|ambulant|krankenzusatz/i, "krankenzusatz"],
  [/pkv|^\s*neugesch/i, "pkv"],
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
  [/\bbu\b|berufsunf/i, "bu"],
  // Vor den allgemeinen Leben-/Rente-Regeln (Ole, 17.11.2026)
  [/risiko-?leben/i, "risikoleben"],
  [/grundf(ä|a)hig/i, "grundfaehigkeit"],
  [/basis-?rente|r(ü|u)rup/i, "basisrente"],
  [/sterbegeld|bestattung/i, "sterbegeld"],
  [/leben|rente|altersvorsorge/i, "leben_bu"],
];

/** Sparte zu einer Lead-Quelle bzw. einem Produktnamen (null = unbekannt, z. B. „Empfehlung“). Gleiche Regeln wie die Migrationen 20261118530000 und 20261118670000. */
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

export type ValueField = {
  label: string;
  hint: string;
  placeholder: string;
  /** Eingabe × factor = gespeicherter Wert (Leben/BU: Monatsbeitrag × 12 = Jahresbeitrag). */
  factor: number;
};

const eur0 = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;
const num0 = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

/** Laufzeit-Text einer Beitragssummen-Regel: „30 Jahre“ bzw. „bis Alter 67, ohne Alter 30 Jahre“. */
function termText(r: Extract<RateSpec, { kind: "beitragssumme" }>): string {
  return r.defaultEndAge ? `bis Alter ${r.defaultEndAge}, ohne Alter ${r.defaultYears} Jahre` : `${r.defaultYears} Jahre`;
}

/**
 * Beispiel unter den Feldern einer Beitragssummen-Regel:
 * „Bei 80 € im Monat und 30 Jahren (28.800 € Beitragssumme): ≈ 720 € Abschlussprovision, ≈ 14 € Bestand pro Jahr“.
 */
export function beitragssummeExample(r: Extract<RateSpec, { kind: "beitragssumme" }>, typ: VermittlerTyp = "vertreter"): string {
  const summe = r.defaultMonthly * 12 * r.defaultYears;
  const ab = (summe * r.promille) / 1000;
  const trail = r.defaultMonthly * 12 * r.trail;
  const word = typ === "makler" ? "Abschlusscourtage" : "Abschlussprovision";
  return `Bei ${eur0(r.defaultMonthly)} im Monat und ${r.defaultYears} Jahren (${eur0(summe)} Beitragssumme): ≈ ${eur0(ab)} ${word}, ≈ ${eur0(trail)} Bestand pro Jahr`;
}

/** Eingabefeld beim Abschluss – null = ausblenden (Abschluss direkt speichern). */
export function closeValueField(source: string | null | undefined, overrides?: ProvisionOverrides): ValueField | null {
  const r = ruleFor(source, overrides);
  if (r.kind === "fixed") return null;
  if (r.kind === "honorar") {
    if ((r.fixedAmount ?? 0) > 0) return null;
    return {
      label: "Monatliche Ersparnis des Kunden (optional)",
      placeholder: `z. B. ${num0(r.defaultSavings)}`,
      factor: 1,
      hint: `Daraus schätzen wir Ihr Honorar vom Kunden (${num0(r.months)} × Ersparnis). Ohne Angabe rechnen wir mit ${eur0(r.defaultSavings)} Ersparnis. Bitte mit Ihrer Honorarvereinbarung abgleichen.`,
    };
  }
  if (r.kind === "beitragssumme") {
    return {
      label: "Monatsbeitrag (optional)",
      placeholder: `z. B. ${num0(r.defaultMonthly)}`,
      factor: 12,
      hint: `Daraus schätzen wir Ihre Provision (${num0(r.promille)} ‰ der Beitragssumme, Laufzeit ${termText(r)}). Laufzeit und Beitragssumme können Sie am Vertrag ergänzen. Ohne Angabe rechnen wir mit ${eur0(r.defaultMonthly)} im Monat.`,
    };
  }
  if (r.kind === "monthly") {
    return {
      label: "Monatsbeitrag netto (optional)",
      placeholder: "z. B. 300",
      factor: 1,
      hint: `Daraus schätzen wir Ihre Provision (${num0(r.months)} Monatsbeiträge${(r.trail ?? 0) > 0 ? ` + ${pctText(r.trail!)} Bestand pro Jahr` : ""}). ${r.defaultMonthly ? `Ohne Angabe rechnen wir mit ${eur0(r.defaultMonthly)} im Monat.` : `Ohne Angabe rechnen wir mit ${r.fallbackAmount.toLocaleString("de-DE")} €.`}`,
    };
  }
  if (r.kind === "percent") {
    const fallback = `Ohne Angabe rechnen wir mit ${r.defaultPremium.toLocaleString("de-DE")} €.`;
    const trail = r.trail ?? 0;
    const what =
      r.trailFromYear2 && trail > 0
        ? `Ihre Provision (${pctText(r.rate)} Abschluss; ab dem 2. Jahr ${pctText(trail)} Bestand pro Jahr)`
        : r.rate > 0 && trail > 0
        ? `Ihre Provision (${pctText(r.rate)} Abschluss + ${pctText(trail)} Bestand im 1. Jahr)`
        : trail > 0
          ? `Ihre Bestandsprovision (${pctText(trail)} pro Jahr)`
          : `Ihre Provision (${pctText(r.rate)})`;
    return {
      label: "Jahresbeitrag netto (optional)",
      placeholder: `z. B. ${r.defaultPremium.toLocaleString("de-DE")}`,
      factor: 1,
      hint: `Daraus schätzen wir ${what}. ${fallback}`,
    };
  }
  return { label: "Wert des Abschlusses (optional)", hint: "Fließt als Provision in Ihre Zahlen.", placeholder: "z. B. 1.200", factor: 1 };
}

const pctText = (r: number) => `${(Math.round(r * 1000) / 10).toLocaleString("de-DE")} %`;

function asNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Geschätzte Provision eines Abschlusses (null = nichts bekannt). Gleiche Rechnung wie contractProvision. */
export function estimatedProvision(
  source: string | null | undefined,
  closeValue: unknown,
  overrides?: ProvisionOverrides,
): number | null {
  const r = ruleFor(source, overrides);
  if (r.kind === "value") return asNumber(closeValue);
  const sp = sparteForSource(source) ?? "sonstiges";
  return contractProvision({ sparte: sp, premium: closeValue }, { ...overrides, [r.key]: r }).firstYear;
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
  const est = () => eur(estimatedProvision(source, v, overrides) ?? 0);
  if (r.kind === "fixed") return `Provision ≈ ${eur(r.amount)}`;
  if (r.kind === "honorar") return `${v ? `Ersparnis ${eur(v)}/Monat · ` : ""}Honorar ≈ ${est()}`;
  if (r.kind === "monthly") return `${v ? `Beitrag ${eur(v)}/Monat · ` : ""}Provision ≈ ${est()}`;
  if (r.kind === "beitragssumme") return `${v ? `Beitrag ${eur(v / 12)}/Monat · ` : ""}Provision ≈ ${est()}`;
  if (r.kind === "percent") {
    const prefix = v ? `Beitrag ${eur(v)} · ` : "";
    // Nur Bestand (Makler): jährlicher Betrag statt Einmal-Provision
    if (r.rate === 0 && (r.trail ?? 0) > 0) return `${prefix}Bestand ≈ ${est()}/Jahr`;
    return `${prefix}Provision ≈ ${est()}`;
  }
  return v ? `Provision ${eur(v)}` : null;
}

// ─── Vertreter / Makler und eigene Sätze ─────────────────────────────────

export type VermittlerTyp = "vertreter" | "makler";

export const VERMITTLER_TYPEN: readonly { key: VermittlerTyp; label: string }[] = [
  { key: "vertreter", label: "Vertreter (Ausschließlichkeit)" },
  { key: "makler", label: "Makler" },
];

/**
 * Makler: Sach ohne Abschlussprovision, 22,5 % Bestandscourtage p. a. (typischer Beitrag wie beim
 * Vertreter); KFZ wie beim Vertreter 5 % laufend; Leben/BU/Kindersparplan 35 ‰ der Beitragssumme plus
 * kleine Bestandscourtage (1,5 %); PKV und Tarifoptimierung = Produkt-Standard.
 */
const maklerSach = (key: ProductKey): RateSpec => {
  const std = PROVISION_PRODUCTS.find((p) => p.key === key)!.standard;
  return { kind: "percent", rate: 0, trail: 0.225, defaultPremium: std.kind === "percent" ? std.defaultPremium : 300 };
};
const maklerLeben = (key: ProductKey): RateSpec => {
  const std = PROVISION_PRODUCTS.find((p) => p.key === key)!.standard;
  return std.kind === "beitragssumme" ? { ...std, promille: 35 } : std;
};
const MAKLER_STANDARD: ProvisionOverrides = {
  privatschutz: maklerSach("privatschutz"),
  tkv: maklerSach("tkv"),
  unfall: maklerSach("unfall"),
  hausrat: maklerSach("hausrat"),
  wohngebaeude: maklerSach("wohngebaeude"),
  rechtsschutz: maklerSach("rechtsschutz"),
  sonstiges: maklerSach("sonstiges"),
  leben_bu: maklerLeben("leben_bu"),
  bu: maklerLeben("bu"),
  kindersparplan: maklerLeben("kindersparplan"),
  risikoleben: maklerLeben("risikoleben"),
  grundfaehigkeit: maklerLeben("grundfaehigkeit"),
  basisrente: maklerLeben("basisrente"),
  sterbegeld: maklerLeben("sterbegeld"),
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
    ? "Sie arbeiten als Makler, Ihre Sätze sind mit üblichen Werten für Makler vorausgefüllt (bei Sach z. B. 22,5 % Bestandscourtage pro Jahr statt Abschlussprovision). Kurz prüfen und bei Bedarf anpassen, damit die App Ihre Courtage je Abschluss richtig schätzt."
    : "Sie arbeiten als Vertreter, Ihre Sätze sind mit üblichen Abschlussprovisionen vorausgefüllt (z. B. 55 % vom Jahresbeitrag bei Tierkranken und Privatschutz). Kurz prüfen und bei Bedarf anpassen, damit die App Ihre Provision je Abschluss richtig schätzt.";
}

/** Standard-Satz eines Produkts je Vermittlertyp. */
export function standardRate(key: ProductKey, typ: VermittlerTyp): RateSpec {
  return (typ === "makler" ? MAKLER_STANDARD[key] : undefined) ?? PROVISION_PRODUCTS.find((p) => p.key === key)!.standard;
}

const num = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/** Stornoquote pro Jahr: erlaubter Bereich 0 bis 50 % (Anteil). */
export const STORNO_MAX = 0.5;

/** Stornoquote prüfen (Anteil 0 bis 0,5); leer = keine eigene. */
export function parseStorno(v: unknown): { ok: true; value: number | null } | { ok: false } {
  if (v == null || v === "") return { ok: true, value: null };
  const n = num(v, 0, STORNO_MAX);
  return n == null ? { ok: false } : { ok: true, value: Math.round(n * 10000) / 10000 };
}

/**
 * Eigene Sätze prüfen (Daten aus Formular oder Customer.provisionRates).
 * Prozentwerte als Anteil (0,55 = 55 %). Ungültige Einträge → Fehlertext.
 *
 * Nachsichtig beim Laden: PKV über 9,9 Monatsbeiträge wird auf 9,9 begrenzt, ein typischer Beitrag von
 * 0 € durch den Standard ersetzt (beides mit Fehlertext, Speichern lehnt ab). Eigene Werte einer
 * anderen Rechenart als der des Produkts (z. B. Prozent bei Leben/BU aus der Zeit vor den
 * Rechenarten) werden ignoriert.
 */
export function parseCustomRates(raw: unknown): { rates: ProvisionOverrides; errors: string[] } {
  const rates: ProvisionOverrides = {};
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") return { rates, errors };
  for (const p of PROVISION_PRODUCTS) {
    const r = (raw as Record<string, unknown>)[p.key];
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (!allowedKinds(p.key).includes(o.kind as RateKind)) continue;
    let storno: number | undefined;
    if (o.storno != null && o.storno !== "") {
      const s = parseStorno(o.storno);
      if (!s.ok) errors.push(`${p.label}: Stornoquote zwischen 0 und 50 %`);
      else if (s.value != null) storno = s.value;
    }
    const withStorno = <T extends RateSpec>(x: T): T => (storno != null ? { ...x, storno } : x);
    const std = p.standard;
    if (o.kind === "monthly") {
      const max = p.key === "pkv" ? PKV_MAX_MONTHS : 24;
      let months = num(o.months, 0, max);
      const fallbackAmount = num(o.fallbackAmount, 0, 1_000_000);
      if (months == null) {
        const n = num(o.months, 0, 1000);
        errors.push(p.key === "pkv" ? `${p.label}: höchstens ${num0(PKV_MAX_MONTHS)} Monatsbeiträge (§ 50 VAG)` : `${p.label}: Monatsbeiträge zwischen 0 und 24`);
        if (n != null && n > max) months = max;
      }
      if (fallbackAmount == null) errors.push(`${p.label}: Betrag ohne Beitragsangabe ab 0 €`);
      // Kranken-Zusatz: Bestand pro Jahr und typischer Monatsbeitrag (Ole, 17.11.2026)
      const trail = o.trail == null || o.trail === "" ? 0 : num(o.trail, 0, 0.5);
      const defaultMonthly = o.defaultMonthly == null || o.defaultMonthly === "" ? null : num(o.defaultMonthly, 0.01, 100_000);
      if (trail == null) errors.push(`${p.label}: Bestandsprovision zwischen 0 und 50 %`);
      if (o.defaultMonthly != null && o.defaultMonthly !== "" && defaultMonthly == null) errors.push(`${p.label}: typischer Monatsbeitrag über 0 €`);
      const extra = { ...(trail ? { trail } : {}), ...(defaultMonthly ? { defaultMonthly } : {}) };
      if (months != null && fallbackAmount != null) rates[p.key] = withStorno({ kind: "monthly", months, fallbackAmount, ...extra });
    } else if (o.kind === "percent") {
      const rate = num(o.rate, 0, 1);
      const trail = o.trail == null || o.trail === "" ? 0 : num(o.trail, 0, 1);
      let defaultPremium = num(o.defaultPremium, 0, 1_000_000);
      if (rate == null) errors.push(`${p.label}: Abschlussprovision zwischen 0 und 100 %`);
      if (trail == null) errors.push(`${p.label}: Bestandsprovision zwischen 0 und 100 %`);
      if (defaultPremium == null || defaultPremium === 0) {
        errors.push(`${p.label}: typischer Jahresbeitrag über 0 €`);
        if (defaultPremium === 0 && std.kind === "percent") defaultPremium = std.defaultPremium;
      }
      if (rate != null && trail != null && defaultPremium != null) rates[p.key] = withStorno({ kind: "percent", rate, trail, defaultPremium });
    } else if (o.kind === "beitragssumme") {
      const promille = num(o.promille, 0, 100);
      const trail = o.trail == null || o.trail === "" ? 0 : num(o.trail, 0, 0.2);
      const defaultMonthly = num(o.defaultMonthly, 0.01, 100_000);
      const defaultYears = num(o.defaultYears, 1, 60);
      const defaultEndAge = o.defaultEndAge == null || o.defaultEndAge === "" || o.defaultEndAge === 0 ? null : num(o.defaultEndAge, 30, 90);
      const haftungMonate = num(o.haftungMonate, 0, 120);
      if (promille == null) errors.push(`${p.label}: Abschlussprovision zwischen 0 und 100 ‰`);
      if (trail == null) errors.push(`${p.label}: Bestandsprovision zwischen 0 und 20 %`);
      if (defaultMonthly == null) errors.push(`${p.label}: typischer Monatsbeitrag über 0 €`);
      if (defaultYears == null) errors.push(`${p.label}: Laufzeit zwischen 1 und 60 Jahren`);
      if (o.defaultEndAge != null && o.defaultEndAge !== "" && o.defaultEndAge !== 0 && defaultEndAge == null) errors.push(`${p.label}: Endalter zwischen 30 und 90`);
      if (haftungMonate == null) errors.push(`${p.label}: Stornohaftung zwischen 0 und 120 Monaten`);
      if (promille != null && trail != null && defaultMonthly != null && defaultYears != null && haftungMonate != null) {
        rates[p.key] = withStorno({
          kind: "beitragssumme",
          promille,
          trail,
          defaultMonthly,
          defaultYears: Math.round(defaultYears),
          ...(defaultEndAge ? { defaultEndAge: Math.round(defaultEndAge) } : {}),
          haftungMonate: Math.round(haftungMonate),
        });
      }
    } else if (o.kind === "honorar") {
      const months = num(o.months, 0, 24);
      const fixedAmount = o.fixedAmount == null || o.fixedAmount === "" ? 0 : num(o.fixedAmount, 0, 1_000_000);
      const defaultSavings = num(o.defaultSavings, 0.01, 100_000);
      if (months == null) errors.push(`${p.label}: Monate zwischen 0 und 24`);
      if (fixedAmount == null) errors.push(`${p.label}: fester Betrag ab 0 €`);
      if (defaultSavings == null) errors.push(`${p.label}: Ersparnis ohne Angabe über 0 €`);
      if (months != null && fixedAmount != null && defaultSavings != null) {
        rates[p.key] = withStorno({ kind: "honorar", months, defaultSavings, ...(fixedAmount > 0 ? { fixedAmount } : {}) });
      }
    } else if (o.kind === "fixed") {
      const amount = num(o.amount, 0, 1_000_000);
      if (amount == null) errors.push(`${p.label}: fester Betrag ab 0 €`);
      else rates[p.key] = withStorno({ kind: "fixed", amount });
    }
  }
  return { rates, errors };
}

/**
 * Wirksame Sätze eines Kunden: Standard je Typ, eigene Sätze darüber. Vertreter bekommen bei Sach die
 * Bestandsprovision erst ab dem 2. Jahr (im 1. Jahr fließt die Abschlussprovision). Ohne
 * Abschlussprovision (KFZ) und bei Leben/BU (beitragssumme) gibt es Bestand ab dem 1. Jahr.
 */
export function effectiveRates(typ: unknown, custom?: unknown): ProvisionOverrides {
  const t = asVermittlerTyp(typ);
  const own = parseCustomRates(custom).rates;
  const out: ProvisionOverrides = {};
  for (const p of PROVISION_PRODUCTS) {
    const spec = own[p.key] ?? standardRate(p.key, t);
    out[p.key] = spec.kind === "percent" && t === "vertreter" && spec.rate > 0 && (spec.trail ?? 0) > 0 ? { ...spec, trailFromYear2: true } : spec;
  }
  return out;
}

/** Enthält die Schätzung Bestandsprovision? (für den Hinweis „inkl. Bestand 1. Jahr“) */
export function includesTrail(overrides?: ProvisionOverrides): boolean {
  return Object.values(overrides ?? {}).some(
    (r) => (r?.kind === "percent" && (r.trail ?? 0) > 0 && !r.trailFromYear2) || (r?.kind === "beitragssumme" && r.trail > 0) || (r?.kind === "monthly" && (r.trail ?? 0) > 0),
  );
}

/**
 * Produkte, die ein Vermittlertyp überhaupt anbieten kann: PKV nur als Tarifoptimierung nach § 204 VVG
 * und nur für Makler. PKV-Neugeschäft bieten wir nicht an (Ole, 15.11.2026); die Regel bleibt nur,
 * damit ältere Einträge weiter rechnen.
 */
export function productsForTyp(typ: VermittlerTyp) {
  // „Sonstiges“ nicht als eigene Karte: weitere Produkte legt der Kunde unter „Ihre eigenen Produkte“ an
  return PROVISION_PRODUCTS.filter((p) => p.key !== "pkv" && p.key !== "sonstiges" && (typ === "makler" || p.key !== "pkv_tarif"));
}

// ─── Provision je Vertrag (Cross-Selling, Bestandsprovision) ───────────────
// Reine Funktionen ohne Datenbank, wiederverwendbar (Zahlen, Berichte, Kampagnen-Statistik).
// Ein Vertrag rechnet mit dem Satz seiner Sparte (SPARTEN → rateKey) aus den wirksamen Sätzen
// des Kunden (effectiveRates bzw. loadCustomerProvision().rates).

/**
 * Standard-Stornoquote pro Jahr für Bestandsprovision in der Zukunft (wie in der Präsentation). Gilt nur,
 * solange der Kunde in „Meine Provisionen“ keine eigene Quote eingetragen hat (Customer.stornoQuote,
 * je Produkt RateSpec.storno); alle Prognosen bekommen die wirksame Quote übergeben.
 */
export const STORNO_PRO_JAHR = 0.1;
/** Zeitraum der Bestandshochrechnung „in 5 Jahren“. */
export const BESTAND_JAHRE = 5;

/** Wirksame Stornoquote einer Sparte: eigene des Produkts, sonst die allgemeine des Kunden, sonst Standard. */
export function stornoFor(sparte: string, rates?: ProvisionOverrides, general: number = STORNO_PRO_JAHR): number {
  return rates?.[sparteInfo(sparte).rateKey]?.storno ?? general;
}

export type ContractLike = {
  sparte: string;
  /** Jahresbeitrag netto (PKV: Monatsbeitrag; Tarifoptimierung: monatliche Ersparnis); null = nicht eingetragen. */
  premium: unknown;
  /** Fester Provisionswert (Altbestand ohne Beitrag); gilt nur ohne Beitrag. */
  provisionValue?: unknown;
  /** aktiv | storniert (storniert = 0). */
  status?: string | null;
  /** Leben/BU: Laufzeit in Jahren (geht vor Endalter). */
  termYears?: unknown;
  /** Leben/BU: Endalter (mit Alter des Kunden → Laufzeit). */
  endAge?: unknown;
  /** Alter des Kunden bei Abschluss. */
  customerAge?: unknown;
  /** Leben/BU: Beitragssumme direkt eingetragen (geht vor Monatsbeitrag × 12 × Laufzeit). */
  beitragssumme?: unknown;
  /** Sparte „Sonstiges“: eigenes Produkt mit eigenen Sätzen (Anteile; Bestand pro Jahr ab dem 2. Jahr). */
  productName?: string | null;
  rateAbschluss?: unknown;
  rateBestand?: unknown;
};

/** Anzeigename eines Vertrags: eigenes Produkt (z. B. „Rechtsschutz Gewerbe“) statt „Sonstiges“. */
export function contractLabel(c: { sparte: string; productName?: string | null }): string {
  const name = (c.productName ?? "").trim();
  // Eigenes Produkt (auch Leben/Kranken in deren Sparte, Ole 17.11.2026) heißt wie vom Vermittler angelegt
  return name ? name : sparteInfo(c.sparte).label;
}

export type ContractBasis = "beitrag" | "beitragssumme" | "monatsbeitraege" | "honorar" | "fest";

export type ContractProvision = {
  sparte: SparteKey;
  rateKey: ProductKey;
  /** Beitrag, mit dem gerechnet wurde (eingetragen oder Standard), null bei festem Wert. */
  premiumUsed: number | null;
  /** Kein Beitrag eingetragen (Tipp „Abschlüsse vollständig eintragen“). */
  premiumMissing: boolean;
  /** Einmalige Abschlussprovision (Tarifoptimierung: Honorar vom Kunden). */
  abschluss: number;
  /** Laufende Bestandsprovision pro Jahr. */
  trailPerYear: number;
  /** Bestand erst ab dem 2. Jahr (Vertreter). */
  trailFromYear2: boolean;
  /** Im 1. Jahr verdient: Abschluss + (Makler) Bestand 1. Jahr. Basis für Gewinn und „Courtage 1. Jahr“. */
  firstYear: number;
  /** Rechengrundlage (für Texte). Optional, damit ältere Aufrufer kompatibel bleiben. */
  basis?: ContractBasis;
  /** Leben/BU: Beitragssumme, Laufzeit und Monatsbeitrag, mit denen gerechnet wurde. */
  beitragssumme?: number | null;
  termYears?: number | null;
  monthlyPremium?: number | null;
  /** Leben/BU: Stornohaftungszeit in Monaten (anteilige Rückbelastung). */
  haftungMonate?: number | null;
  /** Abschluss ist ein Honorar vom Kunden (Tarifoptimierung). */
  honorar?: boolean;
  /** Eigene Stornoquote des Produkts (null = allgemeine). */
  storno?: number | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const int = (v: unknown, min: number, max: number) => {
  const n = asNumber(v);
  return n != null && n >= min && n <= max ? Math.round(n) : null;
};

/** Laufzeit eines Leben/BU-Vertrags: eingetragen, sonst Endalter − Alter, sonst Standard. */
export function resolveTermYears(c: Pick<ContractLike, "termYears" | "endAge" | "customerAge">, spec: Extract<RateSpec, { kind: "beitragssumme" }>): number {
  const t = int(c.termYears, 1, 80);
  if (t) return t;
  const age = int(c.customerAge, 1, 100);
  const end = int(c.endAge, 1, 120) ?? spec.defaultEndAge ?? null;
  if (age != null && end != null && end > age) return end - age;
  return spec.defaultYears;
}

/** Geschätzte Provision eines Vertrags mit dem Satz seiner Sparte. */
export function contractProvision(c: ContractLike, rates?: ProvisionOverrides): ContractProvision {
  const sparte = asSparte(c.sparte);
  const rateKey = sparteInfo(sparte).rateKey;
  const base: RateSpec = rates?.[rateKey] ?? PROVISION_PRODUCTS.find((p) => p.key === rateKey)!.standard;
  // Eigenes Produkt: Sätze am Vertrag (Ole, 14.11.2026). Die Sparte bestimmt die Rechenart (17.11.2026):
  // Sach („sonstiges“) % vom Jahresbeitrag, Bestand ab dem 2. Jahr; Leben (Beitragssumme) ‰ der Beitragssumme;
  // Kranken (Monatsbeiträge) Anzahl Monatsbeiträge. Bestand jeweils Anteil vom Jahresbeitrag pro Jahr.
  const eigen = !!(c.productName ?? "").trim() || sparte === "sonstiges";
  const ownA = eigen ? asNumber(c.rateAbschluss) : null;
  const ownB = eigen ? asNumber(c.rateBestand) : null;
  const hatEigene = ownA != null || ownB != null;
  const spec: RateSpec = !hatEigene
    ? base
    : base.kind === "beitragssumme"
      ? { ...base, promille: ownA ?? 0, trail: ownB ?? 0 }
      : base.kind === "monthly"
        ? { ...base, months: ownA ?? 0, trail: ownB ?? 0 }
        : { kind: "percent", rate: ownA ?? 0, trail: ownB ?? 0, trailFromYear2: true, defaultPremium: base.kind === "percent" ? base.defaultPremium : 300, ...(base.storno != null ? { storno: base.storno } : {}) };
  const premium = asNumber(c.premium);
  const zero: ContractProvision = {
    sparte,
    rateKey,
    premiumUsed: null,
    premiumMissing: premium == null,
    abschluss: 0,
    trailPerYear: 0,
    trailFromYear2: false,
    firstYear: 0,
    basis: "beitrag",
    beitragssumme: null,
    termYears: null,
    monthlyPremium: null,
    haftungMonate: null,
    honorar: spec.kind === "honorar",
    storno: spec.storno ?? null,
  };
  if (c.status === "storniert") return zero;
  const fixedValue = asNumber(c.provisionValue);
  const summeIn = spec.kind === "beitragssumme" ? asNumber(c.beitragssumme) : null;
  if (premium == null && summeIn == null && fixedValue != null) return { ...zero, basis: "fest", abschluss: r2(fixedValue), firstYear: r2(fixedValue) };
  if (spec.kind === "fixed") return { ...zero, basis: "fest", abschluss: spec.amount, firstYear: spec.amount };
  if (spec.kind === "honorar") {
    const fixed = spec.fixedAmount ?? 0;
    const a = fixed > 0 ? r2(fixed) : r2((premium ?? spec.defaultSavings) * spec.months);
    return { ...zero, basis: "honorar", premiumUsed: fixed > 0 ? null : (premium ?? spec.defaultSavings), premiumMissing: fixed > 0 ? false : premium == null, abschluss: a, firstYear: a };
  }
  if (spec.kind === "monthly") {
    // Kranken-Zusatz (Ole, 17.11.2026): ohne Beitrag mit dem typischen Monatsbeitrag; Bestand vom Jahresbeitrag
    const monthly = premium ?? spec.defaultMonthly ?? null;
    const a = monthly != null ? r2(monthly * spec.months) : spec.fallbackAmount;
    const trailPerYear = monthly != null && (spec.trail ?? 0) > 0 ? r2(monthly * 12 * spec.trail!) : 0;
    return { ...zero, basis: "monatsbeitraege", premiumUsed: monthly, abschluss: a, trailPerYear, firstYear: r2(a + trailPerYear), monthlyPremium: monthly };
  }
  if (spec.kind === "beitragssumme") {
    const term = resolveTermYears(c, spec);
    // Monatsbeitrag: aus dem Jahresbeitrag, sonst aus der eingetragenen Beitragssumme, sonst Standard
    const monthly = premium != null ? premium / 12 : summeIn != null ? summeIn / (12 * term) : spec.defaultMonthly;
    const summe = summeIn ?? monthly * 12 * term;
    const abschluss = r2((summe * spec.promille) / 1000);
    const trailPerYear = r2(monthly * 12 * spec.trail);
    return {
      ...zero,
      basis: "beitragssumme",
      premiumUsed: r2(monthly * 12),
      premiumMissing: premium == null && summeIn == null,
      abschluss,
      trailPerYear,
      trailFromYear2: false,
      firstYear: r2(abschluss + trailPerYear),
      beitragssumme: r2(summe),
      termYears: term,
      monthlyPremium: r2(monthly),
      haftungMonate: spec.haftungMonate,
    };
  }
  const p = premium ?? spec.defaultPremium;
  const abschluss = r2(p * spec.rate);
  const trailPerYear = r2(p * (spec.trail ?? 0));
  const fromYear2 = !!spec.trailFromYear2 && trailPerYear > 0;
  return { ...zero, premiumUsed: p, abschluss, trailPerYear, trailFromYear2: fromYear2, firstYear: r2(abschluss + (fromYear2 ? 0 : trailPerYear)) };
}

/** Rechenart einer Sparte (für Eingabefelder). */
export function sparteKind(sparte: string): RateKind {
  return rateKindFor(sparteInfo(sparte).rateKey);
}

/** Eingabe × Faktor = gespeicherter Beitrag (Leben/BU: Monatsbeitrag × 12 = Jahresbeitrag). */
export function premiumFactor(sparte: string): number {
  return sparteKind(sparte) === "beitragssumme" ? 12 : 1;
}

/** Eingabefeld „Beitrag“ für eine Sparte (Monatsbeitrag bei PKV und Leben/BU, Ersparnis bei der Tarifoptimierung). */
export function premiumFieldForSparte(sparte: string, rates?: ProvisionOverrides): { label: string; hint: string; placeholder: string; monthly: boolean; factor: number } {
  const info = sparteInfo(sparte);
  const spec = rates?.[info.rateKey] ?? PROVISION_PRODUCTS.find((p) => p.key === info.rateKey)!.standard;
  if (spec.kind === "honorar") {
    const fixed = (spec.fixedAmount ?? 0) > 0;
    return {
      label: "Monatliche Ersparnis des Kunden",
      placeholder: `z. B. ${num0(spec.defaultSavings)}`,
      monthly: true,
      factor: 1,
      hint: fixed
        ? `Honorar (vom Kunden): fest ${eur0(spec.fixedAmount ?? 0)}. Bitte mit Ihrer Honorarvereinbarung abgleichen.`
        : `Honorar (vom Kunden): ${num0(spec.months)} × monatliche Ersparnis, ohne Angabe ${eur0(spec.defaultSavings)}. Bitte mit Ihrer Honorarvereinbarung abgleichen.`,
    };
  }
  if (spec.kind === "beitragssumme") {
    return {
      label: "Monatsbeitrag",
      placeholder: `z. B. ${num0(spec.defaultMonthly)}`,
      monthly: true,
      factor: 12,
      hint: `Satz für ${info.label}: ${num0(spec.promille)} ‰ der Beitragssumme, ${pctText(spec.trail)} Bestand pro Jahr ab dem 1. Jahr. Laufzeit ohne Angabe: ${termText(spec)}.`,
    };
  }
  if (spec.kind === "monthly") {
    const trail = spec.trail ?? 0;
    return {
      label: "Monatsbeitrag netto",
      placeholder: spec.defaultMonthly ? `z. B. ${num0(spec.defaultMonthly)}` : "z. B. 300",
      monthly: true,
      factor: 1,
      hint: `Provision: ${num0(spec.months)} Monatsbeiträge${trail > 0 ? `, ${pctText(trail)} Bestand pro Jahr vom Jahresbeitrag` : ""}.`,
    };
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
      factor: 1,
      hint: parts.length ? `Satz für ${info.label}: ${parts.join(", ")}.` : "",
    };
  }
  return { label: "Jahresbeitrag netto", placeholder: "z. B. 400", monthly: false, factor: 1, hint: "" };
}

// ─── Vertrag gekündigt bzw. storniert: Rückbelastung ──────────────────────

export const CANCEL_REASONS = [
  { key: "kunde", label: "vom Kunden gekündigt" },
  { key: "widerruf", label: "Widerruf" },
  { key: "nichtzahlung", label: "Nichtzahlung" },
  { key: "versicherer", label: "vom Versicherer gekündigt" },
  { key: "sonstiges", label: "Sonstiges" },
] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number]["key"];

export const isCancelReason = (v: unknown): v is CancelReason => CANCEL_REASONS.some((r) => r.key === v);
export const cancelReasonLabel = (key: string | null | undefined) => CANCEL_REASONS.find((r) => r.key === key)?.label ?? "Sonstiges";

/** Volle Monate zwischen zwei Daten (Kalendermonate, angefangene zählen nicht). */
export function monthsBetween(from: Date, to: Date): number {
  let m = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) m--;
  return Math.max(0, m);
}

/**
 * Vorschlag für die Rückbelastung der Abschlussprovision bei Kündigung (null = kein Vorschlag):
 * Widerruf = volle Abschlussprovision; Leben/BU (beitragssumme) innerhalb der Stornohaftungszeit
 * anteilig (verbleibende Monate / Haftungszeit), danach 0; sonst kein Vorschlag.
 */
export function suggestedChargeback(
  c: ContractLike & { signedAt: Date },
  cancelledAt: Date,
  reason: string | null | undefined,
  rates?: ProvisionOverrides,
): number | null {
  const p = contractProvision({ ...c, status: "aktiv" }, rates);
  if (p.abschluss <= 0) return null;
  if (reason === "widerruf") return p.abschluss;
  if (p.basis !== "beitragssumme" || !p.haftungMonate) return null;
  const left = p.haftungMonate - monthsBetween(c.signedAt, cancelledAt);
  if (left <= 0) return 0;
  return r2((p.abschluss * Math.min(left, p.haftungMonate)) / p.haftungMonate);
}

// ─── Bestandsprovision in der Zukunft ─────────────────────────────────────

/** Bezahlter Anteil eines Jahres [age, age+1] bei Bestand ab Jahr 1 bzw. 2 (age in Jahren seit Abschluss), höchstens bis ageEnd. */
function payingShare(ageStart: number, fromYear2: boolean, ageEnd = Infinity): number {
  const from = Math.max(ageStart, fromYear2 ? 1 : 0, 0);
  const to = Math.min(ageStart + 1, ageEnd);
  return Math.min(1, Math.max(0, to - from));
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export type TrailContract = {
  trailPerYear: number;
  trailFromYear2: boolean;
  signedAt: Date;
  /** Eigene Stornoquote (Sparte); sonst die übergebene. */
  storno?: number;
  /** Gekündigt bzw. storniert zum: ab hier keine Bestandsprovision mehr. */
  endsAt?: Date | null;
};

/**
 * Bestandsprovision eines Vertrags in den nächsten `years` Jahren ab `now` (je Jahr ein Betrag),
 * mit Storno pro Jahr. Vertreter (trailFromYear2): erst ab dem ersten Jahrestag. Gekündigte Verträge
 * nur bis zum Kündigungsdatum (ohne Storno-Annahme, das Ende ist ja bekannt). Storno ab heute (wie
 * cohortFutureTrail): Ein laufender Vertrag hat die Jahre bis heute schon überstanden; künftige
 * Verträge (bestandGrowth) ab ihrem Abschluss.
 */
export function trailNextYears(c: TrailContract, now: Date, years = BESTAND_JAHRE, storno = STORNO_PRO_JAHR): number[] {
  const q = c.storno ?? storno;
  const age0 = (now.getTime() - c.signedAt.getTime()) / YEAR_MS;
  const ageEnd = c.endsAt ? (c.endsAt.getTime() - c.signedAt.getTime()) / YEAR_MS : Infinity;
  // Storno zählt ab heute bzw. ab Abschluss, wenn der in der Zukunft liegt (Alter in Jahren)
  const stornoFrom = Math.max(0, age0);
  const out: number[] = [];
  for (let j = 0; j < years; j++) {
    const a = age0 + j;
    const share = payingShare(a, c.trailFromYear2, ageEnd);
    const survive = c.endsAt ? 1 : Math.pow(1 - q, Math.max(0, a + 0.5 - stornoFrom));
    out.push(c.trailPerYear * share * survive);
  }
  return out;
}

/** Summe der Bestandsprovision aller Verträge in den nächsten 5 Jahren („in 5 Jahren: Y €“). */
export function bestandInYears(contracts: TrailContract[], now: Date, years = BESTAND_JAHRE, storno = STORNO_PRO_JAHR): number {
  return r2(contracts.reduce((s, c) => s + trailNextYears(c, now, years, storno).reduce((a, b) => a + b, 0), 0));
}

/**
 * Gewinn „Inkl. Bestand“ (Kohorte): künftige Bestandsprovision eines Vertrags in seinen ersten `years`
 * Vertragsjahren, soweit sie nicht schon in „Nur jetzt“ steckt. Das 1. Vertragsjahr zählt bei Bestand ab
 * dem 1. Jahr (Makler, KFZ, Leben/BU) schon in firstYear, beim Vertreter (ab dem 2. Jahr) gibt es im
 * 1. Jahr keinen Bestand; hier also die Vertragsjahre 2 bis `years`. Storno pro Jahr ab heute (bis heute
 * ist der Vertrag ja da), keine Abzinsung, gekündigte Verträge nur bis zum Kündigungsdatum.
 */
export function cohortFutureTrail(c: TrailContract, now: Date, years = BESTAND_JAHRE, storno = STORNO_PRO_JAHR): number {
  if (c.trailPerYear <= 0) return 0;
  const q = c.storno ?? storno;
  const t0 = c.signedAt.getTime();
  const base = Math.max(now.getTime(), t0);
  let sum = 0;
  for (let j = 1; j < years; j++) {
    const start = t0 + j * YEAR_MS;
    const end = Math.min(t0 + (j + 1) * YEAR_MS, c.endsAt ? c.endsAt.getTime() : Infinity);
    if (end <= start) continue;
    const share = (end - start) / YEAR_MS;
    const mid = (start + end) / 2;
    const survive = c.endsAt ? 1 : Math.pow(1 - q, Math.max(0, (mid - base) / YEAR_MS));
    sum += c.trailPerYear * share * survive;
  }
  return r2(sum);
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

// ─── Tatsächliche Stornoquote ─────────────────────────────────────────────

/** Ab so vielen Verträgen zeigen wir die tatsächliche Stornoquote (sonst „zu wenig Daten“). */
export const STORNO_MIN_VERTRAEGE = 20;

export type StornoContract = { signedAt: Date; cancelledAt?: Date | null };

export type RealStorno = {
  /** Gekündigte Verträge pro Jahr / Bestand im Jahresmittel (null = zu wenig Daten). */
  quote: number | null;
  /** Gekündigt in den letzten 12 Monaten. */
  cancelled: number;
  /** Bestand im Mittel der letzten 12 Monate (Monatsenden). */
  avgBestand: number;
  /** Verträge insgesamt (bis heute abgeschlossen). */
  contracts: number;
  enough: boolean;
};

/**
 * Tatsächliche Stornoquote der letzten 12 Monate: gekündigte Verträge / Bestand im Jahresmittel
 * (Mittel über 12 Monatsstichtage; Monate vor dem Start zählen mit 0, das ergibt Kündigungen je
 * Vertragsjahr). Erst ab STORNO_MIN_VERTRAEGE Verträgen.
 */
export function realStornoQuote(contracts: StornoContract[], now: Date, minContracts = STORNO_MIN_VERTRAEGE): RealStorno {
  const all = contracts.filter((c) => c.signedAt <= now);
  const from = new Date(now.getTime() - YEAR_MS);
  const cancelled = all.filter((c) => c.cancelledAt && c.cancelledAt > from && c.cancelledAt <= now).length;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const t = new Date(now.getTime() - (i * YEAR_MS) / 12);
    sum += all.filter((c) => c.signedAt <= t && (!c.cancelledAt || c.cancelledAt > t)).length;
  }
  const avg = sum / 12;
  const enough = all.length >= minContracts && avg > 0;
  return { quote: enough ? Math.round((cancelled / avg) * 1000) / 1000 : null, cancelled, avgBestand: Math.round(avg * 10) / 10, contracts: all.length, enough };
}
