// Monatsberichte: reine Logik (Einstufung, Prüfung, Formatierung) – ohne DB, im Browser
// und auf dem Server nutzbar. Die Einstufung ist intern und wird Kunden nie gezeigt.

export type Rating = "gut" | "mittel" | "schwach";
export type DataQuality = "ok" | "unsicher";

export type MonthMetrics = {
  leads: number;
  spend: number;
  /** Leadpreis € (null ohne Leads) */
  cpl: number | null;
  termine: number;
  abschluesse: number;
  /** geschätzte Provision € (null ohne Provisionssätze/Abschlüsse) */
  provision: number | null;
  /** Anteil Leads mit eingetragenem Ergebnis (0–1, null ohne relevante Leads) */
  ergebnisQuote: number | null;
  /** Tage mit Werbeausgaben */
  activeDays: number;
};

export type ReportMetrics = {
  month: string; // YYYY-MM
  current: MonthMetrics;
  previous: MonthMetrics | null;
  /** erwartete Leads laut Ziel-Leadpreis */
  expectedLeads: number | null;
  targetCpl: number | null;
  /** Was wir getan haben (Kampagnen-Läufe, Budgetänderungen) */
  actions: string[];
};

export type ReportThresholds = {
  goodLeadsPct: number;
  weakLeadsPct: number;
  weakCplPct: number;
  weakNoMeetingLeads: number;
  minResultPct: number;
  minActiveDays: number;
};

export const DEFAULT_THRESHOLDS: ReportThresholds = {
  goodLeadsPct: 85,
  weakLeadsPct: 60,
  weakCplPct: 150,
  weakNoMeetingLeads: 15,
  minResultPct: 50,
  minActiveDays: 14,
};

export type Classification = { rating: Rating; dataQuality: DataQuality; reasons: string[] };

const pct = (a: number, b: number) => Math.round((a / b) * 100);

/** Einstufung gut / mittel / schwach plus Datenqualität (nur intern). */
export function classify(m: ReportMetrics, t: ReportThresholds = DEFAULT_THRESHOLDS): Classification {
  const c = m.current;
  const reasons: string[] = [];
  const leadsPct = m.expectedLeads && m.expectedLeads > 0 ? pct(c.leads, m.expectedLeads) : null;
  const cplPct = c.cpl != null && m.targetCpl ? pct(c.cpl, m.targetCpl) : null;

  const weak: string[] = [];
  if (leadsPct != null && leadsPct < t.weakLeadsPct) weak.push(`Leads ${leadsPct} % der Erwartung (unter ${t.weakLeadsPct} %)`);
  if (cplPct != null && cplPct > t.weakCplPct) weak.push(`Leadpreis ${cplPct} % des Ziels (über ${t.weakCplPct} %)`);
  if (c.leads >= t.weakNoMeetingLeads && c.termine === 0) weak.push(`0 Termine bei ${c.leads} Leads`);

  const warn: string[] = [];
  if (leadsPct == null) warn.push("keine Erwartung berechenbar (kein Budget/Ziel-Leadpreis)");
  else if (leadsPct < t.goodLeadsPct) warn.push(`Leads ${leadsPct} % der Erwartung (unter ${t.goodLeadsPct} %)`);
  if (cplPct != null && cplPct > 120) warn.push(`Leadpreis ${cplPct} % des Ziels`);
  if (c.leads >= 5 && c.termine === 0) warn.push("Leads, aber noch keine Termine");

  let rating: Rating;
  if (weak.length) {
    rating = "schwach";
    reasons.push(...weak);
  } else if (warn.length) {
    rating = "mittel";
    reasons.push(...warn);
  } else {
    rating = "gut";
    reasons.push(leadsPct != null ? `Leads ${leadsPct} % der Erwartung` : "im Rahmen");
  }
  const dataQuality: DataQuality = c.ergebnisQuote != null && c.ergebnisQuote * 100 < t.minResultPct ? "unsicher" : "ok";
  if (dataQuality === "unsicher") reasons.push(`nur ${Math.round((c.ergebnisQuote ?? 0) * 100)} % der Leads mit Ergebnis – Abschlusszahlen unsicher`);
  return { rating, dataQuality, reasons };
}

/** Bekommt der Kunde überhaupt einen Bericht? (pausiert/neu: zu wenige aktive Tage) */
export function eligible(m: ReportMetrics, t: ReportThresholds = DEFAULT_THRESHOLDS): boolean {
  return m.current.activeDays >= t.minActiveDays;
}

// ─── Kennzahlen für Text und Kacheln ─────────────────────────────────────

export type Fact = { key: string; label: string; value: number; unit: "" | "€"; previous: number | null };

/**
 * Welche Kennzahlen zeigen wir? Bei „gut“ alles Vorhandene. Bei mittel/schwach nur, was nicht
 * entmutigt: Leads und Termine; Leadpreis nur, wenn er nicht der Grund der Schwäche ist.
 * Abschlüsse/Provision nur bei verlässlicher Datenlage.
 */
export function visibleFacts(m: ReportMetrics, c: Classification): Fact[] {
  const cur = m.current;
  const prev = m.previous;
  const out: Fact[] = [];
  out.push({ key: "leads", label: "Leads", value: cur.leads, unit: "", previous: prev?.leads ?? null });
  out.push({ key: "termine", label: "Termine", value: cur.termine, unit: "", previous: prev?.termine ?? null });
  const cplWeak = c.reasons.some((r) => r.startsWith("Leadpreis"));
  if (cur.cpl != null && (c.rating === "gut" || !cplWeak)) {
    out.push({ key: "cpl", label: "Leadpreis", value: round2(cur.cpl), unit: "€", previous: prev?.cpl != null ? round2(prev.cpl) : null });
  }
  if (c.dataQuality === "ok" && cur.abschluesse > 0) {
    out.push({ key: "abschluesse", label: "Abschlüsse", value: cur.abschluesse, unit: "", previous: prev?.abschluesse ?? null });
    if (cur.provision != null && cur.provision > 0) {
      out.push({ key: "provision", label: "Provision (geschätzt)", value: Math.round(cur.provision), unit: "€", previous: prev?.provision != null ? Math.round(prev.provision) : null });
    }
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const MONTHS_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
export const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_DE[m - 1]} ${y}`;
};

export const fmtValue = (f: Pick<Fact, "value" | "unit">) =>
  f.unit === "€" ? f.value.toLocaleString("de-DE", { minimumFractionDigits: Number.isInteger(f.value) ? 0 : 2, maximumFractionDigits: 2 }) + " €" : f.value.toLocaleString("de-DE");

// ─── Prüfung (deterministisch) ───────────────────────────────────────────

/** Zahlen, die im Text vorkommen dürfen: Kennzahlen (auch Vormonat, Differenzen), Monat/Jahr, wenige feste Werte. */
export function allowedNumbers(m: ReportMetrics, facts: Fact[]): Set<string> {
  const out = new Set<string>();
  const add = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n)) return;
    for (const v of [n, Math.round(n), Math.round(n * 10) / 10, Math.round(n * 100) / 100, Math.abs(n)]) out.add(norm(v));
  };
  for (const f of facts) {
    add(f.value);
    add(f.previous);
    if (f.previous != null) {
      add(f.value - f.previous);
      if (f.previous !== 0) add(((f.value - f.previous) / f.previous) * 100);
    }
  }
  const [y, mo] = m.month.split("-").map(Number);
  add(y);
  add(mo);
  // feste Werte in Tipps/Abschluss („innerhalb von 5 Minuten“, „15 Minuten“, „24 Stunden“)
  for (const n of [1, 2, 3, 5, 10, 15, 24, 30]) add(n);
  return out;
}

const norm = (n: number) => String(Math.round(n * 100) / 100);

/** Zahl aus deutschem Text lesen („1.234,50“ → 1234.5, „6,20“ → 6.2). */
export function parseGermanNumber(s: string): number {
  const t = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  return Number(t);
}

const PROMISES = /garantier|versprech|\bsicher(?:e|en)?\s+(?:mehr|ab)|verdoppel|ohne risiko|risikolos/i;

export type CheckResult = { ok: boolean; issues: string[] };

/** Keine erfundenen Zahlen, kein Wort „Garantie“, keine Versprechen. */
export function checkText(text: string, allowed: Set<string>): CheckResult {
  const issues: string[] = [];
  if (/garantie/i.test(text)) issues.push("Das Wort „Garantie“ darf nicht vorkommen.");
  if (PROMISES.test(text)) issues.push("Text enthält ein Versprechen bzw. eine Zusicherung.");
  const nums = text.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g) ?? [];
  const bad = [...new Set(nums.filter((s) => !allowed.has(norm(parseGermanNumber(s)))))];
  if (bad.length) issues.push(`Zahlen ohne Grundlage in den Daten: ${bad.slice(0, 6).join(", ")}`);
  return { ok: issues.length === 0, issues };
}

/** Zielmonat (Vormonat) zu einem Zeitpunkt, deutsche Zeit. */
export function previousMonthKey(now: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).formatToParts(now);
  let y = Number(p.find((x) => x.type === "year")!.value);
  let m = Number(p.find((x) => x.type === "month")!.value) - 1;
  if (m === 0) {
    m = 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Monatsgrenzen in deutscher Zeit als UTC-Zeitpunkte [from, to). */
export function monthBounds(month: string): { from: Date; to: Date } {
  const [y, m] = month.split("-").map(Number);
  const berlin = (yy: number, mm: number) => {
    const guess = new Date(Date.UTC(yy, mm - 1, 1, 0, 0, 0));
    const off = tzOffsetMinutes(guess);
    return new Date(guess.getTime() - off * 60000);
  };
  const next = m === 12 ? [y + 1, 1] : [y, m + 1];
  return { from: berlin(y, m), to: berlin(next[0], next[1]) };
}

function tzOffsetMinutes(d: Date): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return Math.round((asUtc - d.getTime()) / 60000);
}

export const RATING_LABEL: Record<Rating, string> = { gut: "gut", mittel: "mittel", schwach: "schwach" };
export const STATUS_LABEL: Record<string, string> = { draft: "Entwurf", sent: "gesendet", skipped: "ausgesetzt", call: "Anruf statt Bericht" };
