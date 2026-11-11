// Sicht der Zahlen-Seite: „Kerngeschäft“ (Software + Betreuung, mit Einrichtung)
// oder „Gesamt“ (inkl. Pay-per-Lead-Pilot). Ohne Datenbank, getestet.
import type { LedgerRow } from "@/lib/revenue-ledger";

const MONTH_LONG = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const longLabel = (key: string, withYear: boolean) => `${MONTH_LONG[Number(key.slice(5, 7)) - 1]}${withYear ? ` ${key.slice(0, 4)}` : ""}`;

export type Sicht = "kern" | "gesamt";
export const SICHT_LABEL: Record<Sicht, string> = { kern: "Kerngeschäft (Software + Betreuung)", gesamt: "Gesamt" };

export function parseSicht(v: string | null | undefined): Sicht {
  return v === "kern" ? "kern" : "gesamt";
}

/** Umsatzbuch für die Sicht: Kerngeschäft ohne den Strom Pay-per-Lead. */
export function rowsForSicht<T extends Pick<LedgerRow, "stream">>(rows: T[], sicht: Sicht): T[] {
  return sicht === "kern" ? rows.filter((r) => r.stream !== "ppl") : rows;
}

/**
 * Kosten je Monat für die Sicht: Kerngeschäft ohne direkte Pay-per-Lead-Kosten
 * (Meta-Werbung für Kunden-Leads, Bank/Karte und laufende Kosten mit Zweck
 * „Pay-per-Lead“), damit die Marge nicht verzerrt wird.
 */
export function costsForSicht<T extends { ppl: number; metaPpl: number }>(costs: T[], sicht: Sicht): T[] {
  return sicht === "kern" ? costs.map((c) => ({ ...c, ppl: 0, metaPpl: 0 })) : costs;
}

/** „Juni–November 2026“, „Juni 2026–Januar 2027“ oder „seit Juni 2026“ (läuft). */
export function pilotLabel(from: string, to: string | null): string {
  if (!to || to < from) return `seit ${longLabel(from, true)}`;
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${longLabel(from, !sameYear)}–${longLabel(to, true)}`;
}

/** Ist der Pilot abgeschlossen (Ende gesetzt und vor dem laufenden Monat)? */
export function pilotEnded(to: string | null, currentMonth: string): boolean {
  return !!to && to < currentMonth;
}
