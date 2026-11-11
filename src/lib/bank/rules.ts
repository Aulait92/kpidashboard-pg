// Regeln zur Kostenzuordnung (ohne Datenbank, getestet).
// Eine Regel trifft, wenn ihr Muster (ohne Groß-/Kleinschreibung) in Gegenpartei
// oder Verwendungszweck vorkommt. Eigene Regeln (aus „immer so“) gehen den
// Standardregeln vor; längere Muster gehen kürzeren vor.

export const COST_ACTIONS = ["ppl", "software", "akquise", "betrieb", "ignore"] as const;
export type CostAction = (typeof COST_ACTIONS)[number];
export type CostPurposeKey = Exclude<CostAction, "ignore">;

export const ACTION_LABEL: Record<CostAction, string> = {
  ppl: "Direkt: Pay-per-Lead",
  software: "Direkt: Software",
  akquise: "Kundengewinnung",
  betrieb: "Sonstiger Betrieb",
  ignore: "Ignorieren (keine Kosten)",
};

export type Rule = { id?: string | null; pattern: string; action: CostAction; vatIncluded?: boolean; label?: string | null };

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
  { pattern: "anthropic", action: "software" },
  { pattern: "claude.ai", action: "software" },
  { pattern: "openai", action: "software" },
  { pattern: "chatgpt", action: "software" },
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

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ");

/** Passende Regel: eigene vor Standard, längeres Muster vor kürzerem. */
export function matchRule(tx: { counterparty?: string | null; purpose?: string | null }, ownRules: Rule[], defaults: Rule[] = DEFAULT_RULES): Rule | null {
  // Treffer in der Gegenpartei gehen vor Treffern im Verwendungszweck
  // (sonst fängt z. B. eine Privat-Regel „ole kannapinn“ jede Rechnung, in deren Text der Name steht).
  const hitIn = (hay: string, rules: Rule[]) =>
    rules
      .filter((r) => r.pattern.trim() && hay.includes(norm(r.pattern).trim()))
      .sort((a, b) => b.pattern.length - a.pattern.length)[0] ?? null;
  const cp = norm(tx.counterparty);
  const all = `${cp} | ${norm(tx.purpose)}`;
  return (cp ? hitIn(cp, ownRules) : null) ?? (cp ? hitIn(cp, defaults) : null) ?? hitIn(all, ownRules) ?? hitIn(all, defaults);
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
  if (tx.amount >= 0) return { status: "ignoriert", costPurpose: null, vatIncluded: false, rule: null, reason: "Einnahme" };
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
