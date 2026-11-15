// Kennzahlen zu Kündigung, Ruhephase und Reaktivierung (Ole, 15.11.2026): rein, ohne Datenbank, getestet.
// Quelle: CustomerLifecycleEvent (lib/ruhend.ts) und das Umsatzbuch (lib/revenue-ledger.ts).
//
// - Neue Kunden: erster Monat mit wiederkehrendem Umsatz (Umsatzbuch). Reaktivierte zählen dort nicht noch einmal.
// - Reaktivierungen: Ereignis „reactivated“ im Monat (Anzahl, Monatsbetrag zum Zeitpunkt der Reaktivierung).
// - Kündigungen (wirksam): Kunden mit Umsatz im Vormonat und keinem im Monat (Umsatzbuch).
// - Netto-Kundenwachstum = neu + Reaktivierungen − Kündigungen.
// - Reaktivierungsquote je Kündigungsmonat: Kündigungen (Ereignis „cancelled“), die später reaktiviert wurden ÷ alle.
// - Ruhedauer: von „dormant“ bis „reactivated“ bzw. „deleted“, offene Ruhephasen bis heute.

import { churnedCustomers, monthKey, newCustomers, type LedgerRow } from "@/lib/revenue-ledger";

export type LcKind = "cancelled" | "dormant" | "reactivated" | "deleted";
export type LcEvent = { customerId: string; kind: LcKind | string; at: Date; mrr: number | null; churnReason: string | null };

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const byTime = (a: LcEvent, b: LcEvent) => a.at.getTime() - b.at.getTime();

function perCustomer(events: LcEvent[]): Map<string, LcEvent[]> {
  const out = new Map<string, LcEvent[]>();
  for (const e of [...events].sort(byTime)) out.set(e.customerId, [...(out.get(e.customerId) ?? []), e]);
  return out;
}

/** Ruhezeiten je Kunde (von „dormant“ bis zum Tag vor „reactivated“; ohne Reaktivierung offen) für das Umsatzbuch. */
export function dormantGaps(events: LcEvent[]): Map<string, { from: Date; to: Date | null }[]> {
  const out = new Map<string, { from: Date; to: Date | null }[]>();
  for (const [id, list] of perCustomer(events)) {
    const gaps: { from: Date; to: Date | null }[] = [];
    list.forEach((e, i) => {
      if (e.kind !== "dormant") return;
      const back = list.slice(i + 1).find((x) => x.kind === "reactivated");
      gaps.push({ from: e.at, to: back ? new Date(back.at.getTime() - DAY) : null });
    });
    if (gaps.length) out.set(id, gaps);
  }
  return out;
}

export type LcMonth = {
  month: string;
  neu: number;
  reaktiviert: number;
  reaktiviertMrr: number;
  gekuendigt: number;
  /** Eingegangene Kündigungen (Ereignis „cancelled“), wirksam meist später */
  kuendigungenEingang: number;
  netto: number;
};

export function lifecycleMonths(events: LcEvent[], rows: LedgerRow[], months: string[]): LcMonth[] {
  return months.map((m) => {
    const re = events.filter((e) => e.kind === "reactivated" && monthKey(e.at) === m);
    const neu = newCustomers(rows, m);
    const gekuendigt = churnedCustomers(rows, m);
    return {
      month: m,
      neu,
      reaktiviert: re.length,
      reaktiviertMrr: r2(re.reduce((s, e) => s + (e.mrr ?? 0), 0)),
      gekuendigt,
      kuendigungenEingang: events.filter((e) => e.kind === "cancelled" && monthKey(e.at) === m).length,
      netto: neu + re.length - gekuendigt,
    };
  });
}

/** Zu jeder Kündigung: wurde der Kunde danach (vor einer weiteren Kündigung) reaktiviert, und wann? */
function cancellationOutcomes(events: LcEvent[]): { cancel: LcEvent; dormantAt: Date | null; reactivatedAt: Date | null }[] {
  const out: { cancel: LcEvent; dormantAt: Date | null; reactivatedAt: Date | null }[] = [];
  for (const list of perCustomer(events).values()) {
    list.forEach((e, i) => {
      if (e.kind !== "cancelled") return;
      const rest = list.slice(i + 1);
      const nextCancel = rest.findIndex((x) => x.kind === "cancelled");
      const window = nextCancel >= 0 ? rest.slice(0, nextCancel) : rest;
      out.push({ cancel: e, dormantAt: window.find((x) => x.kind === "dormant")?.at ?? null, reactivatedAt: window.find((x) => x.kind === "reactivated")?.at ?? null });
    });
  }
  return out;
}

export type ReactivationRateRow = { month: string; cancelled: number; reactivated: number; rate: number | null };

/** Reaktivierungsquote je Kündigungsmonat (Monat des Eingangs der Kündigung). */
export function reactivationByCancelMonth(events: LcEvent[]): ReactivationRateRow[] {
  const rows = new Map<string, ReactivationRateRow>();
  for (const o of cancellationOutcomes(events)) {
    const m = monthKey(o.cancel.at);
    const r = rows.get(m) ?? { month: m, cancelled: 0, reactivated: 0, rate: null };
    r.cancelled++;
    if (o.reactivatedAt) r.reactivated++;
    rows.set(m, r);
  }
  return [...rows.values()].map((r) => ({ ...r, rate: r.cancelled ? r.reactivated / r.cancelled : null })).sort((a, b) => a.month.localeCompare(b.month));
}

export type ReasonRow = { reason: string | null; cancelled: number; reactivated: number; rate: number | null };

/** Welche Kündigungsgründe kommen zurück? (Hauptgrund aus dem Anti-Churn-Schritt) */
export function reasonsComeback(events: LcEvent[]): ReasonRow[] {
  const rows = new Map<string, ReasonRow>();
  for (const o of cancellationOutcomes(events)) {
    const key = o.cancel.churnReason ?? "";
    const r = rows.get(key) ?? { reason: o.cancel.churnReason, cancelled: 0, reactivated: 0, rate: null };
    r.cancelled++;
    if (o.reactivatedAt) r.reactivated++;
    rows.set(key, r);
  }
  return [...rows.values()].map((r) => ({ ...r, rate: r.cancelled ? r.reactivated / r.cancelled : null })).sort((a, b) => b.cancelled - a.cancelled || b.reactivated - a.reactivated);
}

export type DormancyStats = {
  /** Ruhende Konten heute */
  dormantNow: number;
  /** Ø Ruhedauer in Tagen (abgeschlossene und laufende Ruhephasen bis heute) */
  avgDormantDays: number | null;
  /** Reaktivierungen insgesamt und Ø/Median Tage vom Vertragsende (Beginn der Ruhephase) bis zur Reaktivierung */
  reactivations: number;
  avgDaysToReactivation: number | null;
  medianDaysToReactivation: number | null;
  /** Reaktivierte ÷ Gekündigte insgesamt */
  rate: number | null;
  cancelled: number;
};

export function dormancyStats(events: LcEvent[], now: Date): DormancyStats {
  const durations: number[] = [];
  let dormantNow = 0;
  for (const list of perCustomer(events).values()) {
    list.forEach((e, i) => {
      if (e.kind !== "dormant") return;
      const end = list.slice(i + 1).find((x) => x.kind === "reactivated" || x.kind === "deleted");
      if (!end) dormantNow++;
      durations.push(((end?.at ?? now).getTime() - e.at.getTime()) / DAY);
    });
  }
  const outcomes = cancellationOutcomes(events);
  const toRe = outcomes.filter((o) => o.reactivatedAt).map((o) => (o.reactivatedAt!.getTime() - (o.dormantAt ?? o.cancel.at).getTime()) / DAY);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const sorted = [...toRe].sort((a, b) => a - b);
  const median = sorted.length ? Math.round(sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
  return {
    dormantNow,
    avgDormantDays: avg(durations),
    reactivations: events.filter((e) => e.kind === "reactivated").length,
    avgDaysToReactivation: avg(toRe),
    medianDaysToReactivation: median,
    rate: outcomes.length ? outcomes.filter((o) => o.reactivatedAt).length / outcomes.length : null,
    cancelled: outcomes.length,
  };
}
