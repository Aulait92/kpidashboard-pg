// Feste Lead-Zeiten („Wann dürfen Leads Termine buchen?") und „Zeit blockieren".
//
// Lead-Zeiten gelten je Kalender-Schlüssel (customerId = Agentur-Kalender,
// user:<id> = eigener Kalender eines Beraters). Ohne Einstellung gilt wie
// bisher Mo–Fr 10, 14 und 16 Uhr. Der Assistent schlägt nur diese Zeiten vor;
// blockierte Zeiträume zählen überall als belegt.

import { prisma } from "@/lib/prisma";
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
};

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
  if (lt.weekdays.length === 0) return "Bitte mindestens einen Wochentag wählen.";
  if (lt.times.length === 0) return "Bitte mindestens eine Uhrzeit wählen.";
  return null;
}

/** Lead-Zeiten eines Kalender-Schlüssels (ohne Eintrag: Standard). */
export async function loadLeadTimes(calendarKey: string): Promise<LeadTimes> {
  const row = await prisma.calendarLeadTimes.findUnique({ where: { calendarKey } });
  if (!row) return DEFAULT_LEAD_TIMES;
  const durationMin = normalizeDuration(row.durationMin);
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
  await prisma.calendarLeadTimes.upsert({
    where: { calendarKey },
    create: { calendarKey, customerId, weekdays: lt.weekdays, times: lt.times, durationMin },
    update: { weekdays: lt.weekdays, times: lt.times, durationMin },
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
    if (!lt.weekdays.includes(weekdayOfYmd(ymd))) continue;
    for (const t of lt.times) {
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
