import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";

export type RangeKey =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "max"
  | "custom";

export type DateRange = { from: Date; to: Date };

export const RANGE_LABELS: Record<Exclude<RangeKey, "custom">, string> = {
  today: "Heute",
  yesterday: "Gestern",
  last7: "Letzte 7 Tage",
  last30: "Letzte 30 Tage",
  thisWeek: "Diese Woche",
  lastWeek: "Letzte Woche",
  thisMonth: "Dieser Monat",
  lastMonth: "Letzter Monat",
  thisYear: "Dieses Jahr",
  max: "Maximum",
};

// Wochenstart auf Montag (DE).
const weekOpts = { weekStartsOn: 1 as const };

export function resolveRange(key: RangeKey, now: Date = new Date()): DateRange {
  switch (key) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "last7":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "last30":
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case "thisWeek":
      return {
        from: startOfWeek(now, weekOpts),
        to: endOfWeek(now, weekOpts),
      };
    case "lastWeek": {
      const lw = subWeeks(now, 1);
      return {
        from: startOfWeek(lw, weekOpts),
        to: endOfWeek(lw, weekOpts),
      };
    }
    case "thisMonth":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "lastMonth": {
      const lm = subMonths(now, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    }
    case "thisYear":
      return { from: startOfYear(now), to: endOfYear(now) };
    case "max":
      // Beliebig weit zurück; deckt jeden realistischen Daten-Eintrag ab.
      return { from: new Date("2020-01-01T00:00:00Z"), to: endOfDay(now) };
    case "custom":
      return { from: startOfMonth(now), to: endOfDay(now) };
  }
}

// Direkt vorangehender Zeitraum gleicher Länge. Wird für Δ-Vergleiche
// im Dashboard verwendet.
export function previousRange(range: DateRange): DateRange {
  const durationMs = range.to.getTime() - range.from.getTime() + 1;
  return {
    from: new Date(range.from.getTime() - durationMs),
    to: new Date(range.from.getTime() - 1),
  };
}

export function parseRangeFromSearchParams(params: {
  range?: string;
  from?: string;
  to?: string;
}): { key: RangeKey; range: DateRange } {
  const validKeys: RangeKey[] = [
    "today",
    "yesterday",
    "last7",
    "last30",
    "thisWeek",
    "lastWeek",
    "thisMonth",
    "lastMonth",
    "thisYear",
    "max",
    "custom",
  ];

  if (params.range === "custom" && params.from && params.to) {
    const from = new Date(params.from);
    const to = new Date(params.to);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      return {
        key: "custom",
        range: { from: startOfDay(from), to: endOfDay(to) },
      };
    }
  }

  const key = (validKeys.includes(params.range as RangeKey)
    ? (params.range as RangeKey)
    : "last30") as RangeKey;

  return { key, range: resolveRange(key) };
}
