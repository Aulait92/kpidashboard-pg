// Pay-per-Lead: Filter je Bezug und Lead-Merkmale (rein, ohne Datenbank –
// gut testbar). Regeln wie bisher im Airtable-„Kunden-Produkt-Bezug“.

export type PoolLeadFacts = {
  plz: string | null;
  insurer: string | null;
  contribution: number | null;
  civilServant: boolean;
  smsVerified: boolean;
  score: number | null;
  answers: Record<string, string>;
};

export type SubscriptionRules = {
  plzRanges: string | null;
  acceptWeak: boolean;
  weakThreshold: number | null;
  acceptCivilServants: boolean;
  onlyWeak: boolean;
  scoreFloor: number | null;
  insurerInclude: string[];
  insurerExclude: string[];
  excludeRules: string | null;
};

export const DEFAULT_WEAK_THRESHOLD = 700;

/** „schwach“: Beamte immer, sonst Beitrag unter der Grenze (Standard 700 €). */
export function isWeak(f: Pick<PoolLeadFacts, "contribution" | "civilServant">, threshold: number | null = null): boolean {
  if (f.civilServant) return true;
  const limit = threshold ?? DEFAULT_WEAK_THRESHOLD;
  return f.contribution != null && f.contribution < limit;
}

/** "80000-85999|67300-67499|12345" → passt die PLZ? Leer = keine Einschränkung. */
export function plzMatches(ranges: string | null, plz: string | null): boolean {
  const spec = (ranges ?? "").trim();
  if (!spec) return true;
  const n = Number((plz ?? "").replace(/\D/g, "").slice(0, 5));
  if (!plz || !Number.isFinite(n) || (plz.replace(/\D/g, "").length < 5)) return false;
  return spec.split(/[|,;\s]+/).some((part) => {
    const [a, b] = part.split("-").map((x) => Number(x.trim()));
    if (!Number.isFinite(a)) return false;
    return b != null && Number.isFinite(b) ? n >= a && n <= b : n === a;
  });
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

function insurerHit(list: string[], insurer: string | null): boolean {
  if (!insurer) return false;
  const i = norm(insurer);
  return list.some((x) => {
    const n = norm(x);
    return n.length >= 3 && (i.includes(n) || n.includes(i));
  });
}

/** "feld=Wert1,Wert2|feld2=…" → Lead ausgeschlossen, wenn ein Feldwert passt. */
export function excludedByRules(rules: string | null, answers: Record<string, string>): string | null {
  if (!rules?.trim()) return null;
  const byKey = new Map(Object.entries(answers).map(([k, v]) => [norm(k), norm(v)]));
  for (const rule of rules.split("|")) {
    const [field, values] = rule.split("=");
    if (!field || !values) continue;
    const actual = byKey.get(norm(field));
    if (!actual) continue;
    if (values.split(",").some((v) => norm(v) && actual === norm(v))) return `Regel ${field.trim()}`;
  }
  return null;
}

/** null = Bezug nimmt den Lead; sonst Grund, warum nicht. */
export function rejectReason(r: SubscriptionRules, f: PoolLeadFacts): string | null {
  if (!plzMatches(r.plzRanges, f.plz)) return "PLZ";
  const weak = isWeak(f, r.weakThreshold);
  if (r.onlyWeak && !weak) return "nur schwache";
  if (!r.acceptWeak && weak) return "schwach";
  if (!r.acceptCivilServants && f.civilServant) return "Beamter";
  if (r.scoreFloor != null && (f.score ?? 0) < r.scoreFloor) return "Score";
  if (r.insurerInclude.length && !insurerHit(r.insurerInclude, f.insurer)) return "Gesellschaft nicht eingeschlossen";
  if (r.insurerExclude.length && insurerHit(r.insurerExclude, f.insurer)) return "Gesellschaft ausgeschlossen";
  return excludedByRules(r.excludeRules, f.answers);
}

// ─── Verteilung ────────────────────────────────────────────────────────────

export type Candidate = {
  id: string;
  /** Kontingent im laufenden Zeitraum (Bestellung oder Ziel) */
  quota: number;
  delivered: number;
  test?: { quantity: number; delivered: number; days: number | null; startedDaysAgo: number } | null;
};

/**
 * d'Hondt: der Bezug mit dem höchsten Quotienten Kontingent / (geliefert + 1)
 * bekommt den Lead. Test-Bezüge haben Vorrang, solange ihre Probemenge (über
 * testDays gleichmäßig verteilt) nicht erreicht ist. Volle Kontingente fallen raus.
 */
export function pickCandidate(cands: Candidate[]): Candidate | null {
  const open = cands.filter((c) => c.quota > c.delivered);
  if (!open.length) return null;
  const testDue = open.filter((c) => {
    if (!c.test || c.test.delivered >= c.test.quantity) return false;
    if (!c.test.days) return true;
    const due = Math.ceil((c.test.quantity * Math.min(c.test.days, c.test.startedDaysAgo + 1)) / c.test.days);
    return c.test.delivered < due;
  });
  const pool = testDue.length ? testDue : open;
  return pool.reduce((best, c) => (c.quota / (c.delivered + 1) > best.quota / (best.delivered + 1) ? c : best));
}

// ─── Gebiete (Vorrang) ─────────────────────────────────────────────────────

export type AreaQuota = { id: string; plzRanges: string; quantity: number; delivered: number };

/** Gebiete eines Bezugs, in die die PLZ fällt und die noch Menge frei haben (meiste freie Menge zuerst). */
export function openAreasFor(areas: AreaQuota[], plz: string | null): AreaQuota[] {
  return areas
    .filter((a) => a.quantity > a.delivered && (a.plzRanges ?? "").trim() && plzMatches(a.plzRanges, plz))
    .sort((a, b) => b.quantity / (b.delivered + 1) - a.quantity / (a.delivered + 1));
}

/** PLZ-Filter eines Bezugs: eigener Filter, sonst die Gebiete zusammen (leer = keine Einschränkung). */
export function effectivePlzRanges(subRanges: string | null, areas: Pick<AreaQuota, "plzRanges">[]): string | null {
  if (subRanges?.trim()) return subRanges;
  const joined = areas.map((a) => a.plzRanges.trim()).filter(Boolean).join("|");
  return joined || null;
}

export type AreaCandidate = Candidate & { area: AreaQuota | null };

/**
 * Verteilung mit Gebietsvorrang: Bezüge, deren Gebiet die PLZ enthält und noch
 * Menge frei hat (bis 100 % der Gebietsmenge), bekommen den Lead vor allen
 * anderen (d'Hondt innerhalb der Gebiete). Sonst normale Verteilung.
 */
export function pickWithAreas<T extends AreaCandidate>(cands: T[]): T | null {
  const prio = cands.filter((c) => c.area && c.quota > c.delivered);
  if (prio.length) {
    return prio.reduce((best, c) => (c.area!.quantity / (c.area!.delivered + 1) > best.area!.quantity / (best.area!.delivered + 1) ? c : best));
  }
  return pickCandidate(cands) as T | null;
}
