import { tz } from "@date-fns/tz";
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

// Alle Dashboard-Filter rechnen in Berlin-Zeit. Der Server läuft auf
// Railway in UTC — würden wir startOfDay(now) ohne TZ-Context aufrufen,
// hieße "Heute" für einen Lead, der um 00:29 Berliner Zeit angelegt
// wurde (= 22:29 UTC am Vortag), plötzlich "Gestern". `tz("Europe/Berlin")`
// liefert einen Kontext, den die date-fns-v4-Funktionen respektieren.
const BERLIN = tz("Europe/Berlin");

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

// Wochenstart auf Montag (DE) + Berlin-Zeitzone.
const weekOpts = { weekStartsOn: 1 as const, in: BERLIN };
const tzOpts = { in: BERLIN };

export function resolveRange(key: RangeKey, now: Date = new Date()): DateRange {
  switch (key) {
    case "today":
      return { from: startOfDay(now, tzOpts), to: endOfDay(now, tzOpts) };
    case "yesterday": {
      const y = subDays(now, 1, tzOpts);
      return { from: startOfDay(y, tzOpts), to: endOfDay(y, tzOpts) };
    }
    case "last7":
      return {
        from: startOfDay(subDays(now, 6, tzOpts), tzOpts),
        to: endOfDay(now, tzOpts),
      };
    case "last30":
      return {
        from: startOfDay(subDays(now, 29, tzOpts), tzOpts),
        to: endOfDay(now, tzOpts),
      };
    case "thisWeek":
      return {
        from: startOfWeek(now, weekOpts),
        to: endOfWeek(now, weekOpts),
      };
    case "lastWeek": {
      const lw = subWeeks(now, 1, tzOpts);
      return {
        from: startOfWeek(lw, weekOpts),
        to: endOfWeek(lw, weekOpts),
      };
    }
    case "thisMonth":
      return {
        from: startOfMonth(now, tzOpts),
        to: endOfMonth(now, tzOpts),
      };
    case "lastMonth": {
      const lm = subMonths(now, 1, tzOpts);
      return {
        from: startOfMonth(lm, tzOpts),
        to: endOfMonth(lm, tzOpts),
      };
    }
    case "thisYear":
      return { from: startOfYear(now, tzOpts), to: endOfYear(now, tzOpts) };
    case "max":
      // Beliebig weit zurück; deckt jeden realistischen Daten-Eintrag ab.
      return {
        from: new Date("2020-01-01T00:00:00Z"),
        to: endOfDay(now, tzOpts),
      };
    case "custom":
      return {
        from: startOfMonth(now, tzOpts),
        to: endOfDay(now, tzOpts),
      };
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
        range: { from: startOfDay(from, tzOpts), to: endOfDay(to, tzOpts) },
      };
    }
  }

  const key = (validKeys.includes(params.range as RangeKey)
    ? (params.range as RangeKey)
    : "last30") as RangeKey;

  return { key, range: resolveRange(key) };
}
