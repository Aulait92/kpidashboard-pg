// Umsatzbuch für die Zahlen-Seite (Investoren-Kennzahlen).
// Eine Zeile je Monat × Kunde × Strom; alle Kennzahlen rechnen nur daraus.
//
// Annahmen (Stand 11.11.2026):
// - Pay-per-Lead („ppl“): nicht stornierte Revenue-Zeilen (eine je verkauftem
//   Lead; entstehen im Airtable-Abgleich, beim Lead-Eingang mit Lead-Preis und in
//   der Pay-per-Lead-Engine). Bezahlte LeadOrder werden NICHT zusätzlich
//   gezählt – das wäre derselbe Umsatz doppelt (Bestellung = Vorauszahlung der
//   Leads, deren Revenue-Zeilen bei Lieferung entstehen).
// - Retainer (Customer.retainerMonthly ab retainerStart) = vertraglicher
//   Monatsumsatz, tagesanteilig wie im Kunden-Dashboard. Hat der Kunde ein
//   angenommenes Angebot mit Software-Anteil (Offer.softwareFee), zählt dieser
//   Anteil als „software“, der Rest als „service“ (Betreuung). Ohne Angebot
//   (Alt-Kunden aus Airtable) ist alles „service“.
// - Startpreis-Phase aus dem Angebot (introMonthlyFee für introMonths) wird
//   berücksichtigt. Pausen (CustomerPause kind „customer“, angewendet) zählen
//   nur den Software-Anteil (wie in der Abrechnung).
// - Ende eines Retainers: gekündigtes Stripe-Abo (subscriptionStatus
//   „canceled“) → Monatsende der letzten Änderung; archivierter Kunde ohne
//   Abo → Monat seines letzten Leads (bessere Information gibt es nicht).
// - Einrichtung („setup“): setupFee angenommener Angebote im Monat der
//   Zahlung (sonst Annahme) – einmalig, nie im MRR.
// - WhatsApp-Gebühren sind seit 11.11.2026 im Preis enthalten: KEIN Umsatz,
//   sondern direkte Software-Kosten (zahlen.ts). Vorher: durchlaufend.
// - Weitere Logins (seatsBilled × seatMonthly) und das Bestandskunden-Modul
//   zählen als „software“ (Stand des Kunden heute, nicht historisch).
// - Jährlich im Voraus (billingInterval „year“): MRR = Jahresbetrag / 12, also
//   Monatspreis × (12 − Freimonate) / 12 – keine Spitze im Zahlungsmonat;
//   Pausen ohne Gutschrift, daher nicht abgezogen.
// - Laufender Monat: Pay-per-Lead hochgerechnet (bisher × Tage im Monat /
//   vergangene Tage), Retainer voller Vertragsbetrag; Monat ist als
//   „hochgerechnet“ markiert. MRR-Brücke, Kündigungen, Kohorten und Bindung
//   rechnen nur mit abgeschlossenen Monaten.
// - Monate nach Europe/Berlin.

export type Stream = "ppl" | "service" | "software" | "setup";
export const RECURRING_STREAMS = ["ppl", "service", "software"] as const;
export type RecurringStream = (typeof RECURRING_STREAMS)[number];

export type LedgerRow = { month: string; customerId: string; stream: Stream; amount: number; recurring: boolean };
export type MonthInfo = { key: string; label: string; projected: boolean };

const TZ = "Europe/Berlin";
const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── Monate ──────────────────────────────────────────────────────────────

/** „YYYY-MM“ eines Zeitpunkts in Berliner Zeit. */
export function monthKey(d: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}`;
}

/** Berliner Kalendertag „YYYY-MM-DD“. */
export function dayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const MONTH_LABEL = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
export function monthLabel(key: string, withYear = false): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_LABEL[m - 1]}${withYear ? ` ${y}` : ""}`;
}

/** Monate von `from` bis `to` (inklusive). */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addMonths(k, 1)) out.push(k);
  return out;
}

/** Faktor für die Hochrechnung des laufenden Monats (≥ 1). */
export function projectionFactor(now: Date): number {
  const key = monthKey(now);
  const day = Number(dayKey(now).slice(8, 10));
  return daysInMonth(key) / Math.max(1, day);
}

// ─── Retainer tagesgenau ─────────────────────────────────────────────────

export type RetainerInput = {
  customerId: string;
  monthly: number;
  start: Date | null;
  /** Letzter Tag mit Umsatz (inklusive) oder null = läuft. */
  end: Date | null;
  /** Software-Anteil je Monat (aus dem Angebot), 0 = alles Betreuung. */
  softwareShare: number;
  intro?: { amount: number; months: number } | null;
  /** Angewendete Kunden-Pausen (Tage inklusive). */
  pauses: { from: Date; to: Date | null }[];
  /** Monatliche Zusätze (weitere Logins, Module) – zählen als Software. */
  extras?: number;
  /** Faktor bei jährlicher Vorauszahlung (z. B. 10/12); Standard 1. */
  annualFactor?: number;
};

function dayStart(key: string): number {
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
}

/**
 * Retainer-Umsatz je Monat (software/service), tagesanteilig.
 * Der laufende Monat (currentMonth) zählt voll bis Monatsende (Vertrag).
 */
export function retainerRows(r: RetainerInput, months: string[], currentMonth: string): LedgerRow[] {
  if (!(r.monthly > 0)) return [];
  const startDay = r.start ? dayStart(dayKey(r.start)) : null;
  const endDay = r.end ? dayStart(dayKey(r.end)) : null;
  const pauses = r.pauses.map((p) => ({ from: dayStart(dayKey(p.from)), to: p.to ? dayStart(dayKey(p.to)) : Infinity }));
  const introEnd = r.intro && startDay != null ? dayStart(dayKey(new Date(addMonthsDate(startDay, r.intro.months)))) : null;
  const out: LedgerRow[] = [];
  for (const m of months) {
    if (m > currentMonth) break;
    const dim = daysInMonth(m);
    const first = Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1);
    let sw = 0;
    let svc = 0;
    for (let i = 0; i < dim; i++) {
      const d = first + i * DAY;
      if (startDay != null && d < startDay) continue;
      if (endDay != null && d > endDay) continue;
      const amount = r.intro && introEnd != null && d < introEnd ? r.intro.amount : r.monthly;
      const swMonth = Math.min(r.softwareShare, amount);
      const paused = pauses.some((p) => d >= p.from && d <= p.to);
      const f = r.annualFactor ?? 1;
      sw += ((swMonth + (r.extras ?? 0)) * f) / dim;
      if (!paused) svc += ((amount - swMonth) * f) / dim;
    }
    if (sw > 0.005) out.push({ month: m, customerId: r.customerId, stream: "software", amount: r2(sw), recurring: true });
    if (svc > 0.005) out.push({ month: m, customerId: r.customerId, stream: "service", amount: r2(svc), recurring: true });
  }
  return out;
}

function addMonthsDate(utcDay: number, n: number): number {
  const d = new Date(utcDay);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate());
}

// ─── Buch zusammensetzen ─────────────────────────────────────────────────

export type LedgerInput = {
  now: Date;
  /** Pay-per-Lead-Umsatz je Kunde und Monat (nicht storniert). */
  ppl: { customerId: string; month: string; amount: number }[];
  retainers: RetainerInput[];
  setups: { customerId: string; month: string; amount: number }[];
  /** Frühester Monat (z. B. Start Pay-per-Lead); sonst ab erstem Datensatz. */
  firstMonth?: string;
};

export type Ledger = { rows: LedgerRow[]; months: MonthInfo[]; current: string; lastComplete: string };

export function buildLedger(input: LedgerInput): Ledger {
  const current = monthKey(input.now);
  const factor = projectionFactor(input.now);
  const dataMonths = [...input.ppl.map((p) => p.month), ...input.setups.map((s) => s.month), ...input.retainers.filter((r) => r.start).map((r) => monthKey(r.start!))];
  const earliest = input.firstMonth ?? (dataMonths.length ? dataMonths.sort()[0] : current);
  const from = earliest > current ? current : earliest;
  const keys = monthRange(from, current);
  const rows: LedgerRow[] = [];
  for (const p of input.ppl) {
    if (p.month < from || p.month > current || !(p.amount > 0)) continue;
    rows.push({ month: p.month, customerId: p.customerId, stream: "ppl", amount: r2(p.month === current ? p.amount * factor : p.amount), recurring: true });
  }
  for (const r of input.retainers) rows.push(...retainerRows(r, keys, current));
  for (const s of input.setups) {
    if (s.month < from || s.month > current || !(s.amount > 0)) continue;
    rows.push({ month: s.month, customerId: s.customerId, stream: "setup", amount: r2(s.amount), recurring: false });
  }
  return {
    rows,
    months: keys.map((k) => ({ key: k, label: monthLabel(k), projected: k === current })),
    current,
    lastComplete: addMonths(current, -1),
  };
}

// ─── Auswertungen ────────────────────────────────────────────────────────

export type MonthTotals = { month: string; ppl: number; service: number; software: number; setup: number; recurring: number };

export function totalsByMonth(rows: LedgerRow[], months: string[]): MonthTotals[] {
  return months.map((m) => {
    const t: MonthTotals = { month: m, ppl: 0, service: 0, software: 0, setup: 0, recurring: 0 };
    for (const r of rows) if (r.month === m) t[r.stream] += r.amount;
    t.recurring = t.ppl + t.service + t.software;
    for (const k of ["ppl", "service", "software", "setup", "recurring"] as const) t[k] = r2(t[k]);
    return t;
  });
}

/** Wiederkehrender Umsatz je Kunde und Monat. */
export function recurringByCustomer(rows: LedgerRow[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!r.recurring) continue;
    const m = out.get(r.customerId) ?? new Map<string, number>();
    m.set(r.month, (m.get(r.month) ?? 0) + r.amount);
    out.set(r.customerId, m);
  }
  return out;
}

const val = (m: Map<string, number> | undefined, k: string) => m?.get(k) ?? 0;

export type Bridge = {
  from: string;
  to: string;
  start: number;
  neu: number;
  ausbau: number;
  verkleinert: number;
  gekuendigt: number;
  end: number;
  counts: { neu: number; ausbau: number; verkleinert: number; gekuendigt: number };
};

/** MRR-Brücke zwischen zwei Monaten je Kunde (Reaktivierte zählen als neu). */
export function mrrBridge(rows: LedgerRow[], from: string, to: string): Bridge {
  const by = recurringByCustomer(rows);
  const b: Bridge = { from, to, start: 0, neu: 0, ausbau: 0, verkleinert: 0, gekuendigt: 0, end: 0, counts: { neu: 0, ausbau: 0, verkleinert: 0, gekuendigt: 0 } };
  for (const m of by.values()) {
    const a = val(m, from);
    const c = val(m, to);
    b.start += a;
    b.end += c;
    if (a <= 0 && c > 0) { b.neu += c; b.counts.neu++; }
    else if (a > 0 && c <= 0) { b.gekuendigt -= a; b.counts.gekuendigt++; }
    else if (c > a) { b.ausbau += c - a; b.counts.ausbau++; }
    else if (c < a) { b.verkleinert -= a - c; b.counts.verkleinert++; }
  }
  for (const k of ["start", "neu", "ausbau", "verkleinert", "gekuendigt", "end"] as const) b[k] = r2(b[k]);
  return b;
}

/** Erster Monat mit wiederkehrendem Umsatz je Kunde. */
export function startMonths(rows: LedgerRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    if (!r.recurring || !(r.amount > 0)) continue;
    const cur = out.get(r.customerId);
    if (!cur || r.month < cur) out.set(r.customerId, r.month);
  }
  return out;
}

export type Cohort = { start: string; customers: number; values: (number | null)[] };

/** Kohorten nach Startmonat: Umsatz je Folgemonat in % des Startmonats. */
export function cohorts(rows: LedgerRow[], months: string[], maxAge = 12): Cohort[] {
  const by = recurringByCustomer(rows);
  const starts = startMonths(rows);
  const out: Cohort[] = [];
  for (const start of months) {
    const members = [...starts.entries()].filter(([, s]) => s === start).map(([id]) => id);
    if (!members.length) continue;
    const base = members.reduce((n, id) => n + val(by.get(id), start), 0);
    const values: (number | null)[] = [];
    for (let k = 0; k < maxAge; k++) {
      const m = addMonths(start, k);
      if (!months.includes(m)) break;
      const sum = members.reduce((n, id) => n + val(by.get(id), m), 0);
      values.push(base > 0 ? Math.round((sum / base) * 100) : null);
    }
    out.push({ start, customers: members.length, values });
  }
  return out;
}

/** Umsatzbindung: Umsatz heute von Kunden, die vor `lag` Monaten aktiv waren, ÷ deren Umsatz damals. */
export function retention(rows: LedgerRow[], month: string, lag: number): { pct: number; customers: number } | null {
  const by = recurringByCustomer(rows);
  const base = addMonths(month, -lag);
  let then = 0;
  let now = 0;
  let customers = 0;
  for (const m of by.values()) {
    const a = val(m, base);
    if (a <= 0) continue;
    customers++;
    then += a;
    now += val(m, month);
  }
  return then > 0 ? { pct: Math.round((now / then) * 100), customers } : null;
}

export function activeCustomers(rows: LedgerRow[], month: string, stream?: RecurringStream): number {
  const ids = new Set<string>();
  for (const r of rows) if (r.recurring && r.month === month && r.amount > 0 && (!stream || r.stream === stream)) ids.add(r.customerId);
  return ids.size;
}

/** Durchschnittliche monatliche Kündigungsquote über abgeschlossene Monate. */
export function churnRate(rows: LedgerRow[], completeMonths: string[]): { rate: number; churned: number; avgActive: number } | null {
  const by = recurringByCustomer(rows);
  let churned = 0;
  let active = 0;
  let pairs = 0;
  for (let i = 1; i < completeMonths.length; i++) {
    const prev = completeMonths[i - 1];
    const cur = completeMonths[i];
    let a = 0;
    for (const m of by.values()) {
      if (val(m, prev) > 0) {
        a++;
        if (val(m, cur) <= 0) churned++;
      }
    }
    active += a;
    pairs++;
  }
  if (!active) return null;
  return { rate: churned / active, churned, avgActive: pairs ? active / pairs : 0 };
}

/** Anteil der größten Kunden am wiederkehrenden Umsatz eines Monats. */
export function concentration(rows: LedgerRow[], month: string, n = 5): { top: { customerId: string; pct: number }[]; topPct: number; largestPct: number; rest: number } | null {
  const by = recurringByCustomer(rows);
  const list = [...by.entries()].map(([id, m]) => ({ id, v: val(m, month) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const total = list.reduce((s, x) => s + x.v, 0);
  if (!total) return null;
  const top = list.slice(0, n).map((x) => ({ customerId: x.id, pct: Math.round((x.v / total) * 1000) / 10 }));
  return { top, topPct: Math.round(top.reduce((s, x) => s + x.pct, 0) * 10) / 10, largestPct: top[0]?.pct ?? 0, rest: Math.max(0, list.length - n) };
}

/** Neue Kunden je Monat (erster Monat mit wiederkehrendem Umsatz). */
export function newCustomers(rows: LedgerRow[], month: string): number {
  let n = 0;
  for (const s of startMonths(rows).values()) if (s === month) n++;
  return n;
}

/** Durchschnittliches Monatswachstum (CAGR) zwischen zwei Monatswerten. */
export function avgMonthlyGrowth(first: number, last: number, months: number): number | null {
  if (!(first > 0) || !(last > 0) || months < 1) return null;
  return Math.pow(last / first, 1 / months) - 1;
}
