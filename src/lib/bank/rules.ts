// Regeln zur Kostenzuordnung (ohne Datenbank, getestet).
// Eine Regel trifft, wenn ihr Muster (ohne Groß-/Kleinschreibung) in Gegenpartei
// oder Verwendungszweck vorkommt. Eigene Regeln (aus „immer so“) gehen den
// Standardregeln vor; längere Muster gehen kürzeren vor.

// „ki“ (KI-Dienste wie Anthropic, OpenAI) ist ein Teil der direkten Software-Kosten: zählt in Marge und BWA wie
// „software“, wird aber für die Investoren-Kennzahlen (Geld › Auswertung) eigens ausgewiesen.
export const COST_ACTIONS = ["ppl", "software", "ki", "akquise", "betrieb", "ignore"] as const;
export type CostAction = (typeof COST_ACTIONS)[number];
export type CostPurposeKey = Exclude<CostAction, "ignore">;

export const ACTION_LABEL: Record<CostAction, string> = {
  ppl: "Direkt: Pay-per-Lead",
  software: "Direkt: Software",
  ki: "Direkt: KI-Dienste",
  akquise: "Kundengewinnung",
  betrieb: "Sonstiger Betrieb",
  ignore: "Ignorieren (keine Kosten)",
};

export type Rule = { id?: string | null; pattern: string; action: CostAction; vatIncluded?: boolean; label?: string | null; counterpartyOnly?: boolean };

/**
 * Standardregeln. Ignorieren, was sonst doppelt zählt oder keine Betriebskosten sind:
 * Meta-Werbung kommt schon per API, die Amex-Abrechnung auf dem Girokonto ist die
 * Summe der Kartenumsätze (die einzeln aus Amex kommen), Stripe/Umbuchungen/Steuern/Privat.
 */
export const DEFAULT_RULES: Rule[] = [
  // doppelt / keine Kosten
  { pattern: "facebook", action: "ignore", label: "Meta-Werbung (kommt per API)" },
  { pattern: "facebk", action: "ignore", label: "Meta-Werbung (kommt per API)" },
  { pattern: "meta platforms", action: "ignore", label: "Meta-Werbung (kommt per API)" },
  { pattern: "fb.me/ads", action: "ignore", label: "Meta-Werbung (kommt per API)" },
  { pattern: "american express", action: "ignore", label: "Amex-Abrechnung (Umsätze kommen einzeln)" },
  { pattern: "amex", action: "ignore", label: "Amex-Abrechnung (Umsätze kommen einzeln)" },
  { pattern: "zahlung erhalten", action: "ignore", label: "Amex: Ausgleich der Karte" },
  { pattern: "stripe", action: "ignore", label: "Stripe (Auszahlung/Gebühren)" },
  { pattern: "umbuchung", action: "ignore", label: "Umbuchung" },
  { pattern: "übertrag", action: "ignore", label: "Umbuchung" },
  { pattern: "finanzamt", action: "ignore", label: "Steuern" },
  { pattern: "bundeskasse", action: "ignore", label: "Steuern" },
  { pattern: "privat", action: "ignore", label: "Privat" },
  { pattern: "gehalt", action: "ignore", label: "Gehalt (separat)" },
  // Software / Tools
  { pattern: "anthropic", action: "ki" },
  { pattern: "claude.ai", action: "ki" },
  { pattern: "openai", action: "ki" },
  { pattern: "chatgpt", action: "ki" },
  { pattern: "railway", action: "software" },
  { pattern: "vercel", action: "software" },
  { pattern: "google workspace", action: "software" },
  { pattern: "google *gsuite", action: "software" },
  { pattern: "gsuite", action: "software" },
  { pattern: "airtable", action: "ppl" },
  { pattern: "zapier", action: "ppl" },
  { pattern: "360dialog", action: "software" },
  { pattern: "twilio", action: "software" },
  { pattern: "resend", action: "software" },
  { pattern: "sentry", action: "software" },
  { pattern: "github", action: "software" },
  { pattern: "cloudflare", action: "software" },
  { pattern: "godaddy", action: "software" },
  // Kundengewinnung
  { pattern: "instantly", action: "akquise" },
  { pattern: "waalaxy", action: "akquise" },
  { pattern: "linkedin", action: "akquise" },
  { pattern: "calendly", action: "akquise" },
  { pattern: "apollo", action: "akquise" },
];

/**
 * KI-Anbieter: Buchungen mit Zweck „software“, deren Gegenpartei oder Verwendungszweck eines dieser Muster enthält,
 * zählen ebenfalls als KI-Kosten (ältere Zuordnungen von vor der Kategorie „ki“, Regeln wurden schon als „software“
 * gespeichert). Bewusst eng: nur Anbieter, die ausschließlich KI verkaufen.
 */
export const KI_MUSTER = ["anthropic", "claude.ai", "openai", "chatgpt", "mistral ai", "replicate", "elevenlabs", "perplexity"] as const;

/** Ist eine zugeordnete Ausgabe KI-Kosten? Zweck „ki“, oder „software“ mit einem KI-Anbieter in Gegenpartei/Zweck. */
export function istKiKosten(tx: { costPurpose?: string | null; counterparty?: string | null; purpose?: string | null }): boolean {
  if (tx.costPurpose === "ki") return true;
  if (tx.costPurpose !== "software") return false;
  const hay = `${norm(tx.counterparty)} | ${norm(tx.purpose)}`;
  return KI_MUSTER.some((m) => hay.includes(m));
}

function norm(s: string | null | undefined) {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ");
}

/** Passende Regel: eigene vor Standard, längeres Muster vor kürzerem. */
export function matchRule(tx: { counterparty?: string | null; purpose?: string | null }, ownRules: Rule[], defaults: Rule[] = DEFAULT_RULES): Rule | null {
  // Treffer in der Gegenpartei gehen vor Treffern im Verwendungszweck
  // (sonst fängt z. B. eine Privat-Regel „ole kannapinn“ jede Rechnung, in deren Text der Name steht).
  // Bank-CSV bricht Wörter um („FACEBOO K“): Muster ab 6 Zeichen auch ohne Leerzeichen vergleichen
  const ohne = (x: string) => x.replace(/\s+/g, "");
  const trifft = (hay: string, pattern: string) => {
    const p = norm(pattern).trim();
    return hay.includes(p) || (ohne(p).length >= 6 && ohne(hay).includes(ohne(p)));
  };
  const hitIn = (hay: string, rules: Rule[]) =>
    rules
      .filter((r) => r.pattern.trim() && trifft(hay, r.pattern))
      .sort((a, b) => b.pattern.length - a.pattern.length)[0] ?? null;
  const cp = norm(tx.counterparty);
  const all = `${cp} | ${norm(tx.purpose)}`;
  const anywhere = (rules: Rule[]) => rules.filter((r) => !r.counterpartyOnly);
  return (cp ? hitIn(cp, ownRules) : null) ?? (cp ? hitIn(cp, defaults) : null) ?? hitIn(all, anywhere(ownRules)) ?? hitIn(all, anywhere(defaults));
}

/** Kostenbetrag (positiv, netto) aus einer Buchung. Einnahmen → 0. */
export function netCost(amount: number, vatIncluded: boolean, vatRate = 0.19): number {
  if (amount >= 0) return 0;
  const gross = -amount;
  return Math.round((vatIncluded ? gross / (1 + vatRate) : gross) * 100) / 100;
}

/** Vorschlag für eine neue Buchung: Einnahmen immer ignorieren, sonst Regel. */
export function classify(
  tx: { amount: number; counterparty?: string | null; purpose?: string | null },
  ownRules: Rule[],
  defaults: Rule[] = DEFAULT_RULES,
): { status: "neu" | "zugeordnet" | "ignoriert"; costPurpose: CostPurposeKey | null; vatIncluded: boolean; rule: Rule | null; reason?: string } {
  if (tx.amount >= 0) return { status: "ignoriert", costPurpose: null, vatIncluded: false, rule: null, reason: istRuecklastschrift(tx) ? RUECKLASTSCHRIFT : "Einnahme" };
  const rule = matchRule(tx, ownRules, defaults);
  if (!rule) return { status: "neu", costPurpose: null, vatIncluded: false, rule: null };
  if (rule.action === "ignore") return { status: "ignoriert", costPurpose: null, vatIncluded: false, rule };
  return { status: "zugeordnet", costPurpose: rule.action, vatIncluded: !!rule.vatIncluded, rule };
}

/** Kurzes Muster für „immer so“: Gegenpartei ohne Zahlen/Referenzen, sonst Anfang des Verwendungszwecks. */
export function suggestPattern(tx: { counterparty?: string | null; purpose?: string | null }): string {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[0-9]{3,}[\w./-]*/g, " ")
      .replace(/\b(gmbh|ag|inc|ltd|llc|se|co|kg|bv|sarl|ireland|limited|europe|eu|de)\b\.?/g, " ")
      .replace(/[*#,;:()+&]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const c = clean(tx.counterparty ?? "");
  if (c.length >= 3) return c.split(" ").slice(0, 3).join(" ");
  const p = clean(tx.purpose ?? "");
  return p.split(" ").slice(0, 3).join(" ");
}

/**
 * Doppelzählung mit „Laufende Kosten“ (von Hand): Kosten-Position, deren Name in
 * zugeordneten Bankbuchungen der letzten 60 Tage vorkommt.
 */
export function overlappingRecurring<T extends { name: string; endsAt: Date | null }>(
  recurring: T[],
  assigned: { counterparty?: string | null; purpose?: string | null; bookingDate: Date }[],
  now = new Date(),
): T[] {
  const since = now.getTime() - 60 * 86400000;
  const recent = assigned.filter((a) => a.bookingDate.getTime() >= since).map((a) => `${norm(a.counterparty)} ${norm(a.purpose)}`);
  return recurring.filter((r) => {
    if (r.endsAt && r.endsAt.getTime() < now.getTime()) return false;
    const key = norm(r.name).split(/[\s(]/)[0];
    return key.length >= 3 && recent.some((h) => h.includes(key));
  });
}

/** Netto einer Ausgabe: laut Beleg, wenn der EUR-Bruttobetrag zum Umsatz passt (±2 Cent), sonst geschätzt (netCost). */
export function bankNetto(
  amount: number,
  vatIncluded: boolean,
  beleg?: { netto: unknown; brutto: unknown; waehrung: string } | null,
): { netto: number; laut: "beleg" | "schaetzung" } {
  const b = beleg;
  if (b && b.waehrung === "EUR" && b.netto != null && b.brutto != null && Math.abs(Number(b.brutto) + amount) <= 0.02) {
    return { netto: Math.round(Number(b.netto) * 100) / 100, laut: "beleg" };
  }
  return { netto: netCost(amount, vatIncluded), laut: "schaetzung" };
}

// ─── Rücklastschriften (Ole, 25.11.2026) ─────────────────────────────────
// Eine zurückgegebene Lastschrift kommt als Gutschrift mit „Rückgabegrund: …“ und derselben End-to-End-Referenz wie die
// Lastschrift. Beide zählen nicht als Kosten bzw. Einnahme. Rückgabe-Entgelte der Bank (negativ) bleiben Bankkosten.

export const RUECKLASTSCHRIFT = "Rücklastschrift";
export const ZURUECKGEGEBEN = "zurückgegeben";

/** Gutschrift einer zurückgegebenen Lastschrift (Betrag positiv, „Rückgabegrund“ bzw. „Rücklastschrift“ im Text). */
export function istRuecklastschrift(tx: { amount: number; purpose?: string | null; counterparty?: string | null }): boolean {
  if (!(tx.amount > 0)) return false;
  const h = `${tx.purpose ?? ""} ${tx.counterparty ?? ""}`.toLowerCase().replace(/\s+/g, " ");
  return /r(?:ü|ue)ck\s?gabe\s?grund|r(?:ü|ue)ck\s?lastschrift|lastschrift\s?r(?:ü|ue)ckgabe/.test(h);
}

/** End-to-End-Referenz aus dem Verwendungszweck („End-to-End-Ref.: D-123…“), ohne NOTPROVIDED. */
export function endToEndRef(purpose: string | null | undefined): string | null {
  const m = (purpose ?? "").match(/end-?to-?end-?ref(?:erenz)?\.?\s*:?\s*([^\s,;]+)/i);
  const ref = m?.[1]?.replace(/[.]+$/, "").toUpperCase() ?? "";
  return ref.length >= 4 && ref !== "NOTPROVIDED" ? ref : null;
}

export type RlBuchung = { id: string; accountKey: string; bookingDate: Date; amount: number; counterparty?: string | null; purpose?: string | null };
export type RlPaar<T extends RlBuchung> = { rueckbuchung: T; lastschrift: T | null; ueber: "referenz" | "betrag" | null };

/**
 * Rücklastschriften ihren Lastschriften zuordnen: gleiche End-to-End-Referenz und gleicher Betrag (Lastschrift nicht
 * später als die Rückbuchung), sonst gleiches Konto, gleicher Betrag, gleiche Gegenpartei bis 14 Tage vorher. Jede
 * Lastschrift höchstens einmal. Ohne passende Lastschrift: lastschrift null.
 */
export function ruecklastschriftPaare<T extends RlBuchung>(buchungen: T[]): RlPaar<T>[] {
  const cents = (x: number) => Math.round(Math.abs(x) * 100);
  const cp = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, "");
  const rueck = buchungen.filter((b) => istRuecklastschrift(b)).sort((a, b) => a.bookingDate.getTime() - b.bookingDate.getTime());
  const lastschriften = buchungen.filter((b) => b.amount < 0);
  const vergeben = new Set<string>();
  const out: RlPaar<T>[] = [];
  for (const r of rueck) {
    const ref = endToEndRef(r.purpose);
    const kandidaten = lastschriften
      .filter((l) => !vergeben.has(l.id) && cents(l.amount) === cents(r.amount) && l.bookingDate.getTime() <= r.bookingDate.getTime())
      .sort((a, b) => b.bookingDate.getTime() - a.bookingDate.getTime());
    let treffer: T | null = null;
    let ueber: RlPaar<T>["ueber"] = null;
    if (ref) {
      treffer = kandidaten.find((l) => endToEndRef(l.purpose) === ref) ?? null;
      if (treffer) ueber = "referenz";
    }
    if (!treffer) {
      treffer =
        kandidaten.find(
          (l) =>
            l.accountKey === r.accountKey &&
            cp(l.counterparty) === cp(r.counterparty) &&
            r.bookingDate.getTime() - l.bookingDate.getTime() <= 14 * 86_400_000 &&
            // mit Referenz auf beiden Seiten muss sie übereinstimmen
            !(ref && endToEndRef(l.purpose)),
        ) ?? null;
      if (treffer) ueber = "betrag";
    }
    if (treffer) vergeben.add(treffer.id);
    out.push({ rueckbuchung: r, lastschrift: treffer, ueber });
  }
  return out;
}

// ─── Verdacht „ohne USt“ (Diagnose bank-regeln) ──────────────────────────

const USt_DEUTSCH = /steuerberat|stbg|phdr|treuhand|notar|rechtsanw|anwaltskanzlei|wirtschaftspr(?:ü|ue)f|telekom|vodafone|\bo2\b|telef[oó]nica|1&1|1und1|ionos|strato|datev|deutsche post|\bdhl\b|\bihk\b|handwerkskammer|miete\b|b(?:ü|ue)robedarf/;
const USt_FREI = /versicher|assekuranz|\bbank\b|sparkasse|commerzbank|kontof(?:ü|ue)hr|entgelt|geb(?:ü|ue)hr|zinsen|finanzamt|bundeskasse|rundfunkbeitrag|krankenkasse|berufsgenossenschaft/;
const USt_AUSLAND = /ireland|emea|google cloud|meta platforms|facebook|linkedin|openai|anthropic|claude\.ai|\bltd\b|limited|\binc\b|\bllc\b|\bb\.?v\.?\b|s\.?a\.?r\.?l|luxembourg|netherlands|amazon web services|aws emea|apple distribution|microsoft ireland|twilio|github|vercel|railway|zapier|airtable|calendly|cloudflare/;
const USt_KLEIN = /kleinunternehm|§\s*19\s*ustg/;
const RECHTSFORM_DE = /\bgmbh\b|\bug\b|\bag\b|\bkg\b|\bohg\b|\be\.\s?k\.?\b|\bgbr\b|\beg\b/;

/**
 * Heuristik: Regel „ohne USt“ bei vermutlich deutschem Dienstleister? Versicherungen, Bankentgelte und Steuern sind
 * umsatzsteuerfrei, Anbieter aus dem EU-Ausland/Drittland rechnen ohne deutsche USt ab (Reverse Charge), Kleinunternehmer
 * ebenfalls. Nur ein Hinweis zum Prüfen.
 */
export function ustVerdacht(r: { action: string; vatIncluded: boolean; pattern: string; label?: string | null }, gegenparteien: (string | null | undefined)[] = []): { verdacht: boolean; grund: string } {
  if (r.action === "ignore") return { verdacht: false, grund: "ignoriert (keine Kosten)" };
  if (r.vatIncluded) return { verdacht: false, grund: "inkl. USt" };
  const h = [r.pattern, r.label, ...gegenparteien].filter(Boolean).join(" | ").toLowerCase();
  const deutsch = h.match(USt_DEUTSCH);
  if (deutsch) return { verdacht: true, grund: `ohne USt, aber vermutlich deutscher Dienstleister („${deutsch[0]}“)` };
  if (USt_KLEIN.test(h)) return { verdacht: false, grund: "Kleinunternehmer (ohne USt richtig)" };
  if (USt_FREI.test(h)) return { verdacht: false, grund: "umsatzsteuerfrei (Versicherung, Bank, Steuern)" };
  if (USt_AUSLAND.test(h)) return { verdacht: false, grund: "Ausland/Reverse Charge (ohne USt richtig)" };
  const rf = h.match(RECHTSFORM_DE);
  if (rf) return { verdacht: true, grund: `ohne USt, aber deutsche Rechtsform („${rf[0]}“)` };
  return { verdacht: false, grund: "unklar, bitte bei Gelegenheit prüfen" };
}
