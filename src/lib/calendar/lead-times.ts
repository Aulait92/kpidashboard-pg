// Feste Lead-Zeiten („Wann dürfen Leads Termine buchen?") und „Zeit blockieren".
//
// Lead-Zeiten gelten je Kalender-Schlüssel (customerId = Agentur-Kalender,
// user:<id> = eigener Kalender eines Beraters). Ohne Einstellung gilt wie
// bisher Mo–Fr 10, 14 und 16 Uhr. Der Assistent schlägt nur diese Zeiten vor;
// blockierte Zeiträume zählen überall als belegt.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { addDaysYmd, berlinYmd, weekdayOfYmd } from "@/lib/absence";
import type { Busy } from "@/lib/calendar/tokens";

const TZ = "Europe/Berlin";

export type LeadTimes = {
  /** Wochentage 0 = So … 6 = Sa. */
  weekdays: number[];
  /** Uhrzeiten "HH:MM" (Berliner Zeit), aufsteigend. */
  times: string[];
  /** Termindauer in Minuten (15/30/45/60); fehlt = Standard 30. */
  durationMin?: number;
  /** Zeiten je Wochentag (wie Calendly). Gesetzt → gilt statt weekdays/times. */
  schedule?: WeekSchedule | null;
};

/** Zeitraum "HH:MM"–"HH:MM" (Ende darf "24:00" sein). */
export type DayRange = [string, string];
/** Zeitfenster je Wochentag (0 = So … 6 = Sa) und Abstand der Startzeiten in Minuten. */
export type WeekSchedule = { step: number; days: Record<number, DayRange[]> };

/** Wählbare Abstände der Startzeiten (Minuten); Vorauswahl 60. */
export const START_STEPS = [15, 30, 45, 60] as const;
export const DEFAULT_STEP = 60;

const toMinutes = (hhmm: string) => (hhmm === "24:00" ? 1440 : Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)));
const fromMinutes = (m: number) => (m >= 1440 ? "24:00" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);

/** Startzeiten in einem Zeitraum: alle `step` Minuten, solange der Termin bis zum Ende passt. */
export function rangeStarts(from: string, to: string, step: number, durationMin: number): string[] {
  const f = toMinutes(from);
  const t = toMinutes(to);
  if (!Number.isFinite(f) || !Number.isFinite(t) || !(step >= 5)) return [];
  const out: string[] = [];
  for (let m = f; m + durationMin <= t && m < 1440 && out.length < 96; m += step) out.push(fromMinutes(m));
  return out;
}

/** Startzeiten eines Wochentags (aufsteigend), mit Zeiten je Tag oder den einheitlichen Zeiten. */
export function timesForDay(lt: LeadTimes, dow: number): string[] {
  if (lt.schedule) {
    const dur = normalizeDuration(lt.durationMin);
    const ranges = lt.schedule.days[dow] ?? [];
    return [...new Set(ranges.flatMap(([f, t]) => rangeStarts(f, t, lt.schedule!.step, dur)))].sort();
  }
  return lt.weekdays.includes(dow) ? lt.times : [];
}

/** Gespeicherte/eingegebene Zeiten je Tag bereinigen; ungültig → null bzw. Fehlertext. */
export function parseSchedule(raw: unknown): { schedule: WeekSchedule } | { error: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { step?: unknown; days?: unknown };
  const step = (START_STEPS as readonly number[]).includes(Number(r.step)) ? Number(r.step) : DEFAULT_STEP;
  const days: Record<number, DayRange[]> = {};
  const src = r.days && typeof r.days === "object" ? (r.days as Record<string, unknown>) : {};
  for (const [k, list] of Object.entries(src)) {
    const dow = Number(k);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6 || !Array.isArray(list)) continue;
    const ranges: DayRange[] = [];
    for (const item of list.slice(0, 6)) {
      if (!Array.isArray(item)) continue;
      const f = normalizeTime(String(item[0] ?? ""));
      const tRaw = String(item[1] ?? "").trim();
      const t = tRaw === "24:00" || tRaw === "00:00" || tRaw === "23:59" ? "24:00" : normalizeTime(tRaw);
      if (!f || !t) return { error: `${WEEKDAY_SHORT[dow]}: Bitte die Uhrzeiten als HH:MM angeben.` };
      if (toMinutes(t) <= toMinutes(f)) return { error: `${WEEKDAY_SHORT[dow]}: „bis“ muss nach „von“ liegen.` };
      ranges.push([f, t]);
    }
    ranges.sort((a, b) => a[0].localeCompare(b[0]));
    if (ranges.length) days[dow] = ranges;
  }
  return { schedule: { step, days } };
}

/** Zeiten je Tag → vollständige Lead-Zeiten (weekdays/times als Zusammenfassung). */
export function leadTimesFromSchedule(schedule: WeekSchedule, durationRaw: unknown): LeadTimes {
  const durationMin = normalizeDuration(durationRaw);
  const base: LeadTimes = { weekdays: [], times: [], durationMin, schedule };
  const weekdays: number[] = [];
  const all = new Set<string>();
  for (let d = 0; d <= 6; d++) {
    const t = timesForDay(base, d);
    if (t.length) weekdays.push(d);
    t.forEach((x) => all.add(x));
  }
  return { ...base, weekdays, times: [...all].sort() };
}

/**
 * Für die Anzeige: einheitliche Zeiten (z. B. 10, 14, 16 Uhr) als Zeiträume je Tag.
 * Aufeinanderfolgende Zeiten im gleichen Abstand werden ein Zeitraum.
 */
export function scheduleFromTimes(lt: LeadTimes): WeekSchedule {
  if (lt.schedule) return lt.schedule;
  const dur = normalizeDuration(lt.durationMin);
  const mins = [...lt.times].sort().map(toMinutes);
  const diffs = mins.slice(1).map((m, i) => m - mins[i]);
  const counts = new Map<number, number>();
  diffs.forEach((d) => counts.set(d, (counts.get(d) ?? 0) + 1));
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const step = common && (START_STEPS as readonly number[]).includes(common) ? common : DEFAULT_STEP;
  const ranges: DayRange[] = [];
  for (let i = 0; i < mins.length; ) {
    let j = i;
    while (j + 1 < mins.length && mins[j + 1] - mins[j] === step) j++;
    ranges.push([fromMinutes(mins[i]), fromMinutes(Math.min(mins[j] + dur, 1440))]);
    i = j + 1;
  }
  const days: Record<number, DayRange[]> = {};
  for (const d of lt.weekdays) days[d] = ranges.map((r) => [r[0], r[1]] as DayRange);
  return { step, days };
}

/** Wählbare Termindauern (Minuten). */
export const APPOINTMENT_DURATIONS = [15, 30, 45, 60] as const;
export const DEFAULT_DURATION_MIN = 30;

/** Ungültige Dauer → Standard 30 Minuten. */
export function normalizeDuration(raw: unknown): number {
  const n = Number(raw);
  return (APPOINTMENT_DURATIONS as readonly number[]).includes(n) ? n : DEFAULT_DURATION_MIN;
}

export const DEFAULT_LEAD_TIMES: LeadTimes = { weekdays: [1, 2, 3, 4, 5], times: ["10:00", "14:00", "16:00"], durationMin: DEFAULT_DURATION_MIN };

/**
 * Startzeiten im festen Raster („alle 30 Min. von 9 bis 17 Uhr“): erste Zeit = von,
 * letzte so, dass ein Termin dieser Schrittweite bis „bis“ endet.
 */
export function timeGrid(stepMin: number, from = "09:00", to = "17:00"): string[] {
  const f = normalizeTime(from);
  const t = normalizeTime(to);
  if (!f || !t || !(stepMin >= 5)) return [];
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const out: string[] = [];
  for (let m = toMin(f); m + stepMin <= toMin(t) && out.length < 96; m += stepMin) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

export const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "9:5" / "09:00" / "9" → "09:00"; ungültig → null. Nur volle 5-Minuten. */
export function normalizeTime(raw: string): string | null {
  const m = String(raw).trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59 || min % 5 !== 0) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Eingaben bereinigen: gültige Tage/Zeiten, sortiert, ohne Doppelte. */
export function normalizeLeadTimes(input: { weekdays: unknown[]; times: unknown[] }): LeadTimes {
  const weekdays = [...new Set(input.weekdays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  const times = [...new Set(input.times.map((t) => normalizeTime(String(t))).filter((t): t is string => !!t))].sort();
  return { weekdays, times: times.slice(0, 24) };
}

/** Prüft eine Einstellung; Fehlertext für die Oberfläche oder null. */
export function leadTimesError(lt: LeadTimes): string | null {
  if (lt.schedule && lt.times.length === 0) return "Bitte mindestens einen Tag mit Uhrzeiten angeben (der Zeitraum muss mindestens so lang wie ein Termin sein).";
  if (lt.weekdays.length === 0) return "Bitte mindestens einen Wochentag wählen.";
  if (lt.times.length === 0) return "Bitte mindestens eine Uhrzeit wählen.";
  return null;
}

/** Lead-Zeiten eines Kalender-Schlüssels (ohne Eintrag: Standard). */
export async function loadLeadTimes(calendarKey: string): Promise<LeadTimes> {
  const row = await prisma.calendarLeadTimes.findUnique({ where: { calendarKey } });
  if (!row) return DEFAULT_LEAD_TIMES;
  const durationMin = normalizeDuration(row.durationMin);
  const parsed = parseSchedule(row.schedule);
  if (parsed && "schedule" in parsed) {
    const lt = leadTimesFromSchedule(parsed.schedule, durationMin);
    if (lt.times.length) return lt;
  }
  if (row.weekdays.length === 0 || row.times.length === 0) return { ...DEFAULT_LEAD_TIMES, durationMin };
  return { weekdays: row.weekdays, times: row.times, durationMin };
}

/** Eingestellte Termindauer eines Kalender-Schlüssels, null ohne Eintrag. */
export async function durationForKey(calendarKey: string): Promise<number | null> {
  const row = await prisma.calendarLeadTimes.findUnique({ where: { calendarKey }, select: { durationMin: true } });
  return row ? normalizeDuration(row.durationMin) : null;
}

export async function saveLeadTimes(customerId: string, calendarKey: string, lt: LeadTimes): Promise<void> {
  const durationMin = normalizeDuration(lt.durationMin);
  const schedule = lt.schedule ? (lt.schedule as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
  await prisma.calendarLeadTimes.upsert({
    where: { calendarKey },
    create: { calendarKey, customerId, weekdays: lt.weekdays, times: lt.times, durationMin, schedule },
    update: { weekdays: lt.weekdays, times: lt.times, durationMin, schedule },
  });
}

/**
 * UTC-Zeitpunkt einer Berliner Wanduhrzeit an einem Kalendertag (YYYY-MM-DD,
 * "HH:MM"). Berücksichtigt Sommer-/Winterzeit am Zieltag.
 */
export function berlinAt(ymd: string, hhmm: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const wall = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(new Date(guess));
  const g = (t: string) => Number(wall.find((x) => x.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return new Date(guess - (asUtc - guess));
}

/**
 * Zeitfenster der Lead-Zeiten zwischen min und max (je Zeit `lengthMin`
 * Minuten). Für Tage, an denen keine echte Verfügbarkeit bekannt ist
 * (z. B. vor dem frühesten Buchungstag des Allianz-Online-Kalenders).
 */
export function leadTimeWindows(lt: LeadTimes, min: Date, max: Date, lengthMin: number): Busy[] {
  const out: Busy[] = [];
  const last = berlinYmd(max);
  for (let ymd = berlinYmd(min), i = 0; ymd <= last && i < 400; ymd = addDaysYmd(ymd, 1), i++) {
    for (const t of timesForDay(lt, weekdayOfYmd(ymd))) {
      const start = berlinAt(ymd, t);
      const end = new Date(start.getTime() + lengthMin * 60000);
      if (end > min && start < max) out.push({ start, end });
    }
  }
  return out;
}

/** Blockierte Zeiträume eines Kalender-Schlüssels im Fenster [min, max). */
export async function calendarBlocksBusy(calendarKey: string, min: Date, max: Date): Promise<Busy[]> {
  const rows = await prisma.calendarBlock.findMany({
    where: { calendarKey, startsAt: { lt: max }, endsAt: { gt: min } },
    select: { startsAt: true, endsAt: true },
  });
  return rows.map((r) => ({ start: r.startsAt, end: r.endsAt }));
}

/** Datum + von–bis (Berliner Zeit) → Zeitraum; Fehlertext bei ungültiger Eingabe. */
export function blockRange(ymd: string, from: string, to: string): { startsAt: Date; endsAt: Date } | { error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return { error: "Bitte ein Datum wählen." };
  const f = normalizeTime(from);
  const t = normalizeTime(to);
  if (!f || !t || !TIME_RE.test(f) || !TIME_RE.test(t)) return { error: "Bitte von und bis als Uhrzeit angeben." };
  const startsAt = berlinAt(ymd, f);
  const endsAt = berlinAt(ymd, t);
  if (endsAt <= startsAt) return { error: "Das Ende muss nach dem Beginn liegen." };
  return { startsAt, endsAt };
}
